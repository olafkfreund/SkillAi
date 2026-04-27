/**
 * CV Profile extraction with persistence
 *
 * - triggerCvProfileExtraction: fire-and-forget background extraction after
 *   candidate upload. Writes result to cv_profiles table with status tracking.
 * - getOrExtractCvProfile: cached lookup for interview pack generation —
 *   returns existing complete profile, or extracts fresh if missing.
 */

import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, cvProfiles } from '@/db/schema'
import { extractCvProfile } from './interview'
import type { CvProfile } from './interview-schemas'

const AI_MODEL = 'claude-haiku-4-5-20251001'

type DbProfile = typeof cvProfiles.$inferSelect

/**
 * Map a DB row (snake-ish Drizzle type) to the CvProfile shape
 * that interview pack generation consumes.
 */
function dbProfileToCvProfile(row: DbProfile): CvProfile {
  return {
    experience_level: (row.experienceLevel as CvProfile['experience_level']) ?? undefined,
    summary: row.summary ?? undefined,
    companies: (row.companies ?? []).map((c) => ({
      name: c.name,
      role: c.role,
      key_achievements: c.keyAchievements,
    })),
    technical_skills: row.technicalSkills ?? [],
    personalizable_moments: row.personalizableMoments ?? [],
  }
}

/**
 * Persist an extracted profile (upsert on candidate_id).
 */
async function saveProfile(
  tenantId: string,
  candidateId: string,
  profile: CvProfile,
  status: 'complete' | 'failed',
  errorMessage?: string
) {
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(cvProfiles)
      .values({
        tenantId,
        candidateId,
        experienceLevel: profile.experience_level ?? null,
        summary: profile.summary ?? null,
        technicalSkills: profile.technical_skills,
        companies: profile.companies.map((c) => ({
          name: c.name,
          role: c.role,
          keyAchievements: c.key_achievements,
        })),
        personalizableMoments: profile.personalizable_moments,
        extractionStatus: status,
        errorMessage: errorMessage ?? null,
        aiModel: AI_MODEL,
        extractedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: cvProfiles.candidateId,
        set: {
          experienceLevel: profile.experience_level ?? null,
          summary: profile.summary ?? null,
          technicalSkills: profile.technical_skills,
          companies: profile.companies.map((c) => ({
            name: c.name,
            role: c.role,
            keyAchievements: c.key_achievements,
          })),
          personalizableMoments: profile.personalizable_moments,
          extractionStatus: status,
          errorMessage: errorMessage ?? null,
          aiModel: AI_MODEL,
          extractedAt: new Date(),
        },
      })
  })
}

async function markStatus(
  tenantId: string,
  candidateId: string,
  status: 'pending' | 'processing' | 'failed',
  errorMessage?: string
) {
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(cvProfiles)
      .values({
        tenantId,
        candidateId,
        extractionStatus: status,
        errorMessage: errorMessage ?? null,
      })
      .onConflictDoUpdate({
        target: cvProfiles.candidateId,
        set: {
          extractionStatus: status,
          errorMessage: errorMessage ?? null,
        },
      })
  })
}

/**
 * Fire-and-forget extraction. Returns immediately; the result is written to
 * cv_profiles. Callers should not await the inner work — the caller should
 * await markStatus('processing') and then kick off the background task.
 */
export async function triggerCvProfileExtraction(
  candidateId: string,
  tenantId: string
): Promise<void> {
  // Set processing status synchronously so the UI can show "extracting…"
  await markStatus(tenantId, candidateId, 'processing')

  try {
    const [candidate] = await withTenant(tenantId, async (tx) =>
      tx.select({ cvText: candidates.cvText }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
    )
    if (!candidate?.cvText) {
      await markStatus(tenantId, candidateId, 'failed', 'Candidate has no cvText')
      return
    }

    const profile = await extractCvProfile(candidate.cvText, tenantId, candidateId)
    await saveProfile(tenantId, candidateId, profile, 'complete')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await markStatus(tenantId, candidateId, 'failed', message)
    console.error(`[cv-profile] extraction failed for ${candidateId}:`, message)
  }
}

/**
 * Used by interview pack generation — returns cached profile if `complete`,
 * otherwise extracts fresh, persists, and returns. Saves one Claude call
 * whenever a pack is re-generated or a second pack is made.
 */
export async function getOrExtractCvProfile(
  candidateId: string,
  tenantId: string,
  cvText: string
): Promise<CvProfile> {
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx.select().from(cvProfiles).where(eq(cvProfiles.candidateId, candidateId)).limit(1)
  )

  if (existing?.extractionStatus === 'complete') {
    console.log(`[cv-profile] using cached profile for ${candidateId}`)
    return dbProfileToCvProfile(existing)
  }

  console.log(`[cv-profile] no cached profile for ${candidateId}, extracting…`)
  const profile = await extractCvProfile(cvText, tenantId, candidateId)
  await saveProfile(tenantId, candidateId, profile, 'complete')
  return profile
}
