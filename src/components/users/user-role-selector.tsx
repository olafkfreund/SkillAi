'use client'

/**
 * UserRoleSelector — per-row role dropdown for the team-management table.
 *
 * Wraps the `updateUserRole` server action. On error (e.g. last-admin guard,
 * self-demote, forbidden) the inline message renders below the select and the
 * dropdown value is reverted to the user's current role so the UI never drifts
 * from server state.
 *
 * Disabled when:
 *   - the user is the currently signed-in user (cannot edit self)
 *   - the user account is inactive
 *   - a transition is in flight
 */

import { useState, useTransition } from 'react'
import { updateUserRole } from '@/actions/users'
import type { UserRole } from '@/lib/auth/types'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'viewer', label: 'Viewer' },
]

type Props = {
  userId: string
  currentRole: UserRole
  /** True when this row represents the signed-in user. Disables the control. */
  isSelf: boolean
  /** True when the user account is deactivated. Disables the control. */
  isInactive: boolean
}

export function UserRoleSelector({ userId, currentRole, isSelf, isInactive }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Track the value shown in the dropdown so we can revert on server error.
  const [value, setValue] = useState<UserRole>(currentRole)

  function handleChange(nextRole: UserRole) {
    if (nextRole === value) return
    setError(null)
    const previous = value
    setValue(nextRole)
    startTransition(async () => {
      const result = await updateUserRole(userId, nextRole)
      if (!result.ok) {
        setError(result.error)
        // Revert the dropdown — the server state never changed.
        setValue(previous)
      }
    })
  }

  const disabled = isSelf || isInactive || pending

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value as UserRole)}
        aria-label="User role"
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
      {error ? (
        <p role="alert" className="text-xs text-red-500 dark:text-red-400 max-w-[16rem]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
