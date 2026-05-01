'use client'

import { useState, useEffect, type MouseEvent } from 'react'
import { DownloadIcon, Loader2 } from 'lucide-react'

/**
 * Safety timeout for the loading spinner. Should match (and slightly exceed)
 * the API route's `maxDuration` so the spinner does not clear before the
 * server-side AI extraction can possibly complete.
 *
 * Route: src/app/api/export/synechron-cv/[candidateId]/route.ts (maxDuration = 60)
 */
const SAFETY_TIMEOUT_MS = 30_000

interface SynechronCvButtonProps {
  candidateId: string
  className?: string
  disabled?: boolean
}

/**
 * "Generate Synechron CV" button.
 *
 * Mirrors the simple <a download> pattern from {@link DownloadPdfButton} but
 * adds a transient loading state so the recruiter sees feedback while the
 * server-side PDF is being generated. The spinner clears when the window
 * regains focus (browser download dialog closed) or after a 30s safety
 * timeout, whichever comes first.
 */
export function SynechronCvButton({ candidateId, className, disabled }: SynechronCvButtonProps) {
  const [loading, setLoading] = useState(false)

  // Defensive cleanup if the component unmounts while a download is in flight.
  useEffect(() => {
    return () => setLoading(false)
  }, [])

  const handleClick = (_e: MouseEvent<HTMLAnchorElement>) => {
    if (disabled || loading) return
    setLoading(true)
    const timeout = setTimeout(() => setLoading(false), SAFETY_TIMEOUT_MS)
    const onFocus = () => {
      setLoading(false)
      clearTimeout(timeout)
      window.removeEventListener('focus', onFocus)
    }
    window.addEventListener('focus', onFocus)
  }

  const baseClass =
    'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-fg-muted)] px-3 py-1.5 hover:bg-[var(--color-bg-input)] hover:text-[var(--color-fg)] transition-colors'
  const stateClass = loading || disabled ? 'opacity-60 pointer-events-none' : ''
  const merged = [className ?? baseClass, stateClass].filter(Boolean).join(' ')

  return (
    <a
      href={disabled ? undefined : `/api/export/synechron-cv/${candidateId}`}
      onClick={handleClick}
      className={merged}
      download
      target="_blank"
      rel="noopener noreferrer"
      aria-busy={loading}
      aria-disabled={disabled || loading}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <DownloadIcon className="h-3.5 w-3.5" />
      )}
      {loading ? 'Generating…' : 'Generate Synechron CV'}
    </a>
  )
}
