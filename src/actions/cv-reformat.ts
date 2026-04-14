'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { getActionContext } from '@/lib/auth/action-context'
import { triggerCvReformat } from '@/lib/ai/cv-reformat'

/**
 * Reformat a candidate's raw CV text into clean markdown via Claude Haiku
 * and persist to the cvTextFormatted column. Used by the candidate detail
 * page when the recruiter clicks "Reformat with AI".
 */
export async function reformatCv(
  candidateId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden' }
  }

  // Verify candidate belongs to this tenant
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  )
  if (!candidate) return { success: false, error: 'Candidate not found' }

  try {
    await triggerCvReformat(candidateId, tenantId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[cv-reformat] failed for ${candidateId}:`, message)
    return { success: false, error: message }
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}
