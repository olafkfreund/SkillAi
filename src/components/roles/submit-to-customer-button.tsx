'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { SendIcon, Loader2Icon, XIcon } from 'lucide-react'
import { submitCandidatesToCustomer } from '@/actions/role-submissions'

type Props = {
  roleId: string
  selectedCandidateIds: string[]
  onSuccess: () => void
}

export function SubmitToCustomerButton({ roleId, selectedCandidateIds, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleClose = useCallback(() => {
    if (isPending) return
    setOpen(false)
    setError(null)
    setNotes('')
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

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await submitCandidatesToCustomer(
        roleId,
        selectedCandidateIds,
        notes.trim() || undefined
      )
      if (!result.success) {
        setError(result.error)
        return
      }
      setOpen(false)
      setNotes('')
      onSuccess()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={selectedCandidateIds.length === 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 dark:border-emerald-800
                   bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-sm font-medium px-3 py-1.5
                   hover:bg-emerald-200 dark:hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors flex-shrink-0"
        title="Submit selected candidates to customer"
      >
        <SendIcon className="h-4 w-4" />
        Submit to customer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Submit candidates to customer"
        >
          <div
            className="relative bg-zinc-950 border border-zinc-700 rounded-xl p-6
                        max-w-md w-[calc(100vw-2rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Submit to customer</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Submit {selectedCandidateIds.length} candidate{selectedCandidateIds.length !== 1 ? 's' : ''} to the customer for this role.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="p-2 md:p-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Optional notes */}
            <div className="mb-5">
              <label htmlFor="stc-notes" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Notes <span className="text-zinc-600">(optional, visible to recruiters only)</span>
              </label>
              <textarea
                id="stc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes (visible only to recruiters)"
                disabled={isPending}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100
                           text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50 resize-none"
              />
            </div>

            {/* Inline error */}
            {error && (
              <p className="mb-4 text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300
                           text-sm font-medium px-4 py-2
                           hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50
                           transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || selectedCandidateIds.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 text-white
                           text-sm font-medium px-4 py-2
                           hover:bg-emerald-600 disabled:opacity-60 transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
