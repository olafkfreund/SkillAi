'use client'

import { useState } from 'react'
import { DownloadIcon, Loader2Icon } from 'lucide-react'

const STATUS_OPTIONS = [
  { label: 'Shortlisted', value: 'shortlisted' },
  { label: 'Interviewing', value: 'interviewing' },
  { label: 'Offered', value: 'offered' },
  { label: 'Hired', value: 'hired' },
  { label: 'All', value: 'all' },
] as const

type Props = {
  roleId: string
}

export function DownloadCvsButton({ roleId }: Props) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('shortlisted')

  function handleDownload() {
    setLoading(true)
    const url = `/api/export/cvs/${roleId}?status=${status}`
    window.open(url, '_blank')
    setTimeout(() => setLoading(false), 600)
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        disabled={loading}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-md px-2 py-1.5
                   text-sm text-[var(--color-fg)]
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   transition-colors cursor-pointer disabled:opacity-50"
        aria-label="Candidate status filter for CV download"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)]
                   text-sm text-[var(--color-fg-muted)] px-3 py-1.5
                   hover:bg-[var(--color-bg-input)] disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <DownloadIcon className="h-3.5 w-3.5" />
        )}
        Download CVs
      </button>
    </div>
  )
}
