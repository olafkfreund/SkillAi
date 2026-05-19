'use server'

import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'

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
