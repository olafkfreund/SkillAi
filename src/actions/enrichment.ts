'use server'

import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicKey } from '@/lib/ai/keys'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, candidateEnrichments, cvProfiles } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { logAiUsage, anthropicUsageToInput } from '@/lib/ai/usage-logger'
import {
  verifyProfilesAgainstCv,
  type CvSignals,
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

// ─── Brave Search ─────────────────────────────────────────────────────────────

async function braveSearch(query: string): Promise<WebHit[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '10')
  url.searchParams.set('search_lang', 'en')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) return []
  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string }> }
  }
  const results = data.web?.results ?? []

  return results.map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    description: r.description ?? '',
    source: classifySource(r.url ?? ''),
  }))
}

function classifySource(url: string): string {
  if (url.includes('linkedin.com')) return 'linkedin'
  if (url.includes('github.com')) return 'github'
  if (url.includes('reddit.com')) return 'reddit'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter'
  if (url.includes('facebook.com')) return 'facebook'
  if (url.includes('stackoverflow.com')) return 'stackoverflow'
  if (url.includes('medium.com')) return 'medium'
  if (url.includes('dev.to')) return 'devto'
  if (url.includes('youtube.com')) return 'youtube'
  return 'web'
}

/**
 * Map the loose WebHit.source string to the strict ProfileCandidate.source
 * enum used by the AI matcher and the persisted VerifiedProfile.
 *
 * Returns null for sources we don't verify (reddit/twitter/facebook/youtube).
 */
function toProfileSource(
  webSource: string,
  url: string
): ProfileCandidate['source'] | null {
  if (webSource === 'linkedin') return 'linkedin'
  if (webSource === 'github') return 'github'
  if (webSource === 'stackoverflow') return 'stack_overflow'
  if (webSource === 'devto') return 'devto'
  if (webSource === 'medium') return 'medium'
  if (webSource === 'web') {
    // 'web' bucket holds personal-site hits; nothing else from search lands here
    // unless it failed every classifier — treat as personal site candidate.
    return 'personal'
  }
  // reddit / twitter / facebook / youtube etc. — not a profile we verify
  void url
  return null
}

// ─── HTTP utilities ───────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 200 * 1024

/**
 * fetch() with a hard 10s timeout via AbortController.
 * Always resolves — never throws — so callers can null-check the result.
 */
async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read at most MAX_HTML_BYTES of a Response body as text.
 * Prevents OOM on hostile/oversized pages.
 */
