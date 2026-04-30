'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, inArray, lt, desc, count, asc, gte, lte, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import crypto from 'crypto'
import { db, withTenant } from '@/db'
import { roleSubmissions, type SubmissionStatus } from '@/db/schema/role-submissions'
import { candidates } from '@/db/schema/candidates'
import { agencies } from '@/db/schema/agencies'
import { scores } from '@/db/schema/scores'
import { roles } from '@/db/schema/roles'
import { users } from '@/db/schema/users'
import { tenants } from '@/db/schema/tenants'
import { customers } from '@/db/schema/customers'
import { auditLogs } from '@/db/schema/audit-logs'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { notifyRecruiterOfCustomerUpdate } from '@/lib/email/notify-recruiter-of-customer-update'
import { getActionContext } from '@/lib/auth/action-context'
import { checkShareUpdateRateLimit } from '@/lib/api/share-rate-limit'

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
  shareToken: string | null
  shareTokenCreatedAt: Date | null
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

/**
 * Customer-visible projection returned by getSubmissionByToken.
 * MUST NOT include rates, margin, agency, internal notes, score breakdown,
 * recruiter identity, or any other tenant-internal commercial data.
 */
export type CustomerVisibleSubmission = {
  candidateFirstName: string
  candidateLastName: string
  roleTitle: string
  customerName: string | null
  tenantName: string
  status: SubmissionStatus
  sentAt: Date
  statusUpdatedAt: Date
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
        shareToken: roleSubmissions.shareToken,
        shareTokenCreatedAt: roleSubmissions.shareTokenCreatedAt,
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
    shareToken: r.shareToken ?? null,
    shareTokenCreatedAt: r.shareTokenCreatedAt ?? null,
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

// ---------------------------------------------------------------------------
// CUSTOMER_ALLOWED transitions whitelist
// ---------------------------------------------------------------------------

const CUSTOMER_ALLOWED: readonly SubmissionStatus[] = [
  'interview_scheduled',
  'interview_done',
  'feedback_pending',
  'hired',
  'rejected',
] as const

// ---------------------------------------------------------------------------
// updateSubmissionStatusByToken — PUBLIC, NO AUTH
// ---------------------------------------------------------------------------

/**
 * WHY NO withTenant():
 *   This is a public action — there is no Auth.js session and therefore no
 *   tenant context to set. We look up the row by share_token (unique partial index)
 *   and use the tenantId from the loaded row for the audit log. The minimal
 *   projection returned never exposes tenant-internal commercial data, and every
 *   call is audit-logged with IP + user-agent for accountability.
 */
export async function updateSubmissionStatusByToken(
  token: string,
  newStatus: SubmissionStatus,
  opts: {
    notes?: string
    customerName?: string
    customerEmail?: string
    ipAddress: string
    userAgent: string
  }
): Promise<ActionResult<{ status: SubmissionStatus; statusUpdatedAt: Date }>> {
  if (!token || token.length > 64) {
    return { success: false, error: 'Invalid token' }
  }

  // Rate-limit before any DB work
  const rateLimitResult = checkShareUpdateRateLimit(token, opts.ipAddress)
  if (rateLimitResult !== null) {
    return {
      success: false,
      error: `Too many updates, try again later (${rateLimitResult.retryAfterSeconds}s)`,
    }
  }

  // Validate the requested status against the customer-allowed whitelist
  if (!(CUSTOMER_ALLOWED as readonly string[]).includes(newStatus)) {
    return { success: false, error: 'Status not allowed for customer update' }
  }

  const now = new Date()

  // WHY db.transaction (plain) for the lookup phase:
  //   No session → we don't know the tenantId yet. We first look up the submission
  //   by share_token (unique partial index) in a plain transaction (no RLS context).
  //   role_submissions RLS policy checks app.tenant_id; without it set, the policy
  //   evaluates to false and no rows are returned from a normal SELECT.
  //   We use `SET LOCAL role = anon` / BYPASSRLS equivalents are not available at
  //   app level — instead we set the tenant context to a special lookup UUID, then
  //   immediately switch to the real tenant once we know it.
  //
  //   SAFER APPROACH: we do the lookup in a separate withTenant call keyed on the
  //   submissionId we discover via a RAW sql lookup that sets the tenant_id in the
  //   same transaction. Specifically:
  //   1. Use db.execute (raw SQL) to bypass RLS for the token lookup only.
  //   2. Use withTenant(foundTenantId) for the update and all subsequent queries.
  //
  //   The raw lookup exposes only (id, tenant_id, role_id, candidate_id, status,
  //   share_token) — no commercial data — so the bypass is bounded and auditable.

  // Phase 1: raw lookup bypasses RLS (role_submissions SELECT without tenant context).
  // We select share_token too so we can confirm the column isn't null (revoked check).
  const lookupRows = await db.execute<{
    id: string
    tenant_id: string
    role_id: string
    candidate_id: string
    status: string
    share_token: string | null
  }>(
    sql`SELECT id, tenant_id, role_id, candidate_id, status, share_token
        FROM role_submissions
        WHERE share_token = ${token}
        LIMIT 1`
  )

  const lookupRow = lookupRows[0]
  if (!lookupRow || lookupRow.share_token === null) {
    return { success: false, error: 'Link expired or revoked' }
  }

  const foundTenantId = lookupRow.tenant_id

  // Phase 2: perform the status update inside a withTenant call so RLS is satisfied.
  const updateValues: {
    status: SubmissionStatus
    statusUpdatedAt: Date
    updatedAt: Date
    notes?: string
  } = {
    status: newStatus,
    statusUpdatedAt: now,
    updatedAt: now,
  }
  if (opts.notes !== undefined) {
    updateValues.notes = opts.notes
  }

  await withTenant(foundTenantId, async (tx) =>
    tx
      .update(roleSubmissions)
      .set(updateValues)
      .where(
        and(
          eq(roleSubmissions.id, lookupRow.id),
          eq(roleSubmissions.tenantId, foundTenantId)
        )
      )
  )

  // Phase 3: load names for the audit label inside the RLS context.
  const [candidateRow] = await withTenant(foundTenantId, async (tx) =>
    tx
      .select({ firstName: candidates.firstName, lastName: candidates.lastName })
      .from(candidates)
      .where(eq(candidates.id, lookupRow.candidate_id))
      .limit(1)
  )

  const [roleRow] = await withTenant(foundTenantId, async (tx) =>
    tx
      .select({ title: roles.title })
      .from(roles)
      .where(eq(roles.id, lookupRow.role_id))
      .limit(1)
  )

  const candidateName = candidateRow
    ? `${candidateRow.firstName} ${candidateRow.lastName}`
    : lookupRow.candidate_id
  const roleTitle = roleRow?.title ?? lookupRow.role_id

  // Write audit log using withTenant so that SET LOCAL app.tenant_id satisfies
  // the RLS policy on audit_logs. userId is null — public unauthenticated action.
  await withTenant(foundTenantId, async (tx) =>
    tx.insert(auditLogs).values({
      tenantId: foundTenantId,
      userId: null,
      userEmail: null,
      action: 'submission.customer_updated',
      entityType: 'submission',
      entityId: lookupRow.id,
      entityLabel: `${candidateName} → ${roleTitle}`,
      metadata: {
        from: lookupRow.status,
        to: newStatus,
        candidateId: lookupRow.candidate_id,
        roleId: lookupRow.role_id,
        customerName: opts.customerName ?? null,
        customerEmail: opts.customerEmail ?? null,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
      },
    })
  ).catch((err: unknown) => {
    // Audit must never fail the main action
    console.error('[audit] Failed to write customer_updated audit log:', err)
  })

  // Fire-and-forget: notify the recruiter who originally submitted this candidate.
  // Failures are swallowed inside the helper — must NEVER block the customer's
  // status update. Skipped silently when SMTP isn't configured / status didn't
  // change / recruiter has no email.
  notifyRecruiterOfCustomerUpdate({
    tenantId: foundTenantId,
    submissionId: lookupRow.id,
    candidateId: lookupRow.candidate_id,
    roleId: lookupRow.role_id,
    fromStatus: lookupRow.status,
    toStatus: newStatus,
    customerName: opts.customerName ?? null,
    customerEmail: opts.customerEmail ?? null,
  }).catch(() => { /* helper handles its own errors */ })

  return { success: true, data: { status: newStatus, statusUpdatedAt: now } }
}

// ---------------------------------------------------------------------------
// getSubmissionByToken — PUBLIC, NO AUTH
// ---------------------------------------------------------------------------

/**
 * WHY TWO-PHASE LOOKUP:
 *   All joined tables (role_submissions, candidates, roles, customers) have RLS
 *   policies that check app.tenant_id. Without a session we have no tenant context,
 *   so a plain multi-table join would return zero rows even for a valid token.
 *
 *   Phase 1: raw SQL bypasses RLS to discover the tenantId from the token.
 *     We expose only (id, tenant_id, role_id, candidate_id, status, sent_at,
 *     status_updated_at, share_token) — nothing commercially sensitive.
 *   Phase 2: withTenant(foundTenantId) sets the RLS context, then we load the
 *     enriched customer-visible projection from the tenant-scoped tables.
 *   tenants has no RLS — safe to query directly at any point.
 */
export async function getSubmissionByToken(
  token: string
): Promise<CustomerVisibleSubmission | null> {
  if (!token || token.length > 64) return null

  // Phase 1: token → (id, tenantId, roleId, candidateId, status, sentAt, statusUpdatedAt)
  // Raw SQL bypasses RLS for this single, non-commercial lookup.
  const lookupRows = await db.execute<{
    id: string
    tenant_id: string
    role_id: string
    candidate_id: string
    status: string
    sent_at: Date
    status_updated_at: Date
    share_token: string | null
  }>(
    sql`SELECT id, tenant_id, role_id, candidate_id, status, sent_at, status_updated_at, share_token
        FROM role_submissions
        WHERE share_token = ${token}
        LIMIT 1`
  )

  const lookupRow = lookupRows[0]
  if (!lookupRow || lookupRow.share_token === null) return null

  // Phase 2: load the enriched projection within the tenant RLS context.
  const [enriched] = await withTenant(lookupRow.tenant_id, async (tx) =>
    tx
      .select({
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        roleTitle: roles.title,
        customerName: customers.name,
      })
      .from(candidates)
      .innerJoin(roles, eq(roles.id, lookupRow.role_id))
      .leftJoin(customers, eq(roles.customerId, customers.id))
      .where(eq(candidates.id, lookupRow.candidate_id))
      .limit(1)
  )

  if (!enriched) return null

  // tenants table has no RLS — safe to query without withTenant.
  const [tenantRow] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, lookupRow.tenant_id))
    .limit(1)

  if (!tenantRow) return null

  return {
    candidateFirstName: enriched.candidateFirstName,
    candidateLastName: enriched.candidateLastName,
    roleTitle: enriched.roleTitle,
    customerName: enriched.customerName ?? null,
    tenantName: tenantRow.name,
    status: lookupRow.status as SubmissionStatus,
    sentAt: lookupRow.sent_at,
    statusUpdatedAt: lookupRow.status_updated_at,
  }
}

