'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { withTenant } from '@/db'
import { roleSubmissions } from '@/db/schema/role-submissions'
import { candidates } from '@/db/schema/candidates'
import { roles } from '@/db/schema/roles'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import { type ActionResult, uuidSchema } from './shared'

// ---------------------------------------------------------------------------
// generateShareToken — recruiter-gated
// ---------------------------------------------------------------------------

/**
 * Generates a fresh 32-byte URL-safe share token for a submission, persists it,
 * and returns the token value and the fully-qualified share URL.
 * Re-generation overwrites any existing token (old share links stop working).
 */
export async function generateShareToken(
  submissionId: string
): Promise<ActionResult<{ token: string; url: string }>> {
  const parsed = uuidSchema.safeParse(submissionId)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid ID format' }
  }

  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const validId = parsed.data

  // Load the existing row to verify it belongs to this tenant, capture
  // candidate/role names for the audit label, and detect re-generation.
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roleSubmissions.id,
        roleId: roleSubmissions.roleId,
        candidateId: roleSubmissions.candidateId,
        shareToken: roleSubmissions.shareToken,
      })
      .from(roleSubmissions)
      .where(
        and(
          eq(roleSubmissions.id, validId),
          eq(roleSubmissions.tenantId, tenantId)
        )
      )
      .limit(1)
  )

  if (!existing) return { success: false, error: 'Submission not found' }

  const [candidateRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ firstName: candidates.firstName, lastName: candidates.lastName })
      .from(candidates)
      .where(eq(candidates.id, existing.candidateId))
      .limit(1)
  )

  const [roleRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ title: roles.title })
      .from(roles)
      .where(eq(roles.id, existing.roleId))
      .limit(1)
  )

  const shareToken = crypto.randomBytes(32).toString('base64url')
  const now = new Date()

  await withTenant(tenantId, async (tx) =>
    tx
      .update(roleSubmissions)
      .set({ shareToken, shareTokenCreatedAt: now, updatedAt: now })
      .where(
        and(
          eq(roleSubmissions.id, validId),
          eq(roleSubmissions.tenantId, tenantId)
        )
      )
  )

  const candidateName = candidateRow
    ? `${candidateRow.firstName} ${candidateRow.lastName}`
    : existing.candidateId
  const roleTitle = roleRow?.title ?? existing.roleId

  await writeAuditLog(tenantId, {
    action: 'submission.share_token_generated',
    entityType: 'submission',
    entityId: validId,
    entityLabel: `${candidateName} → ${roleTitle}`,
    metadata: {
      candidateId: existing.candidateId,
      roleId: existing.roleId,
      regenerated: !!existing.shareToken,
    },
  })

  revalidatePath(`/dashboard/roles/${existing.roleId}`)
  revalidatePath('/dashboard/submissions')

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const url = `${appUrl}/share/submission/${shareToken}`

  return { success: true, data: { token: shareToken, url } }
}

// ---------------------------------------------------------------------------
// revokeShareToken — recruiter-gated
// ---------------------------------------------------------------------------

/**
 * Clears the share token from a submission row, invalidating any outstanding
 * share links. Audit-logs the revocation.
 */
export async function revokeShareToken(
  submissionId: string
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(submissionId)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid ID format' }
  }

  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const validId = parsed.data

  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roleSubmissions.id,
        roleId: roleSubmissions.roleId,
        candidateId: roleSubmissions.candidateId,
        shareToken: roleSubmissions.shareToken,
      })
      .from(roleSubmissions)
      .where(
        and(
          eq(roleSubmissions.id, validId),
          eq(roleSubmissions.tenantId, tenantId)
        )
      )
      .limit(1)
  )

  if (!existing) return { success: false, error: 'Submission not found' }

  const [candidateRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ firstName: candidates.firstName, lastName: candidates.lastName })
      .from(candidates)
      .where(eq(candidates.id, existing.candidateId))
      .limit(1)
  )

  const [roleRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ title: roles.title })
      .from(roles)
      .where(eq(roles.id, existing.roleId))
      .limit(1)
  )

  const now = new Date()
  await withTenant(tenantId, async (tx) =>
    tx
      .update(roleSubmissions)
      .set({ shareToken: null, shareTokenCreatedAt: null, updatedAt: now })
      .where(
        and(
          eq(roleSubmissions.id, validId),
          eq(roleSubmissions.tenantId, tenantId)
        )
      )
  )

  const candidateName = candidateRow
    ? `${candidateRow.firstName} ${candidateRow.lastName}`
    : existing.candidateId
  const roleTitle = roleRow?.title ?? existing.roleId

  await writeAuditLog(tenantId, {
    action: 'submission.share_token_revoked',
    entityType: 'submission',
    entityId: validId,
    entityLabel: `${candidateName} → ${roleTitle}`,
    metadata: {
      candidateId: existing.candidateId,
      roleId: existing.roleId,
    },
  })

  revalidatePath(`/dashboard/roles/${existing.roleId}`)
  revalidatePath('/dashboard/submissions')

  return { success: true }
}
