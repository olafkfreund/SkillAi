'use server'

import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { scores } from '@/db/schema'
import { triggerScoring } from '@/lib/ai/scoring'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { getActionContext } from '@/lib/auth/action-context'

export async function rescoreCandidate(
  candidateId: string,
  roleId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Find existing score for this candidate+role pair
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: scores.id })
      .from(scores)
      .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
      .limit(1)
  )

  if (existing) {
    // Reset the existing score back to pending so triggerScoring will re-run it
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(scores)
        .set({
          scoreStatus: 'pending',
          overallScore: null,
          technicalScore: null,
          experienceScore: null,
          culturalFitScore: null,
          communicationScore: null,
          technicalReasoning: null,
          experienceReasoning: null,
          culturalFitReasoning: null,
          communicationReasoning: null,
          aiSummary: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
    })
  } else {
    // No score exists for this role yet — insert a fresh pending record
    await withTenant(tenantId, async (tx) => {
      await tx.insert(scores).values({
        tenantId,
        candidateId,
        roleId,
        scoreStatus: 'pending',
      })
    })
  }

  // Fire-and-forget background scoring (non-blocking)
  triggerScoring(candidateId, roleId, tenantId).catch(console.error)

  return { success: true }
}

export async function removeCandidateFromRole(
  scoreId: string,
  roleId: string
): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(scores)
      .where(and(eq(scores.id, scoreId), eq(scores.tenantId, tenantId)))
  })

  // Audit: score removed
  await writeAuditLog(tenantId, {
    action: 'score.removed',
    entityType: 'score',
    entityId: scoreId,
    metadata: { roleId },
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
}
