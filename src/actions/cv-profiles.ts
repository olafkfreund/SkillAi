'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { getActionContext } from '@/lib/auth/action-context'
import { triggerCvProfileExtraction } from '@/lib/ai/cv-profile'

/**
 * Re-run the AI extraction of a candidate's CV profile.
 * Used from the candidate detail page when extraction failed or
 * the CV was updated.
 */
export async function reextractCvProfile(
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

  // Verify candidate exists in this tenant
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  )
  if (!candidate) return { success: false, error: 'Candidate not found' }

  // Fire the extraction — it upserts, so existing row is replaced
  triggerCvProfileExtraction(candidateId, tenantId).catch((err) => {
    console.error('[cv-profile] Re-extraction failed:', err)
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}
