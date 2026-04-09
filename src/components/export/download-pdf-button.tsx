'use client'

import { useState } from 'react'
import { DownloadIcon, Loader2Icon } from 'lucide-react'

type Props = {
  href: string
  label?: string
  className?: string
}

export function DownloadPdfButton({ href, label = 'Download PDF', className }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(href)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      // Extract filename from Content-Disposition header if available
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      a.download = match ? match[1] : 'export.pdf'
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
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
      ) : (
        <DownloadIcon className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  )
}
