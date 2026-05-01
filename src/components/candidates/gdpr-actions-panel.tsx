'use client'

/**
 * GdprActionsPanel — Admin-only GDPR controls on the candidate detail page.
 *
 * - "Export all data (GDPR)" triggers a DSAR ZIP download (Article 15).
 * - "Delete candidate (GDPR)" opens a confirmation modal and performs a
 *   hard-delete when the admin types the candidate's full name (Article 17).
 *
 * Both actions are gated to admin role on the server; this component is only
 * rendered by the page when session.user.role === 'admin'.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DownloadIcon, Trash2Icon, XIcon, ShieldIcon } from 'lucide-react'
import { deleteCandidateForGdpr } from '@/actions/gdpr'

type Props = {
  candidateId: string
  candidateName: string
}

export function GdprActionsPanel({ candidateId, candidateName }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const canDelete = typedName === candidateName

  function openModal() {
    setTypedName('')
    setDeleteError(null)
    setDeleteSuccess(false)
    setModalOpen(true)
  }

  function closeModal() {
    if (isPending) return // Don't allow closing while deletion is in-flight
    setModalOpen(false)
    setTypedName('')
    setDeleteError(null)
  }

  function handleConfirmDelete() {
    if (!canDelete || isPending) return

    startTransition(async () => {
      setDeleteError(null)
      const result = await deleteCandidateForGdpr({ candidateId, typedConfirmation: typedName })
      if (result.ok) {
        setDeleteSuccess(true)
        // Brief pause so the user can read the success message before navigation
        setTimeout(() => {
          router.push('/dashboard/candidates')
        }, 1500)
      } else {
        setDeleteError(result.error)
      }
    })
  }

  return (
    <>
      {/* Panel card */}
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-red-900/50 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldIcon className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-red-400">GDPR Actions (Admin only)</h2>
        </div>

        <p className="text-xs text-[var(--color-fg-subtle)] mb-5">
          These actions are irreversible and are provided to fulfil data subject rights
          under the General Data Protection Regulation (GDPR).
        </p>

        <div className="flex flex-wrap gap-3">
          {/* Article 15 — DSAR export */}
          <a
            href={`/api/export/dsar/${candidateId}`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)]
                       bg-[var(--color-bg-input)] text-[var(--color-fg)] text-xs font-medium px-3 py-1.5
                       hover:bg-[var(--color-border)] transition-colors"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Export all data (GDPR)
          </a>

          {/* Article 17 — Right to erasure */}
          <button
            type="button"
            onClick={openModal}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-800
                       bg-red-950 text-red-400 text-xs font-medium px-3 py-1.5
                       hover:bg-red-900 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
            Delete candidate (GDPR)
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
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
            aria-labelledby="gdpr-delete-title"
            className="relative z-10 w-[calc(100vw-2rem)] max-w-md bg-[var(--color-bg-elevated)] border border-red-900
                       rounded-xl shadow-2xl p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <h3
                id="gdpr-delete-title"
                className="font-semibold text-red-400 text-base"
              >
                Permanently delete candidate?
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
                This will <strong className="text-[var(--color-fg)]">permanently and irreversibly</strong> delete
                this candidate and all associated data including scores, notes, interview packs,
                transcripts, and the uploaded CV file.
              </p>
              <p>
                Audit log entries will be{' '}
                <strong className="text-[var(--color-fg)]">retained</strong> but personal
                identifiers will be redacted to comply with GDPR Article 17 while
                preserving the system audit trail.
              </p>
              <p className="text-red-400 font-medium">This action cannot be undone.</p>
            </div>

            {/* Typed confirmation input */}
            <div className="mb-5">
              <label
                htmlFor="gdpr-confirm-name"
                className="block text-xs text-[var(--color-fg-muted)] mb-1.5"
              >
                Type the candidate&apos;s full name to confirm:{' '}
                <span className="font-semibold text-[var(--color-fg)]">{candidateName}</span>
              </label>
              <input
                id="gdpr-confirm-name"
                type="text"
                value={typedName}
                onChange={(e) => {
                  setTypedName(e.target.value)
                  setDeleteError(null)
                }}
                disabled={isPending || deleteSuccess}
                placeholder={candidateName}
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
                Candidate deleted. Redirecting...
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
