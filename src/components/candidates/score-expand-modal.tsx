'use client'

import { useState, useEffect, useCallback } from 'react'
import { XIcon } from 'lucide-react'

type Props = {
  dimension: string
  score: number
  reasoning: string
}

const PREVIEW_LENGTH = 150

export function ScoreExpandModal({ dimension, score, reasoning }: Props) {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const isLong = reasoning.length > PREVIEW_LENGTH
  const preview = isLong ? reasoning.slice(0, PREVIEW_LENGTH).trimEnd() + '…' : reasoning

  if (!isLong) {
    return <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">{reasoning}</p>
  }

  return (
    <>
      <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">
        {preview}{' '}
        <button
          onClick={() => setOpen(true)}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
        >
          Read more
        </button>
      </p>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="relative bg-[var(--color-bg-app)] border border-[var(--color-border)] rounded-xl p-6 max-w-xl w-[calc(100vw-2rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-fg)]">{dimension}</h3>
                <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">Score: {score}/100</p>
              </div>
              <button
                onClick={close}
                className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors rounded-md p-2 md:p-1 hover:bg-[var(--color-bg-input)]"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Full reasoning */}
            <p className="text-sm text-[var(--color-fg)] leading-relaxed whitespace-pre-wrap">{reasoning}</p>
          </div>
        </div>
      )}
    </>
  )
}
