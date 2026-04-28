'use client'

import { useTransition } from 'react'
import { updateUserRole, deactivateUser } from '@/actions/users'
import type { User } from '@/db/schema/users'
import type { UserRole } from '@/lib/auth/types'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'viewer', label: 'Viewer' },
]

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-blue-950 text-blue-300 border-blue-700',
  recruiter: 'bg-violet-950 text-violet-300 border-violet-700',
  hiring_manager: 'bg-emerald-950 text-emerald-300 border-emerald-700',
  viewer: 'bg-zinc-800 text-zinc-400 border-zinc-600',
}

type Props = {
  users: User[]
  currentUserId: string
}

export function UserManagementTable({ users, currentUserId }: Props) {
  const [pending, startTransition] = useTransition()

  function handleRoleChange(userId: string, role: UserRole) {
    startTransition(async () => {
      await updateUserRole(userId, role)
    })
  }

  function handleDeactivate(userId: string) {
    startTransition(async () => {
      await deactivateUser(userId)
    })
  }

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
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-600">
                      Inactive
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue={user.role}
                      disabled={isSelf || isInactive || pending}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                      className="text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                                 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500
                                 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isSelf || isInactive || pending}
                      onClick={() => handleDeactivate(user.id)}
                      className="text-xs px-2 py-1 rounded-md border border-red-800 text-red-400
                                 hover:bg-red-950 disabled:opacity-40 disabled:cursor-not-allowed
                                 transition-colors"
                    >
                      Deactivate
                    </button>
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
