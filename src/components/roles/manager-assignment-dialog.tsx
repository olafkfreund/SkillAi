'use client'

/**
 * ManagerAssignmentDialog — recruiter UI for assigning hiring managers to a role.
 *
 * Usage:
 *   <ManagerAssignmentDialog
 *     roleId={role.id}
 *     tenantUsers={hiringManagerUsers}
 *     currentManagers={currentManagers}
 *   />
 *
 * The parent server component supplies:
 *   - tenantUsers: users already filtered to role === 'hiring_manager'
 *   - currentManagers: from getRoleManagers({ roleId }) — Wave 1C action
 */

import { useState, useTransition, useCallback, useEffect } from 'react'
import { UsersIcon, XIcon, CheckIcon } from 'lucide-react'
import { assignRoleManagers } from '@/actions/role-managers'
import type { UserRole } from '@/lib/auth/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TenantUser = {
  id: string
  name: string | null
  email: string
  role: UserRole
}

type CurrentManager = {
  userId: string
  isPrimary: boolean
}

type Props = {
  roleId: string
  tenantUsers: TenantUser[]
  currentManagers: CurrentManager[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManagerAssignmentDialog({
  roleId,
  tenantUsers,
  currentManagers,
}: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentManagers.map((m) => m.userId))
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Reset internal state when dialog re-opens so it reflects latest server data.
  function handleOpen() {
    setSelected(new Set(currentManagers.map((m) => m.userId)))
    setError(null)
    setSuccess(false)
    setOpen(true)
  }

  const handleClose = useCallback(() => {
    if (isPending) return
    setOpen(false)
  }, [isPending])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  function handleSave() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await assignRoleManagers(roleId, Array.from(selected))
      if (!result.success) {
        setError(result.error)
        return
      }
      setSuccess(true)
      // Delay close slightly so the user sees the success state
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
      }, 800)
    })
  }

  const assignedCount = currentManagers.length

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)]
                   bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm font-medium px-3 py-1.5
                   hover:bg-[var(--color-border)] hover:border-[var(--color-border)] transition-colors"
        aria-label={`Assign managers — ${assignedCount} currently assigned`}
      >
        <UsersIcon className="h-3.5 w-3.5" />
        Assign managers ({assignedCount})
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Assign hiring managers to role"
        >
          <div
            className="relative bg-[var(--color-bg-app)] border border-[var(--color-border)] rounded-xl p-6
                        max-w-md w-[calc(100vw-2rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-fg)]">
                  Assign hiring managers
                </h2>
                <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                  Select one or more managers who will review this role&apos;s shortlist.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors rounded-md p-2 md:p-1
                           hover:bg-[var(--color-bg-input)] disabled:opacity-40"
                aria-label="Close dialog"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Manager checklist */}
            {tenantUsers.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-subtle)] mb-5">
                No hiring manager accounts found in this tenant.
              </p>
            ) : (
              <ul className="space-y-1.5 mb-5 max-h-64 overflow-y-auto pr-1"
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Hiring managers">
                {tenantUsers.map((user) => {
                  const isChecked = selected.has(user.id)
                  return (
                    <li key={user.id}>
                      <label
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer
                                    transition-colors
                                    ${isChecked
                                      ? 'border-violet-600 bg-violet-950/40 text-[var(--color-fg)]'
                                      : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-input)]'
                                    }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isChecked}
                          onChange={() => toggleUser(user.id)}
                          disabled={isPending}
                          aria-label={`Select ${user.name ?? user.email}`}
                        />
                        {/* Custom checkbox indicator */}
                        <span
                          className={`flex-shrink-0 h-4 w-4 rounded border flex items-center justify-center
                                      ${isChecked
                                        ? 'bg-violet-600 border-violet-600'
                                        : 'border-[var(--color-border)] bg-[var(--color-bg-input)]'
                                      }`}
                          aria-hidden="true"
                        >
                          {isChecked && <CheckIcon className="h-3 w-3 text-white" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user.name ?? user.email}
                          </p>
                          {user.name && (
                            <p className="text-xs text-[var(--color-fg-subtle)] truncate">{user.email}</p>
                          )}
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Feedback */}
            {error && (
              <p className="text-xs text-red-400 mb-3" role="alert">{error}</p>
            )}
            {success && (
              <p className="text-xs text-green-400 mb-3" role="status">Managers updated.</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="inline-flex items-center rounded-md border border-[var(--color-border)]
                           text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] text-sm font-medium px-3 py-1.5
                           transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || tenantUsers.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600
                           hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5
                           transition-colors disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
