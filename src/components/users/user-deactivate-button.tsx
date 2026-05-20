'use client'

/**
 * UserDeactivateButton — toggle a user between active and inactive.
 *
 * Renders as a single button whose label flips based on `isActive`:
 *   - active   → "Deactivate" (red, opens confirm modal)
 *   - inactive → "Reactivate" (no modal — restoration is reversible)
 *
 * The current user (self) cannot be deactivated; the button is disabled
 * with a tooltip when `isSelf` is true. Server-side guards in
 * src/actions/users.ts enforce the same rules plus the last-admin guard.
 *
 * Error display: the action throws on guard failures (e.g. last-admin).
 * The catch surfaces the message in an inline error banner above the
 * confirm buttons — no toast lib needed.
 */

import { useState, useTransition } from 'react'
import { deactivateUser, reactivateUser } from '@/actions/users'

type Props = {
  userId: string
  userEmail: string
  isActive: boolean
  isSelf: boolean
}

export function UserDeactivateButton({ userId, userEmail, isActive, isSelf }: Props) {
  const [pending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleDeactivate() {
    setError(null)
    startTransition(async () => {
      try {
        await deactivateUser(userId)
        setShowConfirm(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to deactivate user')
      }
    })
  }

  function handleReactivate() {
    setError(null)
    startTransition(async () => {
      try {
        await reactivateUser(userId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to reactivate user')
      }
    })
  }

  if (!isActive) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={isSelf || pending}
          onClick={handleReactivate}
          className="text-xs px-2 py-1 rounded-md border border-emerald-800 text-emerald-400
                     hover:bg-emerald-950 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
        >
          {pending ? 'Reactivating…' : 'Reactivate'}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={isSelf || pending}
        onClick={() => {
          setError(null)
          setShowConfirm(true)
        }}
        title={isSelf ? 'You cannot deactivate your own account' : undefined}
        className="text-xs px-2 py-1 rounded-md border border-red-800 text-red-400
                   hover:bg-red-950 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
      >
        Deactivate
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !pending && setShowConfirm(false)}
        >
          <div
            className="max-w-md w-full mx-4 rounded-xl border border-[var(--color-border)]
                       bg-[var(--color-bg-elevated)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--color-fg)] mb-2">
              Deactivate user?
            </h3>
            <p className="text-sm text-[var(--color-fg-muted)] mb-4">
              <span className="font-medium text-[var(--color-fg)]">{userEmail}</span> will be
              unable to sign in until reactivated. Their data and audit history are preserved.
            </p>

            {error && (
              <div className="mb-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowConfirm(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)]
                           text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-input)]
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleDeactivate}
                className="text-xs px-3 py-1.5 rounded-md border border-red-800 bg-red-950
                           text-red-300 hover:bg-red-900 disabled:opacity-40
                           disabled:cursor-not-allowed transition-colors"
              >
                {pending ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
