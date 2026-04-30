'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, XIcon, CheckIcon, HomeIcon } from 'lucide-react'
import { bulkUpdateCandidateStatus, bulkAssignToInternalAgency } from '@/actions/candidates'
import { SubmitToCustomerButton } from '@/components/roles/submit-to-customer-button'
import type { CandidateStatus } from '@/db/schema/candidates'

const STATUS_OPTIONS: Array<{ value: CandidateStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'hired', label: 'Hired' },
]

type Props = {
  selectedIds: string[]
  onClear: () => void
  /** When provided (role detail page only), shows the "Submit to customer" action. */
  roleId?: string
}

export function BulkStatusBar({ selectedIds, onClear, roleId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState<CandidateStatus>('shortlisted')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Bar is hidden when nothing is selected
  if (selectedIds.length === 0) return null

  function handleApply() {
    setError(null)
    setToast(null)
    startTransition(async () => {
      const result = await bulkUpdateCandidateStatus(selectedIds, selectedStatus)
      if (!result.success) {
        setError(result.error ?? 'Failed to update candidates')
        return
      }
      onClear()
      router.refresh()
    })
  }

  function handleMarkInternal() {
    setError(null)
    setToast(null)
    startTransition(async () => {
      const result = await bulkAssignToInternalAgency(selectedIds)
      if (!result.success) {
        setError(result.error ?? 'Failed to mark candidates as internal')
        return
      }
      setToast(`Marked ${result.updated} candidate${result.updated === 1 ? '' : 's'} as Internal`)
      onClear()
      router.refresh()
    })
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-700 px-6 py-4
                 flex items-center gap-4 z-50 shadow-2xl"
      role="region"
      aria-label="Bulk status actions"
    >
      {/* Selection count */}
      <span className="text-sm font-medium text-zinc-200 flex-shrink-0">
        {selectedIds.length} candidate{selectedIds.length !== 1 ? 's' : ''} selected
      </span>

      <div className="flex items-center gap-3 flex-1">
        {/* Status picker */}
        <div className="relative flex items-center">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as CandidateStatus)}
            disabled={isPending}
            aria-label="Select new status for selected candidates"
            className="appearance-none rounded-md border border-zinc-600 bg-zinc-800 text-zinc-200
                       text-sm px-3 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-blue-500
                       focus:border-transparent disabled:opacity-50 cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-1.5 h-4 w-4 text-zinc-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-sm
                     font-medium px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50
                     disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckIcon className="h-4 w-4" />
          )}
          Apply
        </button>

        {/* Mark as Internal — secondary action */}
        <button
          onClick={handleMarkInternal}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-800 bg-blue-950 text-blue-300
                     text-sm font-medium px-3 py-1.5 hover:bg-blue-900 disabled:opacity-50
                     disabled:cursor-not-allowed transition-colors flex-shrink-0"
          title="Move selected candidates to the Internal agency"
        >
          <HomeIcon className="h-4 w-4" />
          Mark as Internal
        </button>

        {/* Submit to customer — only visible on the role detail page */}
        {roleId && (
          <SubmitToCustomerButton
            roleId={roleId}
            selectedCandidateIds={selectedIds}
            onSuccess={() => {
              onClear()
              router.refresh()
            }}
          />
        )}

        {/* Error / success message */}
        {error && (
          <span className="text-sm text-red-400 truncate" role="alert">
            {error}
          </span>
        )}
        {toast && !error && (
          <span className="text-sm text-emerald-400 truncate" role="status">
            {toast}
          </span>
        )}
      </div>

      {/* Clear selection */}
      <button
        onClick={onClear}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200
                   transition-colors px-2 py-1.5 flex-shrink-0 disabled:opacity-50"
        aria-label="Clear selection"
      >
        <XIcon className="h-4 w-4" />
        Clear selection
      </button>
    </div>
  )
}
