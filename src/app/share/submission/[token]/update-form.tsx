'use client'

import { useState, useTransition } from 'react'
import { SubmissionStatusPill } from '@/components/roles/submission-status-pill'
import type { SubmissionStatus } from '@/db/schema/role-submissions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_OPTIONS: Array<{ value: SubmissionStatus; label: string }> = [
  { value: 'interview_scheduled', label: 'Interview scheduled' },
  { value: 'interview_done', label: 'Interview done' },
  { value: 'feedback_pending', label: 'Awaiting our feedback' },
  { value: 'hired', label: 'Hired / accepted' },
  { value: 'rejected', label: 'Not progressing' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  token: string
  currentStatus: SubmissionStatus
}

type SuccessState = {
  status: SubmissionStatus
  statusUpdatedAt: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpdateForm({ token, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState<SubmissionStatus>(
    // Default to the first allowed option if current status is not customer-allowed
    ALLOWED_OPTIONS.find((o) => o.value === currentStatus)?.value ?? ALLOWED_OPTIONS[0].value
  )
  const [notes, setNotes] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const [success, setSuccess] = useState<SuccessState | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    setRateLimited(false)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/share/submission/${token}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: selectedStatus,
            notes: notes.trim() || undefined,
            customerName: customerName.trim() || undefined,
            customerEmail: customerEmail.trim() || undefined,
          }),
        })

        if (res.status === 429) {
          setRateLimited(true)
          return
        }

        const data: unknown = await res.json()

        if (!res.ok) {
          const errorData = data as { error?: string }
          setFormError(errorData?.error ?? 'Something went wrong. Please try again.')
          return
        }

        const successData = data as { status: SubmissionStatus; statusUpdatedAt: string }
        setSuccess({
          status: successData.status,
          statusUpdatedAt: successData.statusUpdatedAt,
        })
      } catch {
        setFormError('Network error. Please check your connection and try again.')
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (success) {
    const updatedAt = new Date(success.statusUpdatedAt)

    return (
      <div className="rounded-lg bg-emerald-950/50 border border-emerald-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-4 h-4 text-emerald-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-emerald-300">
            Your update has been recorded
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SubmissionStatusPill status={success.status} />
          <span className="text-xs text-[var(--color-fg-subtle)]">
            Updated{' '}
            {updatedAt.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </div>
        <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
          Your recruiter will be notified of this change.
        </p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Status select */}
      <div>
        <label
          htmlFor="submission-status"
          className="block text-sm font-medium text-[var(--color-fg)] mb-1.5"
        >
          New status
        </label>
        <div className="relative">
          <select
            id="submission-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as SubmissionStatus)}
            disabled={isPending}
            className="w-full appearance-none rounded-md border border-[var(--color-border)]
                       bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm px-3 py-2 pr-8
                       focus:outline-none focus:ring-1 focus:ring-blue-500
                       focus:border-transparent disabled:opacity-50 cursor-pointer"
          >
            {ALLOWED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-fg-subtle)] pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Notes textarea */}
      <div>
        <label
          htmlFor="submission-notes"
          className="block text-sm font-medium text-[var(--color-fg)] mb-1.5"
        >
          Notes{' '}
          <span className="font-normal text-[var(--color-fg-subtle)]">(optional)</span>
        </label>
        <textarea
          id="submission-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={isPending}
          placeholder="Optional notes for the recruiter"
          maxLength={2000}
          className="w-full rounded-md border border-[var(--color-border)]
                     bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm
                     px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                     focus:border-transparent disabled:opacity-50 resize-none
                     placeholder:text-[var(--color-fg-subtle)]"
        />
      </div>

      {/* Optional identity fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="customer-name"
            className="block text-sm font-medium text-[var(--color-fg)] mb-1.5"
          >
            Your name{' '}
            <span className="font-normal text-[var(--color-fg-subtle)]">(optional)</span>
          </label>
          <input
            id="customer-name"
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={isPending}
            placeholder="Jane Smith"
            maxLength={200}
            className="w-full rounded-md border border-[var(--color-border)]
                       bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm
                       px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                       focus:border-transparent disabled:opacity-50
                       placeholder:text-[var(--color-fg-subtle)]"
          />
        </div>
        <div>
          <label
            htmlFor="customer-email"
            className="block text-sm font-medium text-[var(--color-fg)] mb-1.5"
          >
            Your email{' '}
            <span className="font-normal text-[var(--color-fg-subtle)]">(optional)</span>
          </label>
          <input
            id="customer-email"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            disabled={isPending}
            placeholder="jane@company.com"
            maxLength={320}
            className="w-full rounded-md border border-[var(--color-border)]
                       bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm
                       px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                       focus:border-transparent disabled:opacity-50
                       placeholder:text-[var(--color-fg-subtle)]"
          />
        </div>
      </div>

      {/* Error messages */}
      {rateLimited && (
        <div className="rounded-md bg-amber-950/50 border border-amber-800 px-3 py-2">
          <p className="text-xs text-amber-300">
            Too many updates — please try again later.
          </p>
        </div>
      )}

      {formError && (
        <div className="rounded-md bg-red-950/50 border border-red-800 px-3 py-2">
          <p className="text-xs text-red-300">{formError}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md
                   bg-blue-600 text-white text-sm font-medium px-4 py-2.5
                   hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500
                   focus:ring-offset-2 focus:ring-offset-[var(--color-bg-elevated)]
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Submitting…
          </>
        ) : (
          'Update status'
        )}
      </button>
    </form>
  )
}
