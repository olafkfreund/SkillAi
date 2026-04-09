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
    return <p className="mt-1.5 text-xs text-zinc-500">{reasoning}</p>
  }

  return (
    <>
      <p className="mt-1.5 text-xs text-zinc-500">
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
            className="relative bg-zinc-950 border border-zinc-700 rounded-xl p-6 max-w-xl w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{dimension}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Score: {score}/100</p>
              </div>
              <button
                onClick={close}
                className="text-zinc-500 hover:text-zinc-300 transition-colors rounded-md p-1 hover:bg-zinc-800"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Full reasoning */}
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{reasoning}</p>
          </div>
        </div>
      )}
    </>
  )
}
