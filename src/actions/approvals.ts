'use server'

/**
 * Approval-related server actions for the hiring-manager view (Epic #73).
 *
 * Recruiter side:
 *   - sendShortlistForApproval: hand off the current shortlist to assigned managers
 *   - getApprovalsForRole:      read all approval rows for a role (any auth'd user)
 *
 * Manager side:
 *   - approveCandidate / rejectCandidate: per-candidate verdict
 *   - approveAllRemaining:                 bulk-approve everything still pending
 *
 * All writes go through withTenant() so RLS enforces tenant isolation; the
 * unique (role_id, candidate_id, manager_id) constraint on the approvals
 * table makes re-sending the shortlist an idempotent no-op for already-decided
 * rows (we use onConflictDoNothing).
 */

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  roles,
  candidates,
  scores,
  roleManagers,
  candidateRoleApprovals,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import { dispatchManagerDecisionNotification } from '@/lib/notifications/dispatcher'

type ActionResult = { success: true } | { success: false; error: string }

// ---------------------------------------------------------------------------
// sendShortlistForApproval
// ---------------------------------------------------------------------------

/**
 * Marks a role's current shortlist as sent to its assigned hiring managers and
 * seeds a pending approval row per (candidate × manager). Idempotent: re-sending
 * does not reset existing decisions.
 *
 * The shortlist is defined as: every candidate with a `complete` (or any) score
 * for this role whose pipeline status is 'shortlisted'. This matches the
 * recruiter's mental model — "the people I have actually shortlisted on this
 * role" — rather than "everyone scored on this role".
 */
export async function sendShortlistForApproval(
  roleId: string
): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // 1. Verify the role exists in this tenant (RLS will already have filtered,
  //    but we want an explicit "not found" rather than silent no-op).
  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roles.id, title: roles.title })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!role) return { success: false, error: 'Role not found' }

  // 2. Look up assigned managers for this role.
  const managers = await withTenant(tenantId, async (tx) =>
    tx
      .select({ userId: roleManagers.userId })
      .from(roleManagers)
      .where(eq(roleManagers.roleId, roleId))
  )
  if (managers.length === 0) {
    return {
      success: false,
      error: 'No hiring managers are assigned to this role yet',
    }
  }
  const managerIds = managers.map((m) => m.userId)

  // 3. Load the shortlisted candidates (must have been scored on this role
  //    AND have status='shortlisted').
  const shortlisted = await withTenant(tenantId, async (tx) =>
    tx
      .select({ candidateId: candidates.id })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(
        and(
          eq(scores.roleId, roleId),
          eq(candidates.status, 'shortlisted')
        )
      )
  )

  // Even with zero shortlisted candidates we still flag the role as "sent" —
  // the recruiter is signalling intent. The approvals table simply gets no
  // new rows; the manager will see an empty shortlist and the recruiter can
  // add candidates later (re-sending is idempotent).
  const candidateIds = shortlisted.map((s) => s.candidateId)

  // 4. Stamp the role + insert pending approvals (one per candidate × manager).
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(roles)
      .set({ shortlistSentAt: new Date() })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))

    if (candidateIds.length > 0) {
      const rows = candidateIds.flatMap((candidateId) =>
        managerIds.map((managerId) => ({
          tenantId,
          roleId,
          candidateId,
          managerId,
          decision: 'pending' as const,
        }))
      )
      await tx
        .insert(candidateRoleApprovals)
        .values(rows)
        .onConflictDoNothing({
          target: [
            candidateRoleApprovals.roleId,
            candidateRoleApprovals.candidateId,
            candidateRoleApprovals.managerId,
          ],
        })
    }
  })

  await writeAuditLog(tenantId, {
    action: 'shortlist.sent',
    entityType: 'role',
    entityId: roleId,
    entityLabel: role.title,
    metadata: {
      roleId,
      managerIds,
      candidateCount: candidateIds.length,
    },
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// approveCandidate / rejectCandidate
// ---------------------------------------------------------------------------

async function recordDecision(
  roleId: string,
  candidateId: string,
  decision: 'approved' | 'rejected',
  comment?: string
): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'hiring_manager')
  } catch {
    return { success: false, error: 'Forbidden: hiring managers only' }
  }

  // Verify the current user is assigned as a manager on this role.
  const [assignment] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roleManagers.id })
      .from(roleManagers)
      .where(
        and(eq(roleManagers.roleId, roleId), eq(roleManagers.userId, userId))
      )
      .limit(1)
  )
  if (!assignment) {
    return {
      success: false,
      error: 'You are not assigned as a manager on this role',
    }
  }

  const trimmed = comment?.trim()
  const commentValue = trimmed && trimmed.length > 0 ? trimmed : null

  // Upsert the approval row. Insert path covers the (rare) case where a
  // manager records a decision before the recruiter ever called
  // sendShortlistForApproval — we still capture intent.
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(candidateRoleApprovals)
      .values({
        tenantId,
        roleId,
        candidateId,
        managerId: userId,
        decision,
        comment: commentValue,
        decidedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          candidateRoleApprovals.roleId,
          candidateRoleApprovals.candidateId,
          candidateRoleApprovals.managerId,
        ],
        set: {
          decision,
          comment: commentValue,
          decidedAt: new Date(),
        },
      })
  })

  await writeAuditLog(tenantId, {
    action:
      decision === 'approved'
        ? 'candidate.approved_by_manager'
        : 'candidate.rejected_by_manager',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { roleId, candidateId, comment: commentValue },
  })

  // Fire-and-forget: notify configured Slack / Teams webhooks of the decision.
  // Dispatch starts before revalidatePath so it isn't blocked; .catch() ensures
  // it never propagates to the caller.
  dispatchManagerDecisionNotification({
    tenantId,
    decision,
    candidateId,
    roleId,
    managerName: null, // ActionContext does not carry a display name; dispatcher renders it gracefully
    comment: commentValue,
  }).catch(() => {})

  revalidatePath(`/dashboard/roles/${roleId}`)
  return { success: true }
}

