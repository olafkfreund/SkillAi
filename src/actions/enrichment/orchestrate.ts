'use server'

import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, candidateEnrichments, cvProfiles } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'
import { writeAuditLog } from '@/lib/audit'
import {
  verifyProfilesAgainstCv,
  type ProfileCandidate,
  type MatchVerdict,
} from '@/lib/ai/profile-matcher'
import type {
  WebHit,
  GitHubProfile,
  VerifiedProfile,
  RejectedUrl,
  StackOverflowProfile,
  PersonalSiteSummary,
} from '@/db/schema/candidate-enrichments'
import { braveSearch, toProfileSource } from './search'
import { fetchGitHubProfile, fetchStackOverflowProfile, fetchPersonalSiteSummary } from './platforms'
import { buildCvSignalsForMatcher, deterministicVerify } from './matcher'

// ─── Main action ──────────────────────────────────────────────────────────────

export type EnrichmentResult =
  | {
      success: true
      webHits: WebHit[]
      githubProfile: GitHubProfile | null
      verifiedProfiles: VerifiedProfile[]
      rejectedUrls: RejectedUrl[]
      stackOverflowProfile: StackOverflowProfile | null
      personalSiteSummary: PersonalSiteSummary | null
      searchedAt: string
    }
  | { success: false; error: string }

