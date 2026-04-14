'use client'

import { DownloadIcon } from 'lucide-react'

type Props = {
  href: string
  label?: string
  className?: string
}

/**
 * A direct-download anchor for PDF exports.
 *
 * Uses a plain <a> tag with the `download` attribute rather than a
 * fetch-then-blob pattern. This is the simplest, most reliable way to
 * trigger a browser file download:
 *   - No React state machinery to get stuck on
 *   - Session cookies ride the request automatically
 *   - Content-Disposition from the server sets the filename
 *   - Works even if JS is partially hydrated
 */
export function DownloadPdfButton({ href, label = 'Download PDF', className }: Props) {
  return (
    <a
      href={href}
      download
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-md border border-zinc-600 text-sm text-zinc-400 px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-200 transition-colors'
      }
    >
      <DownloadIcon className="h-3.5 w-3.5" />
      {label}
    </a>
  )
}
