'use server'

import { eq, and, sql } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { roleSubmissions, type SubmissionStatus } from '@/db/schema/role-submissions'
import { candidates } from '@/db/schema/candidates'
import { roles } from '@/db/schema/roles'
import { tenants } from '@/db/schema/tenants'
import { customers } from '@/db/schema/customers'
import { auditLogs } from '@/db/schema/audit-logs'
import { notifyRecruiterOfCustomerUpdate } from '@/lib/email/notify-recruiter-of-customer-update'
import { checkShareUpdateRateLimit } from '@/lib/api/share-rate-limit'
import {
  type ActionResult,
  type CustomerVisibleSubmission,
  CUSTOMER_ALLOWED,
} from './shared'

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
