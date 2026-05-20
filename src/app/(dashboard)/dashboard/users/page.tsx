import { UsersIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { listTenantUsers } from '@/actions/users'
import { listPendingInvitations } from '@/actions/invitations'
import { UserManagementTable } from '@/components/settings/user-management-table'
import { UserFilters } from '@/components/settings/user-filters'
import { InviteForm } from './invite-form'
import { RevokeButton } from './revoke-button'
import { CopyUrlButton } from './copy-url-button'
import type { UserRole } from '@/lib/auth/types'
import type { UserFilters as UserFilterParams, UserStatusFilter, UserLastLoginFilter } from '@/actions/users'

export const metadata = { title: 'Team Management — SkillAI' }

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-violet-950 text-violet-400 border border-violet-700',
  recruiter: 'bg-blue-950 text-blue-400 border border-blue-700',
  hiring_manager: 'bg-emerald-950 text-emerald-400 border border-emerald-700',
  viewer: 'bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] border border-[var(--color-border)]',
}

const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'

const VALID_ROLES = new Set<UserRole>(['admin', 'recruiter', 'hiring_manager', 'viewer'])
const VALID_STATUSES = new Set<UserStatusFilter>(['active', 'deactivated', 'all'])
const VALID_LAST_LOGINS = new Set<UserLastLoginFilter>(['any', '7d', '30d', 'never'])

interface PageProps {
  searchParams: Promise<{
    role?: string
    status?: string
    lastLogin?: string
    pendingInvite?: string
  }>
}

export default async function UsersPage({ searchParams }: PageProps) {
  const session = await auth()
  const isAdmin = session?.user.role === 'admin'

  const {
    role: roleParam,
    status: statusParam,
    lastLogin: lastLoginParam,
    pendingInvite: pendingInviteParam,
  } = await searchParams

  // Parse + validate each filter param — ignore unknown values
  const parsedRoles = roleParam
    ? (roleParam.split(',').filter((r) => VALID_ROLES.has(r as UserRole)) as UserRole[])
    : undefined

  const parsedStatus: UserStatusFilter =
    statusParam && VALID_STATUSES.has(statusParam as UserStatusFilter)
      ? (statusParam as UserStatusFilter)
      : 'all'

  const parsedLastLogin: UserLastLoginFilter =
    lastLoginParam && VALID_LAST_LOGINS.has(lastLoginParam as UserLastLoginFilter)
      ? (lastLoginParam as UserLastLoginFilter)
      : 'any'

  const parsedPendingInvite = pendingInviteParam === '1'

  const filters: UserFilterParams = {
    roles: parsedRoles && parsedRoles.length > 0 ? parsedRoles : undefined,
    status: parsedStatus,
    lastLogin: parsedLastLogin,
    pendingInviteOnly: parsedPendingInvite,
  }

  const [tenantUsers, pendingInvitations] = isAdmin
    ? await Promise.all([listTenantUsers(filters), listPendingInvitations()])
    : [[], []]

  // Build currentFilters for the client component (URL-param shape)
  const currentFilters = {
    roles: parsedRoles && parsedRoles.length > 0 ? parsedRoles.join(',') : undefined,
    status: parsedStatus,
    lastLogin: parsedLastLogin,
    pendingInvite: parsedPendingInvite ? '1' : undefined,
  }

  const hasActiveFilters =
    !!currentFilters.roles ||
    currentFilters.status !== 'all' ||
    currentFilters.lastLogin !== 'any' ||
    !!currentFilters.pendingInvite

  return (
    <div className="max-w-4xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-[var(--color-bg-elevated)] rounded-lg">
          <UsersIcon className="h-5 w-5 text-[var(--color-fg-muted)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-fg)]">Team Management</h1>
          <p className="text-sm text-[var(--color-fg-subtle)]">Manage users and send invitations</p>
        </div>
      </div>

      {!isAdmin ? (
        <div className="rounded-xl bg-amber-950 border border-amber-800 px-5 py-4">
          <p className="text-sm text-amber-400 font-medium">Admin access required</p>
          <p className="text-xs text-amber-500 mt-0.5">
            Only admins can manage team members and invitations.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Invite user form */}
          <InviteForm />

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-3">
                Pending Invitations
              </h2>
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                        Role
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                        Expires
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-bg-elevated)]">
                    {pendingInvitations.map((inv) => {
                      const inviteUrl = `${BASE_URL}/invite/${inv.token}`
                      const role = (inv.role as UserRole) ?? 'recruiter'
                      return (
                        <tr key={inv.id} className="bg-[var(--color-bg-app)] hover:bg-[var(--color-bg-input)] transition-colors">
                          <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                            {inv.email ?? (
                              <span className="italic text-[var(--color-fg-subtle)]">Open invitation</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[role]}`}
                            >
                              {role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-fg-subtle)] text-xs">
                            {inv.expiresAt.toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <CopyUrlButton url={inviteUrl} />
                              <RevokeButton invitationId={inv.id} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Team members table */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-3">
              Team Members
            </h2>
            <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
              You cannot change your own role or deactivate your own account.
            </p>

            {/* Filter toolbar */}
            <div className="mb-4">
              <UserFilters currentFilters={currentFilters} />
            </div>

            {tenantUsers.length === 0 ? (
              <div className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-5 py-4">
                {hasActiveFilters ? (
                  <p className="text-sm text-[var(--color-fg-subtle)]">
                    No users match the current filters.
                  </p>
                ) : (
                  <p className="text-sm text-[var(--color-fg-subtle)]">No users found.</p>
                )}
              </div>
            ) : (
              <UserManagementTable
                users={tenantUsers}
                currentUserId={session!.user.id}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
