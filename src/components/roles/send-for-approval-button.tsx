'use client'

import { useState, useTransition } from 'react'
import { SendIcon, CheckIcon, XIcon } from 'lucide-react'
import { sendShortlistForApproval } from '@/actions/approvals'

type SendForApprovalButtonProps = {
  roleId: string
  alreadySent: boolean
}

export function SendForApprovalButton({
  roleId,
  alreadySent,
}: SendForApprovalButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(alreadySent)

  const [isPending, startTransition] = useTransition()

  function handleInitialClick() {
    if (sent) return
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
      const result = await sendShortlistForApproval(roleId)
      if (!result.success) {
        setError(result.error)
        setConfirming(false)
        return
      }
      setConfirming(false)
      setSent(true)
    })
  }

  // Already sent — disabled button with inline "Already sent" label
  if (sent) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-label="Shortlist already sent for approval"
          title="Shortlist already sent for manager approval"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700
                     bg-zinc-800 text-zinc-500 text-sm font-medium px-3 py-1.5
                     cursor-not-allowed opacity-60"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          Already sent
        </button>
      </div>
    )
  }

  // Inline confirm step
  if (confirming) {
    return (
      <div className="inline-flex flex-col items-start gap-1.5">
        <div className="inline-flex items-center gap-2">
          <span className="text-sm text-amber-300">
            Send shortlist to hiring managers?
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600
                       hover:bg-violet-500 text-white text-xs font-medium px-2.5 py-1.5
                       transition-colors disabled:opacity-50"
          >
            <SendIcon className="h-3 w-3" />
            {isPending ? 'Sending…' : 'Yes, send'}
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
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  // Default state
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleInitialClick}
        disabled={isPending}
        aria-label="Send shortlist to managers for approval"
        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600
                   hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5
                   transition-colors disabled:opacity-50"
      >
        <SendIcon className="h-3.5 w-3.5" />
        Send shortlist for approval
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