// ---------------------------------------------------------------------------
// getAllSubmissionsForTenant — recruiter-gated loader for the index page
// ---------------------------------------------------------------------------

/**
 * Paginated, filtered, sorted loader for the /dashboard/submissions index page.
 * Mirrors the candidate-list filter-builder pattern — all conditions accumulated
 * in an array and AND-ed together. Two queries run in parallel: the page rows and
 * the total count.
 */
export async function getAllSubmissionsForTenant(opts: {
  status?: SubmissionStatus[]
  roleId?: string
  customerId?: string
  agencyId?: string
  q?: string
  dateFrom?: Date
  dateTo?: Date
  sortBy?: 'sentAt' | 'statusUpdatedAt'
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}): Promise<{ rows: SubmissionWithDetails[]; totalCount: number }> {
  const ctx = await getActionContext()
  if (!ctx) return { rows: [], totalCount: 0 }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { rows: [], totalCount: 0 }
  }

  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25))
  const offset = (page - 1) * pageSize

  const sortColumn =
    opts.sortBy === 'statusUpdatedAt'
      ? roleSubmissions.statusUpdatedAt
      : roleSubmissions.sentAt
  const orderExpr =
    opts.sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn)

  const [rows, countRows] = await Promise.all([
    withTenant(tenantId, async (tx) => {
      const conditions = [eq(roleSubmissions.tenantId, tenantId)]

      if (opts.status && opts.status.length > 0) {
        conditions.push(inArray(roleSubmissions.status, opts.status))
      }
      if (opts.roleId) {
        conditions.push(eq(roleSubmissions.roleId, opts.roleId))
      }
      if (opts.customerId) {
        conditions.push(eq(roles.customerId, opts.customerId))
      }
      if (opts.agencyId) {
        conditions.push(eq(candidates.agencyId, opts.agencyId))
      }
      if (opts.q) {
        const pattern = `%${opts.q}%`
        conditions.push(
          or(
            ilike(candidates.firstName, pattern),
            ilike(candidates.lastName, pattern),
            ilike(candidates.email, pattern)
          )!
        )
      }
      if (opts.dateFrom) {
        conditions.push(gte(roleSubmissions.sentAt, opts.dateFrom))
      }
      if (opts.dateTo) {
        conditions.push(lte(roleSubmissions.sentAt, opts.dateTo))
      }

      return tx
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
          shareToken: roleSubmissions.shareToken,
          shareTokenCreatedAt: roleSubmissions.shareTokenCreatedAt,
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
        .innerJoin(roles, eq(roleSubmissions.roleId, roles.id))
        .leftJoin(customers, eq(roles.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(orderExpr)
        .limit(pageSize)
        .offset(offset)
    }),
    withTenant(tenantId, async (tx) => {
      const conditions = [eq(roleSubmissions.tenantId, tenantId)]

      if (opts.status && opts.status.length > 0) {
        conditions.push(inArray(roleSubmissions.status, opts.status))
      }
      if (opts.roleId) {
        conditions.push(eq(roleSubmissions.roleId, opts.roleId))
      }
      if (opts.customerId) {
        conditions.push(eq(roles.customerId, opts.customerId))
      }
      if (opts.agencyId) {
        conditions.push(eq(candidates.agencyId, opts.agencyId))
      }
      if (opts.q) {
        const pattern = `%${opts.q}%`
        conditions.push(
          or(
            ilike(candidates.firstName, pattern),
            ilike(candidates.lastName, pattern),
            ilike(candidates.email, pattern)
          )!
        )
      }
      if (opts.dateFrom) {
        conditions.push(gte(roleSubmissions.sentAt, opts.dateFrom))
      }
      if (opts.dateTo) {
        conditions.push(lte(roleSubmissions.sentAt, opts.dateTo))
      }

      const [result] = await tx
        .select({ total: count() })
        .from(roleSubmissions)
        .innerJoin(candidates, eq(roleSubmissions.candidateId, candidates.id))
        .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
        .innerJoin(roles, eq(roleSubmissions.roleId, roles.id))
        .leftJoin(customers, eq(roles.customerId, customers.id))
        .where(and(...conditions))

      return result?.total ?? 0
    }),
  ])

  return {
    rows: rows.map((r) => ({
      id: r.id,
      roleId: r.roleId,
      candidateId: r.candidateId,
      sentAt: r.sentAt,
      sentByUserId: r.sentByUserId,
      status: r.status as SubmissionStatus,
      statusUpdatedAt: r.statusUpdatedAt,
      notes: r.notes,
      createdAt: r.createdAt,
      shareToken: r.shareToken ?? null,
      shareTokenCreatedAt: r.shareTokenCreatedAt ?? null,
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
    })),
    totalCount: countRows,
  }
}
