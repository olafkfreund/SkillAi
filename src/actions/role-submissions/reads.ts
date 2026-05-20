'use server'

import { eq, and, inArray, lt, desc, count, asc, gte, lte, ilike, or } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roleSubmissions, type SubmissionStatus } from '@/db/schema/role-submissions'
import { candidates } from '@/db/schema/candidates'
import { agencies } from '@/db/schema/agencies'
import { scores } from '@/db/schema/scores'
import { roles } from '@/db/schema/roles'
import { users } from '@/db/schema/users'
import { customers } from '@/db/schema/customers'
import { requireRole } from '@/lib/auth/require-role'
import { getActionContext } from '@/lib/auth/action-context'
import {
  type SubmissionWithDetails,
  type SubmissionForDashboard,
  uuidSchema,
  STALE_STATUSES,
} from './shared'

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
        roleTitle: roles.title,
        customerId: roles.customerId,
        customerName: customers.name,
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
      .innerJoin(roles, eq(roleSubmissions.roleId, roles.id))
      .leftJoin(customers, eq(roles.customerId, customers.id))
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
    roleTitle: r.roleTitle,
    customerId: r.customerId ?? null,
    customerName: r.customerName ?? null,
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
          roleTitle: roles.title,
          customerId: roles.customerId,
          customerName: customers.name,
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
      roleTitle: r.roleTitle,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? null,
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
