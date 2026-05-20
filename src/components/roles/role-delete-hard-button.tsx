'use client'

/**
 * RoleDeleteHardButton — Admin-only hard-delete control for a single role.
 *
 * Renders a red "Delete (Hard)" button that opens a confirmation modal.
 * The admin must type the role's title exactly (case-sensitive) before the
 * delete action is enabled.
 *
 * Pattern mirrors UserDeleteGdprButton + the candidate GDPR delete dialog;
 * the underlying deleteRoleHard action follows the DEC-011 cascade approach
 * (explicit transactional deletes + audit redaction-not-deletion).
 *
 * On success the user is sent back to the roles list.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2Icon, XIcon } from 'lucide-react'
import { deleteRoleHard } from '@/actions/roles'

type Props = {
  roleId: string
  roleTitle: string
}

export function RoleDeleteHardButton({ roleId, roleTitle }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [typedTitle, setTypedTitle] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const canDelete = typedTitle === roleTitle

  function openModal() {
    setTypedTitle('')
    setDeleteError(null)
    setDeleteSuccess(false)
    setModalOpen(true)
  }

  function closeModal() {
    if (isPending) return
    setModalOpen(false)
    setTypedTitle('')
    setDeleteError(null)
  }

  function handleConfirmDelete() {
    if (!canDelete || isPending) return

    startTransition(async () => {
      setDeleteError(null)
      const result = await deleteRoleHard({ roleId, typedConfirmation: typedTitle })
      if (result.ok) {
        setDeleteSuccess(true)
        setTimeout(() => {
          setModalOpen(false)
          router.push('/dashboard/roles')
          router.refresh()
        }, 1000)
      } else {
        setDeleteError(result.error)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={`Permanently delete ${roleTitle}`}
        className="flex items-center gap-2 rounded-md border border-red-900 bg-[var(--color-bg-input)] text-red-500 text-sm
                   font-medium px-4 py-2 hover:bg-red-950 hover:border-red-700 hover:text-red-400
                   transition-colors"
      >
        <Trash2Icon className="h-4 w-4" />
        Delete (Hard)
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
            aria-labelledby="role-hard-delete-title"
            className="relative z-10 w-[calc(100vw-2rem)] max-w-md bg-[var(--color-bg-elevated)] border border-red-900
                       rounded-xl shadow-2xl p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <h3
                id="role-hard-delete-title"
                className="font-semibold text-red-400 text-base"
              >
                Permanently delete role?
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
                delete the role{' '}
                <span className="font-semibold text-[var(--color-fg)]">
                  &ldquo;{roleTitle}&rdquo;
                </span>{' '}
                and all associated data including scores, interview packs,
                manager approvals, role submissions, and manager assignments.
              </p>
              <p>
                Audit log entries will be{' '}
                <strong className="text-[var(--color-fg)]">retained</strong> but
                personal identifiers will be redacted to preserve the system
                audit trail.
              </p>
              <p className="text-red-400 font-medium">
                This action cannot be undone. If you only want to hide the role,
                use Archive instead.
              </p>
            </div>

            {/* Typed confirmation input */}
            <div className="mb-5">
              <label
                htmlFor="role-hard-delete-confirm"
                className="block text-xs text-[var(--color-fg-muted)] mb-1.5"
              >
                Type the role title to confirm:{' '}
                <span className="font-semibold text-[var(--color-fg)]">{roleTitle}</span>
              </label>
              <input
                id="role-hard-delete-confirm"
                type="text"
                value={typedTitle}
                onChange={(e) => {
                  setTypedTitle(e.target.value)
                  setDeleteError(null)
                }}
                disabled={isPending || deleteSuccess}
                placeholder={roleTitle}
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
                Role deleted successfully.
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
