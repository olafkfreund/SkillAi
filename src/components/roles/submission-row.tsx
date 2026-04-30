'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Trash2Icon, LinkIcon, CopyIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { SubmissionStatusPill } from './submission-status-pill'
import { updateSubmissionStatus, removeSubmission, generateShareToken, revokeShareToken } from '@/actions/role-submissions'
import type { SubmissionStatus } from '@/db/schema/role-submissions'
import type { SubmissionWithDetails } from '@/actions/role-submissions'

const STATUS_OPTIONS: Array<{ value: SubmissionStatus; label: string }> = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'interview_scheduled', label: 'Interview scheduled' },
  { value: 'interview_done', label: 'Interview done' },
  { value: 'feedback_pending', label: 'Feedback pending' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

function timeAgo(date: Date): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

type Props = {
  submission: SubmissionWithDetails
}

export function SubmissionRow({ submission }: Props) {
  const agencyId = submission.candidate.agencyId
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<SubmissionStatus>(submission.status)
  const [currentNotes, setCurrentNotes] = useState<string>(submission.notes ?? '')
  const [notesOpen, setNotesOpen] = useState(false)
  const [removeConfirming, setRemoveConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Share-token state
  const [shareToken, setShareToken] = useState<string | null>(submission.shareToken ?? null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [revokeConfirming, setRevokeConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  function buildShareUrl(token: string): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/share/submission/${token}`
    }
    return `/share/submission/${token}`
  }

  const { candidate, sentAt, statusUpdatedAt } = submission

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SubmissionStatus
    setError(null)
    startTransition(async () => {
      const result = await updateSubmissionStatus(submission.id, next)
      if (!result.success) {
        setError(result.error)
        return
      }
      setCurrentStatus(next)
      router.refresh()
    })
  }

  function handleNotesSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateSubmissionStatus(submission.id, currentStatus, currentNotes)
      if (!result.success) {
        setError(result.error)
        return
      }
      setNotesOpen(false)
      router.refresh()
    })
  }

  function handleRemoveConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await removeSubmission(submission.id)
      if (!result.success) {
        setError(result.error)
        setRemoveConfirming(false)
        return
      }
      router.refresh()
    })
  }

  async function handleGenerateShareToken() {
    setIsGenerating(true)
    setError(null)
    const result = await generateShareToken(submission.id)
    setIsGenerating(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setShareToken(result.data.token)
  }

  async function handleRevokeConfirm() {
    setError(null)
    const result = await revokeShareToken(submission.id)
    if (!result.success) {
      setError(result.error)
      setRevokeConfirming(false)
      return
    }
    setShareToken(null)
    setRevokeConfirming(false)
    router.refresh()
  }

  function handleCopyLink() {
    if (!shareToken) return
    const url = buildShareUrl(shareToken)
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  return (
    <div
      className={`flex items-start justify-between gap-4 px-4 py-3 rounded-lg bg-zinc-800/50
                  border border-zinc-700/50 transition-opacity ${isPending ? 'opacity-60' : ''}`}
    >
      {/* Left: candidate identity + agency */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {agencyId ? (
            candidate.agencyLogoPath ? (
              <img
                src={candidate.agencyLogoPath}
                alt=""
                width={20}
                height={20}
                style={{ width: 20, height: 20 }}
                className="rounded-full border border-zinc-700 bg-zinc-800 object-contain shrink-0"
              />
            ) : candidate.agencyName ? (
              <div
                className="flex items-center justify-center rounded-full bg-zinc-800
                           text-zinc-400 text-xs font-semibold shrink-0"
                style={{ width: 20, height: 20 }}
                aria-hidden="true"
              >
                {candidate.agencyName.charAt(0).toUpperCase()}
              </div>
            ) : null
          ) : null}

          <Link
            href={`/dashboard/candidates/${submission.candidateId}?roleId=${submission.roleId}`}
            className="text-sm font-medium text-zinc-100 hover:text-blue-400 transition-colors"
          >
            {candidate.firstName} {candidate.lastName}
          </Link>

          {candidate.agencyName && (
            <span className="text-xs text-zinc-500">{candidate.agencyName}</span>
          )}
        </div>

        {/* Middle: pill + timing */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <SubmissionStatusPill status={currentStatus} />
          <span className="text-xs text-zinc-500">
            Sent {timeAgo(sentAt)}, last update {timeAgo(statusUpdatedAt)}
          </span>
        </div>

        {/* Notes expander */}
        {notesOpen && (
          <div className="mt-2 space-y-2">
            <textarea
              value={currentNotes}
              onChange={(e) => setCurrentNotes(e.target.value)}
              rows={3}
              placeholder="Add notes (visible to recruiters only)"
              disabled={isPending}
              className="w-full rounded-md border border-zinc-600 bg-zinc-900 text-zinc-200
                         text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                         disabled:opacity-50 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNotesSave}
                disabled={isPending}
                className="inline-flex items-center rounded-md bg-blue-600 text-white text-xs
                           font-medium px-2.5 py-1 hover:bg-blue-500 disabled:opacity-50
                           transition-colors"
              >
                Save notes
              </button>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                disabled={isPending}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Right: status select + notes toggle + remove */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Status dropdown */}
        <div className="relative">
          <select
            value={currentStatus}
            onChange={handleStatusChange}
            disabled={isPending}
            aria-label={`Update status for ${candidate.firstName} ${candidate.lastName}`}
            className="appearance-none rounded-md border border-zinc-600 bg-zinc-800 text-zinc-200
                       text-xs px-2.5 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-500
                       focus:border-transparent disabled:opacity-50 cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Notes toggle */}
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          disabled={isPending}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-1.5 py-1
                     rounded border border-transparent hover:border-zinc-600"
          aria-label="Toggle notes"
          title={submission.notes ? 'Edit notes' : 'Add notes'}
        >
          {submission.notes ? 'Notes ✎' : 'Notes'}
        </button>

        {/* Share link — two states: no token vs token exists */}
        {shareToken ? (
          <div className="flex items-center gap-1.5">
            {/* Copy link button */}
            <button
              type="button"
              onClick={handleCopyLink}
              title="Copy customer share link"
              aria-label="Copy share link to clipboard"
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200
                         px-1.5 py-1 rounded border border-transparent hover:border-zinc-600
                         transition-colors"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3 w-3" />
                  <span>Copy link</span>
                </>
              )}
            </button>

            {/* Revoke — two-step inline confirm */}
            {revokeConfirming ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-amber-400">Revoke?</span>
                <button
                  type="button"
                  onClick={handleRevokeConfirm}
                  disabled={isPending}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setRevokeConfirming(false)}
                  disabled={isPending}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRevokeConfirming(true)}
                disabled={isPending}
                className="text-xs text-zinc-600 hover:text-amber-400 transition-colors"
                title="Revoke share link"
              >
                Revoke
              </button>
            )}
          </div>
        ) : (
          /* No token yet — show "Share with customer" */
          <button
            type="button"
            onClick={handleGenerateShareToken}
            disabled={isGenerating || isPending}
            title="Generate a share link for this submission"
            aria-label={`Share ${candidate.firstName} ${candidate.lastName}'s submission with customer`}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200
                       px-1.5 py-1 rounded border border-transparent hover:border-zinc-600
                       transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2Icon className="h-3 w-3 animate-spin" />
                <span>Sharing…</span>
              </>
            ) : (
              <>
                <LinkIcon className="h-3 w-3" />
                <span>Share</span>
              </>
            )}
          </button>
        )}

        {/* Remove — two-step inline confirm */}
        {removeConfirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-400">Remove?</span>
            <button
              type="button"
              onClick={handleRemoveConfirm}
              disabled={isPending}
              className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setRemoveConfirming(false)}
              disabled={isPending}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRemoveConfirming(true)}
            disabled={isPending}
            title="Remove from submitted"
            aria-label={`Remove ${candidate.firstName} ${candidate.lastName} from submitted`}
            className="p-2 md:p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-950/40
                       border border-transparent hover:border-red-800 transition-colors"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
