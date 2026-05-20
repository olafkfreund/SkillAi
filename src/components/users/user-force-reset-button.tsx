'use client'

import { useState, useTransition } from 'react'
import { KeyRound } from 'lucide-react'
import { forcePasswordReset } from '@/actions/users'

type Props = {
  userId: string
  userEmail: string
  /** Disable the control when the row is the current admin's own row. */
  disabled?: boolean
}

type Notice =
  | { kind: 'idle' }
  | { kind: 'success-email' }
  | { kind: 'success-link'; url: string }
  | { kind: 'error'; message: string }

/**
 * UserForceResetButton — admin-only "Force password reset" trigger.
 *
 * Flow:
 *   1. Click → confirmation modal (typed-name not required — single click of
 *      a destructive verb is the existing pattern for deactivate / role
 *      change, matching invitations.tsx).
 *   2. Confirm → calls `forcePasswordReset(userId)`.
 *   3. On success with SMTP configured → toast "Reset email sent to …".
 *   4. On success WITHOUT SMTP → show the one-time link in a copy box; admin
 *      must share it manually because the user will not receive an email.
 *
 * Disabled when the row is the admin's own row — admins should self-service
 * via the change-password flow.
 */
export function UserForceResetButton({ userId, userEmail, disabled = false }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>({ kind: 'idle' })
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    setNotice({ kind: 'idle' })
    startTransition(async () => {
      const result = await forcePasswordReset(userId)
      if (!result.ok) {
        setNotice({ kind: 'error', message: result.error })
        return
      }
      if (result.emailSent) {
        setNotice({ kind: 'success-email' })
      } else {
        setNotice({ kind: 'success-link', url: result.resetUrl })
      }
    })
  }

  function handleClose() {
    setIsOpen(false)
    // Defer clearing notice so the user can read it; reset on next open.
    setTimeout(() => setNotice({ kind: 'idle' }), 200)
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API may be unavailable in non-secure contexts. The link is
      // still visible in the modal for manual selection.
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => setIsOpen(true)}
        title={
          disabled
            ? 'You cannot force-reset your own password — use the change-password flow.'
            : 'Force password reset'
        }
        className="text-xs px-2 py-1 rounded-md border border-amber-800 text-amber-400
                   hover:bg-amber-950 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors inline-flex items-center gap-1"
      >
        <KeyRound className="h-3 w-3" />
        Force reset
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="force-reset-title"
        >
          <div className="w-full max-w-md rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-6 shadow-xl">
            <h2 id="force-reset-title" className="text-base font-semibold text-[var(--color-fg)] mb-2">
              Force password reset
            </h2>
            <p className="text-sm text-[var(--color-fg-muted)] mb-4">
              Generate a one-time reset link for{' '}
              <span className="font-medium text-[var(--color-fg)]">{userEmail}</span>. The link
              expires in 1 hour. If SMTP is configured for this tenant the user will receive an
              email; otherwise you will be shown a link to share manually.
            </p>

            {notice.kind === 'success-email' && (
              <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950 px-4 py-3 text-sm text-emerald-300">
                Reset email sent to {userEmail}.
              </div>
            )}

            {notice.kind === 'success-link' && (
              <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950 px-4 py-3 text-sm text-amber-200">
                <p className="font-medium mb-2">
                  SMTP is not configured — share this link with the user manually:
                </p>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={notice.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-2 py-1 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(notice.url)}
                    className="text-xs px-3 rounded-md border border-amber-700 bg-amber-900 text-amber-100 hover:bg-amber-800"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-amber-400 mt-2">
                  This link will be shown once. It expires in 1 hour.
                </p>
              </div>
            )}

            {notice.kind === 'error' && (
              <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
                {notice.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="text-sm px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-input)]"
              >
                {notice.kind === 'idle' || notice.kind === 'error' ? 'Cancel' : 'Close'}
              </button>
              {(notice.kind === 'idle' || notice.kind === 'error') && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleConfirm}
                  className="text-sm px-3 py-1.5 rounded-md border border-amber-700 bg-amber-900 text-amber-100 hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending ? 'Working…' : 'Force reset'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
