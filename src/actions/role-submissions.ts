'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, inArray, lt, desc } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import { roleSubmissions, type SubmissionStatus } from '@/db/schema/role-submissions'
import { candidates } from '@/db/schema/candidates'
import { agencies } from '@/db/schema/agencies'
import { scores } from '@/db/schema/scores'
import { roles } from '@/db/schema/roles'
import { users } from '@/db/schema/users'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true; data: T })
  | { success: false; error: string }

export type SubmissionWithDetails = {
  id: string
  roleId: string
  candidateId: string
  sentAt: Date
  sentByUserId: string | null
  status: SubmissionStatus
  statusUpdatedAt: Date
  notes: string | null
  createdAt: Date
  candidate: {
    firstName: string
    lastName: string
    agencyId: string | null
    agencyName: string | null
    agencyLogoPath: string | null
    scoreOverall: number | null
  }
  submittedBy: {
    name: string
    email: string
  } | null
}

export type SubmissionForDashboard = {
  id: string
  roleId: string
  roleTitle: string
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  status: SubmissionStatus
  statusUpdatedAt: Date
  sentAt: Date
  notes: string | null
}

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid('Invalid ID format')

const submitCandidatesSchema = z.object({
  roleId: uuidSchema,
  candidateIds: z.array(uuidSchema).min(1, 'At least one candidate required'),
  notes: z.string().max(2000).optional(),
})

const updateStatusSchema = z.object({
  submissionId: uuidSchema,
  status: z.enum([
    'submitted',
    'interview_scheduled',
    'interview_done',
    'feedback_pending',
    'hired',
    'rejected',
    'withdrawn',
  ]),
  notes: z.string().max(2000).optional(),
})

const removeSubmissionSchema = z.object({
  submissionId: uuidSchema,
})

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

// ---------------------------------------------------------------------------
// getSubmissionsForRole — server-only loader
// ---------------------------------------------------------------------------

/**
 * Loads all submissions for a role, joined with candidate details, agency
 * branding, score, and the user who submitted. Sorted by sentAt DESC.
 */
export async function getSubmissionsForRole(
  roleId: string
): Promise<SubmissionWithDetails[]> {
  const parsed = uuidSchema.safeParse(roleId)
  if (!parsed.success) return []

  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId } = ctx

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roleSubmissions.id,
        roleId: roleSubmissions.roleId,
        candidateId: roleSubmissions.candidateId,
        sentAt: roleSubmissions.sentAt,
        sentByUserId: roleSubmissions.sentByUserId,
        status: roleSubmissions.status,
        statusUpdatedAt: roleSubmissions.statusUpdatedAt,
        notes: roleSubmissions.notes,
        createdAt: roleSubmissions.createdAt,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        agencyId: candidates.agencyId,
        agencyName: agencies.name,
        agencyLogoPath: agencies.logoPath,
        scoreOverall: scores.overallScore,
        submitterName: users.name,
        submitterEmail: users.email,
      })
      .from(roleSubmissions)
      .innerJoin(candidates, eq(roleSubmissions.candidateId, candidates.id))
      .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
      .leftJoin(
        scores,
        and(
          eq(scores.candidateId, roleSubmissions.candidateId),
          eq(scores.roleId, roleSubmissions.roleId)
        )
      )
      .leftJoin(users, eq(roleSubmissions.sentByUserId, users.id))
      .where(
        and(
          eq(roleSubmissions.roleId, parsed.data),
          eq(roleSubmissions.tenantId, tenantId)
        )
      )
      .orderBy(desc(roleSubmissions.sentAt))
  )

  return rows.map((r) => ({
    id: r.id,
    roleId: r.roleId,
    candidateId: r.candidateId,
    sentAt: r.sentAt,
    sentByUserId: r.sentByUserId,
    status: r.status as SubmissionStatus,
    statusUpdatedAt: r.statusUpdatedAt,
    notes: r.notes,
    createdAt: r.createdAt,
    candidate: {
      firstName: r.candidateFirstName,
      lastName: r.candidateLastName,
      agencyId: r.agencyId ?? null,
      agencyName: r.agencyName ?? null,
      agencyLogoPath: r.agencyLogoPath ?? null,
      scoreOverall: r.scoreOverall ?? null,
    },
    submittedBy:
      r.submitterName && r.submitterEmail
        ? { name: r.submitterName, email: r.submitterEmail }
        : null,
  }))
}

// ---------------------------------------------------------------------------
// getRecentSubmissionsForTenant — server-only loader for dashboard widget
// ---------------------------------------------------------------------------

const STALE_STATUSES: SubmissionStatus[] = ['submitted', 'interview_scheduled', 'feedback_pending']

/**
 * Returns recent submissions for the tenant, optionally filtered by status.
 * Defaults to open/in-progress statuses. Sorted by statusUpdatedAt DESC.
 * Used by the dashboard widget and the for-you stale-submissions stream.
 */
export async function getRecentSubmissionsForTenant(opts: {
  limit: number
  status?: SubmissionStatus[]
  staleBefore?: Date
}): Promise<SubmissionForDashboard[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId } = ctx

  const statusFilter = opts.status ?? STALE_STATUSES

  const rows = await withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(roleSubmissions.tenantId, tenantId),
      inArray(roleSubmissions.status, statusFilter),
    ]

    if (opts.staleBefore) {
      conditions.push(lt(roleSubmissions.statusUpdatedAt, opts.staleBefore))
    }

    return tx
      .select({
        id: roleSubmissions.id,
        roleId: roleSubmissions.roleId,
        roleTitle: roles.title,
        candidateId: roleSubmissions.candidateId,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        status: roleSubmissions.status,
        statusUpdatedAt: roleSubmissions.statusUpdatedAt,
        sentAt: roleSubmissions.sentAt,
        notes: roleSubmissions.notes,
      })
      .from(roleSubmissions)
      .innerJoin(candidates, eq(roleSubmissions.candidateId, candidates.id))
      .innerJoin(roles, eq(roleSubmissions.roleId, roles.id))
      .where(and(...conditions))
      .orderBy(desc(roleSubmissions.statusUpdatedAt))
      .limit(opts.limit)
  })

  return rows.map((r) => ({
    id: r.id,
    roleId: r.roleId,
    roleTitle: r.roleTitle,
    candidateId: r.candidateId,
    candidateFirstName: r.candidateFirstName,
    candidateLastName: r.candidateLastName,
    status: r.status as SubmissionStatus,
    statusUpdatedAt: r.statusUpdatedAt,
    sentAt: r.sentAt,
    notes: r.notes,
  }))
}