async function readCappedText(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let received = 0
  let out = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    out += decoder.decode(value, { stream: true })
    if (received >= MAX_HTML_BYTES) {
      try { await reader.cancel() } catch {}
      break
    }
  }
  out += decoder.decode()
  return out
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function fetchGitHubProfile(username: string): Promise<GitHubProfile | null> {
  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=5&type=owner`,
        { headers }
      ),
    ])

    if (!userRes.ok) return null
    const user = await userRes.json() as {
      login: string; name: string | null; bio: string | null
      avatar_url: string; html_url: string; public_repos: number; followers: number
    }

    const repos: Array<{ name: string; description: string | null; stargazers_count: number; language: string | null; html_url: string }> =
      reposRes.ok ? await reposRes.json() : []

    return {
      login: user.login,
      name: user.name,
      bio: user.bio,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      publicRepos: user.public_repos,
      followers: user.followers,
      topRepos: repos.map((r) => ({
        name: r.name,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
        url: r.html_url,
      })),
    }
  } catch {
    return null
  }
}

// ─── Stack Overflow profile fetcher ───────────────────────────────────────────

const SO_URL_RE = /^https?:\/\/(?:[a-z]+\.)?stackoverflow\.com\/users\/(\d+)\/([^/?#]+)/i

async function fetchStackOverflowProfile(url: string): Promise<StackOverflowProfile | null> {
  const m = SO_URL_RE.exec(url)
  if (!m) return null
  const slug = m[2]

  const res = await timedFetch(url, {
    headers: { 'User-Agent': 'SkillAI-Enrichment/1.0' },
  })
  if (!res || !res.ok) return null

  let html: string
  try {
    html = await readCappedText(res)
  } catch {
    return null
  }

  // Username — prefer the visible display name in the profile header, fall
  // back to the URL slug.
  const nameMatch =
    /<div[^>]*class="[^"]*\bgrid--cell\b[^"]*"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>/i.exec(html) ||
    /<title>([^<]+?)\s*-\s*Stack Overflow<\/title>/i.exec(html)
  const username = (nameMatch?.[1]?.trim() || slug.replace(/-/g, ' ')).slice(0, 100)

  // Reputation — visible as a number with comma thousand separators.
  let reputation = 0
  const repMatch =
    /class="[^"]*\breputation\b[^"]*"[^>]*>\s*([\d,]+)/i.exec(html) ||
    /title="reputation"[^>]*>\s*([\d,]+)/i.exec(html) ||
    /([\d,]+)\s*<[^>]*>\s*reputation/i.exec(html)
  if (repMatch) {
    const n = parseInt(repMatch[1].replace(/,/g, ''), 10)
    if (Number.isFinite(n)) reputation = n
  }

  // Top tags — pull all visible tag names; rank by occurrence count and take
  // the top 5. Stack Overflow renders tag names inside <a class="post-tag">tag</a>
  // and inside the "Top Tags" widget.
  const tagCounts = new Map<string, number>()
  const tagRe = /class="[^"]*\bpost-tag\b[^"]*"[^>]*>([^<]+)<\/a>/gi
  let tm: RegExpExecArray | null
  while ((tm = tagRe.exec(html)) !== null) {
    const t = tm[1].trim().toLowerCase()
    if (!t) continue
    tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t)

  return {
    username,
    reputation,
    topTags,
    profileUrl: url,
  }
}

// ─── Personal site summary fetcher ────────────────────────────────────────────

const PERSONAL_SITE_INPUT_CHAR_CAP = 3000

async function fetchPersonalSiteSummary(
  url: string,
  candidateName: string,
  tenantId?: string,
  candidateId?: string
): Promise<PersonalSiteSummary | null> {
  const res = await timedFetch(url, {
    headers: { 'User-Agent': 'SkillAI-Enrichment/1.0' },
  })
  if (!res || !res.ok) return null

  let html: string
  try {
    html = await readCappedText(res)
  } catch {
    return null
  }

  // <title>
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  const title = (titleMatch?.[1]?.trim() || '').slice(0, 200)

  // Strip <script>/<style> blocks then extract visible text.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const visibleText = stripped.slice(0, PERSONAL_SITE_INPUT_CHAR_CAP)

  if (!visibleText) {
    return { url, title, aiSummary: '' }
  }

  let aiSummary = ''
  try {
    let personalSiteApiKey: string
    if (tenantId) {
      personalSiteApiKey = await resolveAnthropicKey(tenantId)
    } else {
      console.warn('[enrichment] no tenantId — falling back to env API key')
      const envKey = process.env.ANTHROPIC_API_KEY
      if (!envKey) throw new Error('No Anthropic API key configured')
      personalSiteApiKey = envKey
    }
    const personalSiteAnthropic = new Anthropic({ apiKey: personalSiteApiKey, maxRetries: 2, timeout: 30_000 })
    const startedAt = Date.now()
    const response = await personalSiteAnthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are summarising a personal/portfolio website that may belong to a candidate named "${candidateName}".

Read the page text below and write 1–2 short sentences describing who this person appears to be (their role, focus, or notable work). If the page clearly is NOT about a person (e.g. a company landing page, a 404, a blog index with no author), say so plainly. Do not speculate beyond what's on the page.

Output the summary text only — no preamble, no markdown, no quotes.

PAGE TITLE: ${title}

PAGE TEXT:
${visibleText}`,
        },
      ],
    })
    if (tenantId) {
      logAiUsage({
        tenantId,
        userId: null,
        operation: 'personal_site_summary',
        model: response.model,
        usage: anthropicUsageToInput(response.usage),
        durationMs: Date.now() - startedAt,
        metadata: { candidateId, url, inputChars: visibleText.length },
      }).catch(() => {})
    }
    const block = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    )
    aiSummary = (block?.text ?? '').trim().slice(0, 500)
  } catch (err) {
    console.error('[enrichment.personal-site] AI summary failed:', err)
    return null
  }

  return { url, title, aiSummary }
}

// ─── CV signal extraction ────────────────────────────────────────────────────

type CandidateRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  githubUsername: string | null
  linkedinUrl: string | null
  city: string | null
  country: string | null
}

type CvProfileLite = {
  technicalSkills: string[] | null
  companies: Array<{ name: string; role: string; keyAchievements: string[] }> | null
}

