'use client'

/**
 * UserDeleteGdprButton — Admin-only GDPR hard-delete control for a single user.
 *
 * Renders a red "Delete (GDPR)" button that opens a confirmation modal.
 * The admin must type the target user's email address exactly before the
 * delete action is enabled.
 *
 * Guards:
 *   - Disabled when the target user is the currently-signed-in user (self-delete
 *     guard is enforced on the server; UI reinforces it).
 *   - Server-side checks also enforce last-admin guard and role gate.
 *
 * On success the row is removed from the parent list via the onDeleted callback.
 */

import { useState, useTransition } from 'react'
import { Trash2Icon, XIcon } from 'lucide-react'
import { deleteUserForGdpr } from '@/actions/gdpr'

type Props = {
  /** UUID of the user to delete. */
  userId: string
  /** Email of the user to delete — shown in the confirmation prompt. */
  userEmail: string
  /** Display name of the user (used in UI only). */
  userName: string
  /** UUID of the currently signed-in admin — disables button for self. */
  currentUserId: string
  /** Called after a successful deletion so the parent can remove the row. */
  onDeleted: (deletedUserId: string) => void
}

export function UserDeleteGdprButton({
  userId,
  userEmail,
  userName,
  currentUserId,
  onDeleted,
}: Props) {
  const isSelf = userId === currentUserId

  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const canDelete = typedEmail === userEmail

  function openModal() {
    setTypedEmail('')
    setDeleteError(null)
    setDeleteSuccess(false)
    setModalOpen(true)
  }

  function closeModal() {
    if (isPending) return
    setModalOpen(false)
    setTypedEmail('')
    setDeleteError(null)
  }

  function handleConfirmDelete() {
    if (!canDelete || isPending) return

    startTransition(async () => {
      setDeleteError(null)
      const result = await deleteUserForGdpr({ userId, typedConfirmation: typedEmail })
      if (result.ok) {
        setDeleteSuccess(true)
        // Brief pause so the admin can read the success state before the row disappears
        setTimeout(() => {
          setModalOpen(false)
          onDeleted(userId)
        }, 1200)
      } else {
        setDeleteError(result.error)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        disabled={isSelf || isPending}
        onClick={openModal}
        title={isSelf ? 'You cannot delete your own account' : `Delete ${userName} (GDPR)`}
        className="text-xs px-2 py-1 rounded-md border border-red-900 text-red-500
                   hover:bg-red-950 hover:border-red-700 hover:text-red-400
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
      >
        Delete (GDPR)
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-gdpr-delete-title"
            className="relative z-10 w-[calc(100vw-2rem)] max-w-md bg-[var(--color-bg-elevated)] border border-red-900
                       rounded-xl shadow-2xl p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <h3
                id="user-gdpr-delete-title"
                className="font-semibold text-red-400 text-base"
              >
                Permanently delete user?
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="p-2 md:p-1 rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] ml-4 shrink-0 disabled:opacity-50"
                aria-label="Close dialog"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Description */}
            <div className="text-sm text-[var(--color-fg-muted)] space-y-2 mb-5">
              <p>
                This will{' '}
                <strong className="text-[var(--color-fg)]">
                  permanently and irreversibly
                </strong>{' '}
                delete the account for{' '}
                <span className="font-semibold text-[var(--color-fg)]">{userName}</span>{' '}
                ({userEmail}) and all associated data including API tokens, calendar
                connections, role assignments, and notes authored by this user.
              </p>
              <p>
                Audit log entries will be{' '}
                <strong className="text-[var(--color-fg)]">retained</strong> but personal
                identifiers will be redacted to comply with GDPR Article 17 while
                preserving the system audit trail.
              </p>
              <p className="text-red-400 font-medium">
                This action cannot be undone.
              </p>
            </div>

            {/* Typed confirmation input */}
            <div className="mb-5">
              <label
                htmlFor="user-gdpr-confirm-email"
                className="block text-xs text-[var(--color-fg-muted)] mb-1.5"
              >
                Type the user&apos;s email address to confirm:{' '}
                <span className="font-semibold text-[var(--color-fg)]">{userEmail}</span>
              </label>
              <input
                id="user-gdpr-confirm-email"
                type="text"
                value={typedEmail}
                onChange={(e) => {
                  setTypedEmail(e.target.value)
                  setDeleteError(null)
                }}
                disabled={isPending || deleteSuccess}
                placeholder={userEmail}
                autoComplete="off"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2
                           text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)]
                           focus:border-red-700 focus:outline-none focus:ring-1 focus:ring-red-700
                           disabled:opacity-50"
              />
            </div>

            {/* Error message */}
            {deleteError && (
              <p className="text-sm text-red-400 mb-4">{deleteError}</p>
            )}

            {/* Success message */}
            {deleteSuccess && (
              <p className="text-sm text-emerald-400 mb-4">
                User deleted successfully.
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                           text-sm font-medium px-4 py-2
                           hover:bg-[var(--color-border)] transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!canDelete || isPending || deleteSuccess}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-700
                           bg-red-900 text-red-200 text-sm font-medium px-4 py-2
                           hover:bg-red-800 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                {isPending ? 'Deleting...' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