export async function approveCandidate(
  roleId: string,
  candidateId: string,
  comment?: string
): Promise<ActionResult> {
  return recordDecision(roleId, candidateId, 'approved', comment)
}

export async function rejectCandidate(
  roleId: string,
  candidateId: string,
  comment?: string
): Promise<ActionResult> {
  return recordDecision(roleId, candidateId, 'rejected', comment)
}

// ---------------------------------------------------------------------------
// approveAllRemaining
// ---------------------------------------------------------------------------

/**
 * Bulk-approve every still-pending approval row owned by the current manager
 * on the given role. Emits a single summary audit log entry rather than one
 * per candidate.
 */
export async function approveAllRemaining(
  roleId: string,
  comment?: string
): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'hiring_manager')
  } catch {
    return { success: false, error: 'Forbidden: hiring managers only' }
  }

  // Verify the current user is assigned as a manager on this role.
  const [assignment] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roleManagers.id })
      .from(roleManagers)
      .where(
        and(eq(roleManagers.roleId, roleId), eq(roleManagers.userId, userId))
      )
      .limit(1)
  )
  if (!assignment) {
    return {
      success: false,
      error: 'You are not assigned as a manager on this role',
    }
  }

  const trimmed = comment?.trim()
  const commentValue = trimmed && trimmed.length > 0 ? trimmed : null

  const updated = await withTenant(tenantId, async (tx) =>
    tx
      .update(candidateRoleApprovals)
      .set({
        decision: 'approved',
        comment: commentValue,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(candidateRoleApprovals.roleId, roleId),
          eq(candidateRoleApprovals.managerId, userId),
          eq(candidateRoleApprovals.decision, 'pending')
        )
      )
      .returning({ id: candidateRoleApprovals.id })
  )

  await writeAuditLog(tenantId, {
    action: 'candidate.approved_by_manager',
    entityType: 'role',
    entityId: roleId,
    metadata: {
      roleId,
      bulk: true,
      count: updated.length,
      comment: commentValue,
    },
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// getApprovalsForRole — read helper
// ---------------------------------------------------------------------------

export type ApprovalRow = {
  id: string
  candidateId: string
  managerId: string
  decision: 'pending' | 'approved' | 'rejected'
  comment: string | null
  decidedAt: Date | null
  createdAt: Date
}

/**
 * Returns every approval row for the given role (across all assigned managers).
 * Used by the recruiter UI to show who has approved / rejected what.
 *
 * Auth: any logged-in user. Tenant-scoping is enforced by RLS via withTenant.
 */
export async function getApprovalsForRole(
  roleId: string
): Promise<ApprovalRow[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId } = ctx

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidateRoleApprovals.id,
        candidateId: candidateRoleApprovals.candidateId,
        managerId: candidateRoleApprovals.managerId,
        decision: candidateRoleApprovals.decision,
        comment: candidateRoleApprovals.comment,
        decidedAt: candidateRoleApprovals.decidedAt,
        createdAt: candidateRoleApprovals.createdAt,
      })
      .from(candidateRoleApprovals)
      .where(eq(candidateRoleApprovals.roleId, roleId))
  )

  return rows.map((r) => ({
    ...r,
    decision: r.decision as 'pending' | 'approved' | 'rejected',
  }))
}

