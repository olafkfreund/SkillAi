'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { updateCandidateStatus } from '@/actions/candidates'
import type { CandidateStatus } from '@/db/schema/candidates'

const STATUS_OPTIONS: Array<{ value: CandidateStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'hired', label: 'Hired' },
]

const STATUS_BADGE: Record<CandidateStatus, string> = {
  new: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600',
  shortlisted: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  interviewing: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  offered: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700',
  rejected: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
  hired: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
}

interface StatusSelectorProps {
  candidateId: string
  currentStatus: string
}

export function StatusSelector({ candidateId, currentStatus }: StatusSelectorProps) {
  const [isPending, startTransition] = useTransition()

  const safeStatus = (STATUS_OPTIONS.find((o) => o.value === currentStatus)?.value ??
    'new') as CandidateStatus

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as CandidateStatus
    startTransition(() => {
      updateCandidateStatus(candidateId, newStatus)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`relative flex items-center rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[safeStatus]}`}>
        {STATUS_OPTIONS.find((o) => o.value === safeStatus)?.label ?? safeStatus}
      </div>
      <div className="relative flex items-center">
        <select
          value={safeStatus}
          onChange={handleChange}
          disabled={isPending}
          aria-label="Change candidate status"
          className="appearance-none rounded-md border border-zinc-600 bg-zinc-800 text-zinc-300
                     text-xs px-3 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-blue-500
                     focus:border-transparent disabled:opacity-50 cursor-pointer"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isPending && (
          <Loader2 className="absolute right-1.5 h-3.5 w-3.5 animate-spin text-zinc-400 pointer-events-none" />
        )}
        {!isPending && (
          <svg
            className="absolute right-1.5 h-3.5 w-3.5 text-zinc-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </div>
  )
}
