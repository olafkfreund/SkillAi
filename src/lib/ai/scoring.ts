/**
 * triggerScoring — fire-and-forget AI scoring pipeline
 *
 * Called after a candidate is uploaded. Runs in the background
 * (not awaited by the createCandidate server action).
 *
 * Flow:
 *  1. Set score_status = 'processing'
 *  2. Fetch candidate + role data
 *  3. Call Claude scoring API
 *  4. Write results back to scores table
 *  5. On error: set score_status = 'failed' + error_message
 */

import { eq, and } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { candidates, roles, scores } from '@/db/schema'
import { scoreCandidateWithClaude } from './claude'

export async function triggerScoring(
  candidateId: string,
  roleId: string,
  tenantId: string
): Promise<void> {
  // Mark as processing
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(scores)
      .set({ scoreStatus: 'processing', updatedAt: new Date() })
      .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
  })

  try {
    // Fetch candidate and role
    const [candidate] = await withTenant(tenantId, async (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1)
    )
    const [role] = await withTenant(tenantId, async (tx) =>
      tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    )

    if (!candidate || !role) {
      throw new Error('Candidate or role not found')
    }

    // Run Claude scoring
    const result = await scoreCandidateWithClaude({
      roleTitle: role.title,
      roleDescription: role.description,
      roleRequirements: role.requirements,
      cvText: candidate.cvText,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
    })

    // Write results
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(scores)
        .set({
          scoreStatus: 'complete',
          overallScore: result.overall_score,
          technicalScore: result.dimensions.technical_skills.score,
          experienceScore: result.dimensions.experience_level.score,
          culturalFitScore: result.dimensions.cultural_fit.score,
          communicationScore: result.dimensions.communication.score,
          technicalReasoning: result.dimensions.technical_skills.reasoning,
          experienceReasoning: result.dimensions.experience_level.reasoning,
          culturalFitReasoning: result.dimensions.cultural_fit.reasoning,
          communicationReasoning: result.dimensions.communication.reasoning,
          aiSummary: result.summary,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(scores)
        .set({ scoreStatus: 'failed', errorMessage: message, updatedAt: new Date() })
        .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
    })
    console.error(`Scoring failed for candidate ${candidateId}:`, message)
  }
}
