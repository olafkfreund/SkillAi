import { notFound } from 'next/navigation'
import { eq, and, count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import {
  roles,
  customers,
  roleManagers,
  candidateRoleApprovals,
} from '@/db/schema'
import { RoleCardList, type ManagerRoleCard } from '@/components/manager/role-card-list'

export const metadata = { title: 'My Shortlists — SkillAI' }

export default async function ManagerPage() {
  const session = await auth()

  // Hiring managers see their own assigned roles; admins can view the page
  // (will show their own assignments — typically none — useful for support).
  // Recruiters/viewers don't have a use case here.
  if (
    session?.user.role !== 'hiring_manager' &&
    session?.user.role !== 'admin'
  ) {
    notFound()
  }

  const tenantId = session.user.tenantId
  const userId = session.user.id

  // Join roles × customers × role_managers for the current manager, then
  // sub-query pending approval counts. We do this directly rather than
  // extending getMyAssignedRoles because that action only returns the minimal
  // AssignedRoleSummary shape and adding customer + counts would make it too
  // specific to this view.
  const rows = await withTenant(tenantId, async (tx) => {
    const assigned = await tx
      .select({
        roleId: roles.id,
        title: roles.title,
        isActive: roles.isActive,
        shortlistSentAt: roles.shortlistSentAt,
        targetFillDate: roles.targetFillDate,
        isPrimary: roleManagers.isPrimary,
        customerName: customers.name,
      })
      .from(roleManagers)
      .innerJoin(roles, eq(roleManagers.roleId, roles.id))
      .leftJoin(customers, eq(roles.customerId, customers.id))
      .where(
        and(
          eq(roleManagers.userId, userId),
          eq(roles.isActive, true)
        )
      )

    // Fetch pending approval counts per role for this manager in one query.
    const pendingCounts = await tx
      .select({
        roleId: candidateRoleApprovals.roleId,
        pendingCount: count(candidateRoleApprovals.id),
      })
      .from(candidateRoleApprovals)
      .where(
        and(
          eq(candidateRoleApprovals.managerId, userId),
          eq(candidateRoleApprovals.decision, 'pending')
        )
      )
      .groupBy(candidateRoleApprovals.roleId)

    const pendingByRole = new Map(
      pendingCounts.map((r) => [r.roleId, Number(r.pendingCount)])
    )

    return assigned.map((row) => ({
      ...row,
      pendingCount: pendingByRole.get(row.roleId) ?? 0,
    }))
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-fg)]">My Shortlists</h1>
        <p className="text-[var(--color-fg-subtle)] mt-1">
          {rows.length} role{rows.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>

      <RoleCardList roles={rows as ManagerRoleCard[]} />
    </div>
  )
}