function buildCvSignalsForMatcher(
  candidate: CandidateRow,
  cvProfile: CvProfileLite | null
): CvSignals {
  const fullName = `${candidate.firstName} ${candidate.lastName}`.trim()
  const location = [candidate.city, candidate.country].filter(Boolean).join(', ')

  const companies = cvProfile?.companies ?? []
  const currentCompany = companies[0]?.name?.trim() || undefined
  const pastCompanies = companies
    .slice(1)
    .map((c) => c?.name?.trim())
    .filter((n): n is string => !!n)

  const topSkills = (cvProfile?.technicalSkills ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
    .slice(0, 10)

  return {
    fullName,
    email: candidate.email ?? undefined,
    currentCompany,
    pastCompanies: pastCompanies.length ? pastCompanies : undefined,
    location: location || undefined,
    topSkills: topSkills.length ? topSkills : undefined,
  }
}

// ─── Deterministic verification ──────────────────────────────────────────────

/**
 * Cheap signal-based verification before falling back to AI.
 * Returns null if no deterministic rule fires; caller will then batch the
 * candidate into an AI verification call.
 */
function deterministicVerify(
  candidate: ProfileCandidate,
  signals: CvSignals
): MatchVerdict | null {
  const blob = `${candidate.url} ${candidate.snippet}`.toLowerCase()
  const fullName = signals.fullName.trim().toLowerCase()
  const email = signals.email?.trim().toLowerCase()
  const location = signals.location?.trim().toLowerCase()
  const currentCompany = signals.currentCompany?.trim().toLowerCase()

  // 1. Email match — strongest possible signal
  if (email && email.length >= 5 && blob.includes(email)) {
    return {
      url: candidate.url,
      confidence: 100,
      category: 'high',
      reason: 'email match in profile',
    }
  }

  const nameInBlob = !!fullName && blob.includes(fullName)

  // 2. GitHub: name + location
  if (
    candidate.source === 'github' &&
    nameInBlob &&
    location &&
    location.length >= 2 &&
    blob.includes(location)
  ) {
    return {
      url: candidate.url,
      confidence: 92,
      category: 'high',
      reason: 'github name+location match',
    }
  }

  // 3. Generic: name + current company
  if (
    nameInBlob &&
    currentCompany &&
    currentCompany.length >= 2 &&
    blob.includes(currentCompany)
  ) {
    return {
      url: candidate.url,
      confidence: 85,
      category: 'high',
      reason: 'name+company match',
    }
  }

  return null
}

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

// ─── Recruiter confirm/dismiss actions ───────────────────────────────────────

export async function confirmProfile(
  candidateId: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { ok: false, error: 'Forbidden' }
  }

  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        verifiedProfiles: candidateEnrichments.verifiedProfiles,
      })
      .from(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))
      .limit(1)
  )
  if (!row) return { ok: false, error: 'No enrichment record' }

  const list: VerifiedProfile[] = Array.isArray(row.verifiedProfiles)
    ? (row.verifiedProfiles as VerifiedProfile[])
    : []
  const idx = list.findIndex((p) => p.url === url)
  if (idx === -1) return { ok: false, error: 'Profile not found in verified list' }

  const verifiedAt = new Date().toISOString()
  const updated: VerifiedProfile = {
    ...list[idx],
    verifiedBy: 'recruiter',
    verifiedAt,
  }
  const next = [...list]
  next[idx] = updated

  await withTenant(tenantId, (tx) =>
    tx
      .update(candidateEnrichments)
      .set({ verifiedProfiles: next })
      .where(eq(candidateEnrichments.candidateId, candidateId))
  )

  await writeAuditLog(tenantId, {
    action: 'candidate.profile_confirmed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { url, source: updated.source, confidence: updated.confidence },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { ok: true }
}

export async function dismissProfile(
  candidateId: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { ok: false, error: 'Forbidden' }
  }

  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        verifiedProfiles: candidateEnrichments.verifiedProfiles,
        rejectedUrls: candidateEnrichments.rejectedUrls,
      })
      .from(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))
      .limit(1)
  )
  if (!row) return { ok: false, error: 'No enrichment record' }

  const verified: VerifiedProfile[] = Array.isArray(row.verifiedProfiles)
    ? (row.verifiedProfiles as VerifiedProfile[])
    : []
  const rejected: RejectedUrl[] = Array.isArray(row.rejectedUrls)
    ? (row.rejectedUrls as RejectedUrl[])
    : []

  const idx = verified.findIndex((p) => p.url === url)
  // Capture source/reason before removal so we can record it on the rejection.
  const removed = idx >= 0 ? verified[idx] : null
  const nextVerified = idx >= 0 ? verified.filter((_, i) => i !== idx) : verified

  // Avoid duplicating an existing rejection.
  const alreadyRejected = rejected.some((r) => r.url === url)
  const nextRejected: RejectedUrl[] = alreadyRejected
    ? rejected
    : [
        ...rejected,
        {
          source: removed?.source ?? 'web',
          url,
          reason: 'dismissed by recruiter',
          rejectedAt: new Date().toISOString(),
        },
      ]

  await withTenant(tenantId, (tx) =>
    tx
      .update(candidateEnrichments)
      .set({ verifiedProfiles: nextVerified, rejectedUrls: nextRejected })
      .where(eq(candidateEnrichments.candidateId, candidateId))
  )

  await writeAuditLog(tenantId, {
    action: 'candidate.profile_dismissed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { url, source: removed?.source ?? 'web' },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { ok: true }
}

export async function updateCandidateLinks(
  candidateId: string,
  linkedinUrl: string | null,
  githubUsername: string | null
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  await withTenant(tenantId, (tx) =>
    tx
      .update(candidates)
      .set({ linkedinUrl, githubUsername })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  )

  return { success: true }
}
