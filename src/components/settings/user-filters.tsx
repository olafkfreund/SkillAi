'use client'

/**
 * UserFilters — URL-param-driven filter toolbar for /dashboard/users.
 *
 * Query param shape:
 *   ?role=admin,recruiter   (comma-separated; omit key for "all roles")
 *   ?status=active          ("active" | "deactivated" | "all"; default "all")
 *   ?lastLogin=7d           ("any" | "7d" | "30d" | "never"; default "any")
 *   ?pendingInvite=1        (presence toggle; 1 = show only users with pending invite)
 *
 * Mirrors the pattern established in candidate-filters.tsx and
 * submission-filters.tsx: client component updates URL params on every
 * change so the parent server component re-renders with filtered data.
 */

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { XIcon, MailIcon } from 'lucide-react'
import type { UserRole } from '@/lib/auth/types'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'viewer', label: 'Viewer' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
]

const LAST_LOGIN_OPTIONS = [
  { value: 'any', label: 'Any last login' },
  { value: '7d', label: 'Active in last 7 days' },
  { value: '30d', label: 'Active in last 30 days' },
  { value: 'never', label: 'Never active' },
]

export type UserFilterParams = {
  roles?: string    // comma-separated UserRole values
  status?: string   // "active" | "deactivated" | "all"
  lastLogin?: string // "any" | "7d" | "30d" | "never"
  pendingInvite?: string // "1" or absent
}

type Props = {
  currentFilters: UserFilterParams
}

const selectClass =
  'bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-3 py-2 ' +
  'text-sm text-[var(--color-fg)] ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
  'transition-colors cursor-pointer'

export function UserFilters({ currentFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  // Build a new URLSearchParams from the current state, apply updates, push.
  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams()
      if (currentFilters.roles) params.set('role', currentFilters.roles)
      if (currentFilters.status && currentFilters.status !== 'all') params.set('status', currentFilters.status)
      if (currentFilters.lastLogin && currentFilters.lastLogin !== 'any') params.set('lastLogin', currentFilters.lastLogin)
      if (currentFilters.pendingInvite) params.set('pendingInvite', currentFilters.pendingInvite)

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }

      startTransition(() => {
        router.replace(pathname + (params.toString() ? '?' + params.toString() : ''), {
          scroll: false,
        })
      })
    },
    [router, pathname, currentFilters, startTransition]
  )

  // Role multi-select: toggle individual roles in/out of the comma-separated param
  const selectedRoles = new Set<UserRole>(
    (currentFilters.roles?.split(',').filter(Boolean) as UserRole[]) ?? []
  )

  const handleRoleToggle = (role: UserRole) => {
    const next = new Set(selectedRoles)
    if (next.has(role)) {
      next.delete(role)
    } else {
      next.add(role)
    }
    updateParams({ role: Array.from(next).join(',') })
  }

  const handleStatusChange = (value: string) => {
    updateParams({ status: value === 'all' ? '' : value })
  }

  const handleLastLoginChange = (value: string) => {
    updateParams({ lastLogin: value === 'any' ? '' : value })
  }

  const handlePendingInviteToggle = () => {
    updateParams({ pendingInvite: currentFilters.pendingInvite ? '' : '1' })
  }

  const hasActiveFilters =
    !!currentFilters.roles ||
    (!!currentFilters.status && currentFilters.status !== 'all') ||
    (!!currentFilters.lastLogin && currentFilters.lastLogin !== 'any') ||
    !!currentFilters.pendingInvite

  const clearFilters = () => {
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  return (
    <div
      className="flex flex-col gap-3
                 sm:flex-row sm:items-center sm:flex-wrap"
    >
      {/* Role multi-select pills */}
      <div
        className="flex items-center gap-1.5 flex-wrap"
        role="group"
        aria-label="Filter by role"
      >
        {ROLE_OPTIONS.map((opt) => {
          const isSelected = selectedRoles.has(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleRoleToggle(opt.value)}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer
                          ${isSelected
                            ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                            : 'border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)]'
                          }`}
            >
              {opt.label}
              {isSelected && <XIcon className="h-3 w-3 opacity-70" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {/* Status filter */}
      <select
        value={currentFilters.status ?? 'all'}
        onChange={(e) => handleStatusChange(e.target.value)}
        className={selectClass}
        aria-label="Filter by account status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Last login filter */}
      <select
        value={currentFilters.lastLogin ?? 'any'}
        onChange={(e) => handleLastLoginChange(e.target.value)}
        className={selectClass}
        aria-label="Filter by last login"
      >
        {LAST_LOGIN_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Pending invite toggle */}
      <button
        type="button"
        onClick={handlePendingInviteToggle}
        aria-pressed={!!currentFilters.pendingInvite}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm
                    transition-colors cursor-pointer
                    ${currentFilters.pendingInvite
                      ? 'border-amber-500 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] hover:bg-[var(--color-bg-elevated)]'
                    }`}
      >
        <MailIcon className="h-4 w-4" aria-hidden="true" />
        Pending invite
        {currentFilters.pendingInvite && (
          <XIcon className="h-3.5 w-3.5 ml-0.5 opacity-70" aria-hidden="true" />
        )}
      </button>

      {/* Clear all filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     transition-colors px-2 py-2"
          aria-label="Clear all user filters"
        >
          <XIcon className="h-4 w-4" />
          Clear
        </button>
      )}
    </div>
  )
}