export async function enrichCandidate(candidateId: string): Promise<EnrichmentResult> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  // Load candidate
  const [candidate] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        githubUsername: candidates.githubUsername,
        linkedinUrl: candidates.linkedinUrl,
        city: candidates.city,
        country: candidates.country,
      })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )

  if (!candidate) return { success: false, error: 'Candidate not found' }

  // Audit: enrichment triggered
  await writeAuditLog(tenantId, {
    action: 'candidate.enrichment_triggered',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { source: 'manual' },
  })

  // Load existing enrichment row (for rejectedUrls — never re-suggest dismissed profiles)
  const [existingEnrichment] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        rejectedUrls: candidateEnrichments.rejectedUrls,
        verifiedProfiles: candidateEnrichments.verifiedProfiles,
      })
      .from(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))
      .limit(1)
  )

  const previouslyRejected: RejectedUrl[] = Array.isArray(existingEnrichment?.rejectedUrls)
    ? (existingEnrichment!.rejectedUrls as RejectedUrl[])
    : []
  const previouslyRejectedUrlSet = new Set(previouslyRejected.map((r) => r.url))

  // Load CV profile (best effort — fall back to fewer signals if absent)
  const [cvProfileRow] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        technicalSkills: cvProfiles.technicalSkills,
        companies: cvProfiles.companies,
      })
      .from(cvProfiles)
      .where(eq(cvProfiles.candidateId, candidateId))
      .limit(1)
  )

  const signals = buildCvSignalsForMatcher(
    candidate,
    cvProfileRow
      ? {
          technicalSkills: cvProfileRow.technicalSkills ?? null,
          companies: cvProfileRow.companies ?? null,
        }
      : null
  )

  const fullName = signals.fullName
  const currentCompany = signals.currentCompany ?? ''
  const currentRole =
    cvProfileRow?.companies?.[0]?.role?.trim() || 'engineer'

  // Run all platform searches in parallel (existing 4 + new 4)
  const [
    generalHits,
    linkedinHits,
    githubHits,
    githubProfile,
    stackOverflowHits,
    devtoHits,
    mediumHits,
    personalSiteHits,
  ] = await Promise.all([
    braveSearch(`"${fullName}" developer engineer programmer`),
    candidate.linkedinUrl
      ? braveSearch(`site:linkedin.com "${fullName}"`)
      : braveSearch(`site:linkedin.com/in "${fullName}"`),
    candidate.githubUsername
      ? Promise.resolve<WebHit[]>([])
      : braveSearch(`site:github.com "${fullName}"`),
    candidate.githubUsername
      ? fetchGitHubProfile(candidate.githubUsername)
      : Promise.resolve(null),
    braveSearch(`site:stackoverflow.com/users "${fullName}"`),
    braveSearch(`site:dev.to "${fullName}" "${currentCompany}"`),
    braveSearch(`site:medium.com "${fullName}" "${currentCompany}"`),
    braveSearch(`"${fullName}" "${currentCompany}" "${currentRole}"`),
  ])

  // Dedupe ALL hits by URL globally
  const allHitsRaw = [
    ...linkedinHits,
    ...githubHits,
    ...stackOverflowHits,
    ...devtoHits,
    ...mediumHits,
    ...personalSiteHits,
    ...generalHits,
  ]
  const seen = new Set<string>()
  const allHits: WebHit[] = []
  for (const hit of allHitsRaw) {
    if (!hit.url) continue
    if (seen.has(hit.url)) continue
    if (previouslyRejectedUrlSet.has(hit.url)) continue
    seen.add(hit.url)
    allHits.push(hit)
  }

  // Build profile candidates per source for verification.
  // Group by ProfileCandidate.source enum.
  const grouped = new Map<ProfileCandidate['source'], ProfileCandidate[]>()
  for (const hit of allHits) {
    const profSource = toProfileSource(hit.source, hit.url)
    if (!profSource) continue // skip non-verifiable sources (reddit/twitter/etc.)
    const snippet = `${hit.title} — ${hit.description}`.slice(0, 800)
    const list = grouped.get(profSource) ?? []
    list.push({ url: hit.url, snippet, source: profSource })
    grouped.set(profSource, list)
  }

  // For each platform group: deterministic-first, then batch AI for the rest.
  const allVerdicts: MatchVerdict[] = []
  const verdictSourceByUrl = new Map<string, ProfileCandidate['source']>()

  for (const [profSource, candidatesInGroup] of grouped) {
    const undecided: ProfileCandidate[] = []
    for (const cand of candidatesInGroup) {
      verdictSourceByUrl.set(cand.url, profSource)
      const det = deterministicVerify(cand, signals)
      if (det) {
        allVerdicts.push(det)
      } else {
        undecided.push(cand)
      }
    }

    if (undecided.length > 0) {
      try {
        const aiVerdicts = await verifyProfilesAgainstCv(signals, undecided, tenantId, candidateId)
        allVerdicts.push(...aiVerdicts)
      } catch (err) {
        console.error(
          `[enrichment] AI verification failed for source=${profSource}:`,
          err
        )
        // On AI failure, conservatively skip these — they will neither be
        // verified nor explicitly rejected. They remain in webHits.
      }
    }
  }

  // Build verifiedProfiles + rejectedUrls from verdicts.
  const verifiedAt = new Date().toISOString()
  const verifiedProfiles: VerifiedProfile[] = []
  const newRejectedUrls: RejectedUrl[] = []

  for (const v of allVerdicts) {
    const profSource = verdictSourceByUrl.get(v.url)
    if (!profSource) continue

    if (v.confidence >= 60) {
      // high or medium → include as verified
      verifiedProfiles.push({
        source: profSource,
        url: v.url,
        confidence: v.confidence,
        category: v.category,
        reason: v.reason,
        verifiedBy: 'auto',
        verifiedAt,
      })
    } else if (v.confidence < 40) {
      // not_match → reject permanently
      newRejectedUrls.push({
        source: profSource,
        url: v.url,
        reason: v.reason,
        rejectedAt: verifiedAt,
      })
    } else {
      // 40 ≤ confidence < 60 — low. Include but flag for explicit recruiter confirmation.
      verifiedProfiles.push({
        source: profSource,
        url: v.url,
        confidence: v.confidence,
        category: v.category,
        reason: v.reason,
        verifiedBy: 'auto',
        verifiedAt,
      })
    }
  }

  // Stack Overflow: if a verified SO profile exists, fetch full profile data.
  const verifiedSo = verifiedProfiles.find((p) => p.source === 'stack_overflow')
  let stackOverflowProfile: StackOverflowProfile | null = null
  if (verifiedSo) {
    stackOverflowProfile = await fetchStackOverflowProfile(verifiedSo.url)
  }

  // Personal site: pick the highest-confidence verified personal entry and summarise.
  const verifiedPersonal = verifiedProfiles
    .filter((p) => p.source === 'personal')
    .sort((a, b) => b.confidence - a.confidence)[0]
  let personalSiteSummary: PersonalSiteSummary | null = null
  if (verifiedPersonal) {
    personalSiteSummary = await fetchPersonalSiteSummary(verifiedPersonal.url, fullName, tenantId, candidateId)
  }

  // Merge previouslyRejected with new rejections (dedupe by URL)
  const mergedRejectedMap = new Map<string, RejectedUrl>()
  for (const r of previouslyRejected) mergedRejectedMap.set(r.url, r)
  for (const r of newRejectedUrls) mergedRejectedMap.set(r.url, r)
  const mergedRejected = [...mergedRejectedMap.values()]

  const now = new Date()

  await withTenant(tenantId, (tx) =>
    tx
      .insert(candidateEnrichments)
      .values({
        tenantId,
        candidateId,
        webHits: allHits,
        githubProfile: githubProfile ?? null,
        verifiedProfiles,
        rejectedUrls: mergedRejected,
        stackOverflowProfile: stackOverflowProfile ?? null,
        devtoProfile: null,
        personalSiteSummary: personalSiteSummary ?? null,
        searchedAt: now,
      })
      .onConflictDoUpdate({
        target: candidateEnrichments.candidateId,
        set: {
          webHits: allHits,
          githubProfile: githubProfile ?? null,
          verifiedProfiles,
          rejectedUrls: mergedRejected,
          stackOverflowProfile: stackOverflowProfile ?? null,
          personalSiteSummary: personalSiteSummary ?? null,
          searchedAt: now,
        },
      })
  )

  // Audit: enrichment completed
  await writeAuditLog(tenantId, {
    action: 'candidate.enrichment_completed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: {
      verifiedCount: verifiedProfiles.length,
      rejectedCount: newRejectedUrls.length,
    },
  })

  return {
    success: true,
    webHits: allHits,
    githubProfile,
    verifiedProfiles,
    rejectedUrls: mergedRejected,
    stackOverflowProfile,
    personalSiteSummary,
    searchedAt: now.toISOString(),
  }
}
