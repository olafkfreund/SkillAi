'use client'

import { useState } from 'react'
import { DownloadIcon, Loader2Icon, AlertCircleIcon } from 'lucide-react'

type Props = {
  href: string
  label?: string
  className?: string
}

export function DownloadPdfButton({ href, label = 'Download PDF', className }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(href)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      a.download = match ? match[1] : 'export.pdf'
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Download failed — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        onClick={handleClick}
        disabled={loading}
        className={
          className ??
          'inline-flex items-center gap-1.5 rounded-md border border-zinc-600 text-sm text-zinc-400 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-50 transition-colors'
        }
      >
        {loading ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : error ? (
          <AlertCircleIcon className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <DownloadIcon className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
      {error && (
        <span className="text-xs text-red-400 mt-1">{error}</span>
      )}
    </div>
  )
}
