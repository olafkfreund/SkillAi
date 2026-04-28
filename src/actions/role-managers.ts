'use server'

/**
 * Role-manager assignment server actions for the hiring-manager view (Epic #73).
 *
 * Recruiter side:
 *   - assignRoleManagers:  replace the manager set for a role
 *   - removeRoleManager:   detach a single manager
 *   - getRoleManagers:     list managers for a role (any auth'd user)
 *
 * Manager side:
 *   - getMyAssignedRoles: list every role the current user can review
 *
 * Tenant isolation is enforced by RLS via withTenant. The user-role validation
 * step inside assignRoleManagers ensures we only ever attach actual
 * `hiring_manager` users — silently dropping anyone who is not (so the UI
 * doesn't have to pre-validate the dropdown server-side).
 */

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roles, users, roleManagers } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'

type ActionResult = { success: true } | { success: false; error: string }

// ---------------------------------------------------------------------------
// assignRoleManagers — replace the full manager set for a role
// ---------------------------------------------------------------------------

/**
 * Replaces the set of hiring managers assigned to `roleId` with the given
 * `userIds`. If `primaryUserId` is provided AND is one of the assigned
 * managers, that user is flagged `is_primary=true`.
 *
 * Invalid users (non-existent, wrong tenant, non-`hiring_manager` role) are
 * silently filtered out — the action returns `success: true` with whatever
 * subset was valid. If ALL provided IDs are invalid we treat that as an
 * explicit error, since the recruiter clearly intended to assign someone.
 */
export async function assignRoleManagers(
  roleId: string,
  userIds: string[],
  primaryUserId?: string
): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId: actorId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Verify role belongs to this tenant.
  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roles.id, title: roles.title })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!role) return { success: false, error: 'Role not found' }

  // Validate each userId is a hiring_manager in this tenant. We do this
  // inside withTenant so RLS already constrains the query to our tenant.
  const validUsers = await withTenant(tenantId, async (tx) => {
    if (userIds.length === 0) return [] as { id: string }[]
    const tenantUsers = await tx
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.tenantId, tenantId))
    return tenantUsers.filter(
      (u) =>
        userIds.includes(u.id) &&
        u.role === 'hiring_manager' &&
        u.isActive
    )
  })

  if (userIds.length > 0 && validUsers.length === 0) {
    return {
      success: false,
      error:
        'None of the selected users are active hiring managers in this tenant',
    }
  }

  const validUserIds = new Set(validUsers.map((u) => u.id))
  const primary =
    primaryUserId && validUserIds.has(primaryUserId) ? primaryUserId : null

  // Replace strategy: delete existing assignments for this role, insert new.
  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(roleManagers)
      .where(eq(roleManagers.roleId, roleId))

    if (validUsers.length > 0) {
      await tx.insert(roleManagers).values(
        validUsers.map((u) => ({
          tenantId,
          roleId,
          userId: u.id,
          isPrimary: u.id === primary,
          addedBy: actorId || null,
        }))
      )
    }
  })

  await writeAuditLog(tenantId, {
    action: 'role.manager_assigned',
    entityType: 'role',
    entityId: roleId,
    entityLabel: role.title,
    metadata: {
      roleId,
      userIds: validUsers.map((u) => u.id),
      primaryUserId: primary,
      requestedUserIds: userIds,
    },
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// removeRoleManager — detach a single manager
// ---------------------------------------------------------------------------

export async function removeRoleManager(
  roleId: string,
  userId: string
): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Verify role belongs to this tenant before mutating.
  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roles.id, title: roles.title })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!role) return { success: false, error: 'Role not found' }

  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(roleManagers)
      .where(
        and(eq(roleManagers.roleId, roleId), eq(roleManagers.userId, userId))
      )
  })

  await writeAuditLog(tenantId, {
    action: 'role.manager_assigned',
    entityType: 'role',
    entityId: roleId,
    entityLabel: role.title,
    metadata: { roleId, removed: userId },
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// getMyAssignedRoles — read helper for the manager dashboard
// ---------------------------------------------------------------------------

export type AssignedRoleSummary = {
  roleId: string
  title: string
  isActive: boolean
  shortlistSentAt: Date | null
  isPrimary: boolean
}

/**
 * Returns every role where the current user is assigned as a manager.
 * Joins roles × role_managers on userId = currentUser. Auth: any logged-in
 * user; tenant-scoping via RLS.
 */
export async function getMyAssignedRoles(): Promise<AssignedRoleSummary[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId, userId } = ctx
  if (!userId) return []

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        roleId: roles.id,
        title: roles.title,
        isActive: roles.isActive,
        shortlistSentAt: roles.shortlistSentAt,
        isPrimary: roleManagers.isPrimary,
      })
      .from(roleManagers)
      .innerJoin(roles, eq(roleManagers.roleId, roles.id))
      .where(eq(roleManagers.userId, userId))
  )

  return rows
}

// ---------------------------------------------------------------------------
// getRoleManagers — read helper for the recruiter UI
// ---------------------------------------------------------------------------

export type RoleManagerRow = {
  userId: string
  email: string
  name: string
  isPrimary: boolean
  addedAt: Date
}

/**
 * Returns the list of managers assigned to a role, joined with user metadata
 * for display. Auth: any logged-in user; tenant-scoping via RLS.
 */
export async function getRoleManagers(
  roleId: string
): Promise<RoleManagerRow[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId } = ctx

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        isPrimary: roleManagers.isPrimary,
        addedAt: roleManagers.addedAt,
      })
      .from(roleManagers)
      .innerJoin(users, eq(roleManagers.userId, users.id))
      .where(eq(roleManagers.roleId, roleId))
  )

  return rows
}
