'use client'

import { UserDeactivateButton } from '@/components/users/user-deactivate-button'
import { UserForceResetButton } from '@/components/users/user-force-reset-button'
import { UserRoleSelector } from '@/components/users/user-role-selector'
import type { User } from '@/db/schema/users'
import type { UserRole } from '@/lib/auth/types'

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  recruiter: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700',
  hiring_manager: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  viewer: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600',
}

type Props = {
  users: User[]
  currentUserId: string
}

export function UserManagementTable({ users, currentUserId }: Props) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Name
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Email
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Role
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-bg-elevated)]">
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            const isInactive = user.isActive === false
            return (
              <tr key={user.id} className="bg-[var(--color-bg-app)] hover:bg-[var(--color-bg-input)] transition-colors">
                <td className="px-4 py-3 text-[var(--color-fg)] font-medium">{user.name}</td>
                <td className="px-4 py-3 text-[var(--color-fg-muted)]">{user.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE[user.role]}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isInactive ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-500 border border-zinc-300 dark:border-zinc-600">
                      Inactive
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <UserRoleSelector
                      userId={user.id}
                      currentRole={user.role}
                      isSelf={isSelf}
                      isInactive={isInactive}
                    />
                    <UserForceResetButton
                      userId={user.id}
                      userEmail={user.email}
                      disabled={isSelf || isInactive}
                    />
                    <UserDeactivateButton
                      userId={user.id}
                      userEmail={user.email}
                      isActive={user.isActive !== false}
                      isSelf={isSelf}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
