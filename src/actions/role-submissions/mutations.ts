'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, inArray } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roleSubmissions, type SubmissionStatus } from '@/db/schema/role-submissions'
import { candidates } from '@/db/schema/candidates'
import { roles } from '@/db/schema/roles'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import {
  type ActionResult,
  submitCandidatesSchema,
  updateStatusSchema,
  removeSubmissionSchema,
} from './shared'

// ---------------------------------------------------------------------------
// submitCandidatesToCustomer
// ---------------------------------------------------------------------------

/**
 * Bulk-submits one or more candidates for a role to the customer.
 * Re-submitting an already-submitted candidate is a no-op (onConflictDoNothing).
 * One audit entry is written per actually-inserted row so the audit trail
 * reflects only net-new submissions, not idempotent replays.
 */
export async function submitCandidatesToCustomer(
  roleId: string,
  candidateIds: string[],
  notes?: string
): Promise<ActionResult<{ inserted: number }>> {
  const parsed = submitCandidatesSchema.safeParse({ roleId, candidateIds, notes })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const { roleId: validRoleId, candidateIds: validCandidateIds, notes: validNotes } = parsed.data

  // Load candidate names for audit labels in a single query
  const candidateRows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
      })
      .from(candidates)
      .where(
        and(
          inArray(candidates.id, validCandidateIds),
          eq(candidates.tenantId, tenantId)
        )
      )
  )

  const candidateMap = new Map(
    candidateRows.map((c) => [c.id, { firstName: c.firstName, lastName: c.lastName }])
  )

  const now = new Date()
  const rows = validCandidateIds.map((candidateId) => ({
    tenantId,
    roleId: validRoleId,
    candidateId,
    sentAt: now,
    sentByUserId: userId || null,
    status: 'submitted' as const,
    statusUpdatedAt: now,
    notes: validNotes ?? null,
  }))

  const inserted = await withTenant(tenantId, async (tx) => {
    const result = await tx
      .insert(roleSubmissions)
      .values(rows)
      .onConflictDoNothing({
        target: [
          roleSubmissions.tenantId,
          roleSubmissions.roleId,
          roleSubmissions.candidateId,
        ],
      })
      .returning({
        id: roleSubmissions.id,
        candidateId: roleSubmissions.candidateId,
      })
    return result
  })

  // Audit one entry per actually-inserted row
  for (const row of inserted) {
    const candidate = candidateMap.get(row.candidateId)
    await writeAuditLog(tenantId, {
      action: 'candidate.submitted_to_customer',
      entityType: 'candidate',
      entityId: row.candidateId,
      entityLabel: candidate
        ? `${candidate.firstName} ${candidate.lastName}`
        : row.candidateId,
      metadata: {
        roleId: validRoleId,
        submissionId: row.id,
        hasNotes: !!validNotes,
      },
    })
  }

  revalidatePath(`/dashboard/roles/${validRoleId}`)
  revalidatePath('/dashboard')

  return { success: true, data: { inserted: inserted.length } }
}

// ---------------------------------------------------------------------------
// updateSubmissionStatus
// ---------------------------------------------------------------------------

/**
 * Updates the status of a single submission row.
 * When notes are provided they replace the existing notes value — the caller
 * is responsible for preserving previous content if append semantics are needed.
 */
export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
  notes?: string
): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse({ submissionId, status, notes })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const { submissionId: validId, status: validStatus, notes: validNotes } = parsed.data

  // Load the existing row so we have the from-status, candidateId, and roleId
  // for the audit entry, and to confirm the row exists in this tenant.
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roleSubmissions.id,
        status: roleSubmissions.status,
        roleId: roleSubmissions.roleId,
        candidateId: roleSubmissions.candidateId,
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

  // Load candidate name for the audit label
  const [candidateRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ firstName: candidates.firstName, lastName: candidates.lastName })
      .from(candidates)
      .where(eq(candidates.id, existing.candidateId))
      .limit(1)
  )

  // Load role title for the audit label
  const [roleRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ title: roles.title })
      .from(roles)
      .where(eq(roles.id, existing.roleId))
      .limit(1)
  )

  const updateValues: Record<string, unknown> = {
    status: validStatus,
    statusUpdatedAt: new Date(),
    updatedAt: new Date(),
  }
  if (validNotes !== undefined) {
    updateValues.notes = validNotes
  }

  await withTenant(tenantId, async (tx) =>
    tx
      .update(roleSubmissions)
      .set(updateValues)
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
    action: 'submission.status_changed',
    entityType: 'submission',
    entityId: validId,
    entityLabel: `${candidateName} → ${roleTitle}`,
    metadata: {
      from: existing.status,
      to: validStatus,
      candidateId: existing.candidateId,
      roleId: existing.roleId,
    },
  })

  revalidatePath(`/dashboard/roles/${existing.roleId}`)
  revalidatePath('/dashboard')

  return { success: true }
}

// ---------------------------------------------------------------------------
// removeSubmission
// ---------------------------------------------------------------------------

/**
 * Hard-deletes a submission row. This is a recruiter "change of mind" action —
 * not a GDPR deletion. For GDPR cascades, roleSubmissions rows are handled by
 * the explicit-deletes list in src/actions/gdpr.ts (per DEC-011).
 */
export async function removeSubmission(
  submissionId: string
): Promise<ActionResult> {
  const parsed = removeSubmissionSchema.safeParse({ submissionId })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const { submissionId: validId } = parsed.data

  // Load the row before deletion for the audit entry
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roleSubmissions.id,
        candidateId: roleSubmissions.candidateId,
        roleId: roleSubmissions.roleId,
        status: roleSubmissions.status,
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

  await withTenant(tenantId, async (tx) =>
    tx
      .delete(roleSubmissions)
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

  await writeAuditLog(tenantId, {
    action: 'candidate.unsubmitted_from_customer',
    entityType: 'candidate',
    entityId: existing.candidateId,
    entityLabel: candidateName,
    metadata: {
      roleId: existing.roleId,
      submissionId: validId,
      lastStatus: existing.status,
    },
  })

  revalidatePath(`/dashboard/roles/${existing.roleId}`)
  revalidatePath('/dashboard')

  return { success: true }
}
