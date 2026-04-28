'use client'

import { useState, useTransition } from 'react'
import { CheckIcon, XIcon, RotateCcwIcon, CheckCheckIcon } from 'lucide-react'
import {
  approveCandidate,
  rejectCandidate,
  approveAllRemaining,
} from '@/actions/approvals'

// ---------------------------------------------------------------------------
// ApprovalControls — per-candidate approve / reject with comment field
// ---------------------------------------------------------------------------

type Decision = 'pending' | 'approved' | 'rejected'

type ApprovalControlsProps = {
  roleId: string
  candidateId: string
  currentDecision: Decision
  currentComment: string | null
}

export function ApprovalControls({
  roleId,
  candidateId,
  currentDecision,
  currentComment,
}: ApprovalControlsProps) {
  const [comment, setComment] = useState(currentComment ?? '')
  const [decision, setDecision] = useState<Decision>(currentDecision)
  const [savedComment, setSavedComment] = useState(currentComment ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [isPending, startTransition] = useTransition()

  function flash() {
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2500)
  }

  function handleApprove() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await approveCandidate(roleId, candidateId, comment)
      if (!result.success) {
        setError(result.error)
        return
      }
      setDecision('approved')
      setSavedComment(comment)
      flash()
    })
  }

  function handleReject() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await rejectCandidate(roleId, candidateId, comment)
      if (!result.success) {
        setError(result.error)
        return
      }
      setDecision('rejected')
      setSavedComment(comment)
      flash()
    })
  }

  function handleClear() {
    setDecision('pending')
    setComment('')
    setSavedComment('')
    setError(null)
    setSuccess(false)
  }

  const decisionLabel: Record<Decision, { label: string; classes: string }> = {
    approved: {
      label: 'Approved',
      classes: 'text-green-400 bg-green-950 border border-green-800',
    },
    rejected: {
      label: 'Rejected',
      classes: 'text-red-400 bg-red-950 border border-red-800',
    },
    pending: {
      label: 'Pending',
      classes: 'text-amber-400 bg-amber-950 border border-amber-800',
    },
  }

  const badge = decisionLabel[decision]

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-5 space-y-4">
      {/* Current decision badge */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-zinc-400">Decision:</span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.classes}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Previously saved comment (read-only display when decided) */}
      {decision !== 'pending' && savedComment && (
        <p className="text-sm text-zinc-400 bg-zinc-800 rounded-md px-3 py-2 border border-zinc-700">
          {savedComment}
        </p>
      )}

      {/* Comment textarea */}
      <div>
        <label
          htmlFor={`approval-comment-${candidateId}`}
          className="block text-xs font-medium text-zinc-500 mb-1"
        >
          Comment (optional)
        </label>
        <textarea
          id={`approval-comment-${candidateId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment for this decision…"
          rows={3}
          disabled={isPending}
          className="w-full rounded-md bg-zinc-800 border border-zinc-700
                     text-sm text-zinc-200 placeholder-zinc-500 px-3 py-2
                     focus:outline-none focus:ring-1 focus:ring-violet-600
                     resize-none disabled:opacity-50"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending || decision === 'approved'}
          aria-label="Approve candidate"
          className="inline-flex items-center gap-1.5 rounded-md bg-green-700
                     hover:bg-green-600 text-white text-sm font-medium px-3 py-1.5
                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {isPending && decision !== 'rejected' ? 'Saving…' : 'Approve'}
        </button>

        <button
          type="button"
          onClick={handleReject}
          disabled={isPending || decision === 'rejected'}
          aria-label="Reject candidate"
          className="inline-flex items-center gap-1.5 rounded-md bg-red-700
                     hover:bg-red-600 text-white text-sm font-medium px-3 py-1.5
                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <XIcon className="h-3.5 w-3.5" />
          {isPending && decision === 'rejected' ? 'Saving…' : 'Reject'}
        </button>

        {decision !== 'pending' && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            aria-label="Clear decision"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600
                       text-zinc-400 hover:text-zinc-200 text-sm font-medium px-3 py-1.5
                       transition-colors disabled:opacity-40"
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && (
        <p className="text-xs text-green-400">Decision saved.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ApproveAllRemainingButton — bulk-approve all pending candidates on a role
// ---------------------------------------------------------------------------

type ApproveAllRemainingButtonProps = {
  roleId: string
  pendingCount: number
}

export function ApproveAllRemainingButton({
  roleId,
  pendingCount,
}: ApproveAllRemainingButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleInitialClick() {
    setError(null)
    setConfirming(true)
  }

  function handleCancel() {
    setConfirming(false)
    setError(null)
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await approveAllRemaining(roleId)
      if (!result.success) {
        setError(result.error)
        setConfirming(false)
        return
      }
      setConfirming(false)
      setDone(true)
    })
  }

  if (done) {
    return (
      <p className="text-sm text-green-400 flex items-center gap-1.5">
        <CheckCheckIcon className="h-4 w-4" />
        All remaining candidates approved.
      </p>
    )
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-sm text-amber-300">
          Approve all {pendingCount} remaining?
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-md bg-green-700
                     hover:bg-green-600 text-white text-xs font-medium px-2.5 py-1.5
                     transition-colors disabled:opacity-50"
        >
          <CheckIcon className="h-3 w-3" />
          {isPending ? 'Approving…' : `Yes, approve ${pendingCount}`}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-600
                     text-zinc-400 hover:text-zinc-200 text-xs font-medium px-2.5 py-1.5
                     transition-colors disabled:opacity-50"
        >
          <XIcon className="h-3 w-3" />
          Cancel
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleInitialClick}
        disabled={pendingCount === 0 || isPending}
        aria-label={`Approve all remaining ${pendingCount} candidates`}
        className="inline-flex items-center gap-1.5 rounded-md bg-zinc-700
                   hover:bg-zinc-600 text-zinc-100 text-sm font-medium px-3 py-1.5
                   transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <CheckCheckIcon className="h-4 w-4" />
        Approve all remaining ({pendingCount})
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
