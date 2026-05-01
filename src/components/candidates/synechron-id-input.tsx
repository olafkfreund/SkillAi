'use client'

import { useState, useTransition, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { updateSynechronCandidateId } from '@/actions/candidates'

interface SynechronIdInputProps {
  candidateId: string
  value: string | null
}

/**
 * Inline editor for the Synechron candidate ID (SYNE-####).
 *
 * Renders as a small inline button:
 *  - When unset: "+ Synechron ID"
 *  - When set:   "SYNE: <value>"
 *
 * Clicking opens a small popover with an input and Save / Cancel actions.
 * Validation matches the server action: max 64 chars, only [A-Za-z0-9-].
 *
 * shadcn/ui Popover is not installed in this project, so this uses a
 * native click-outside pattern with raw Tailwind, consistent with other
 * inline editors here (see status-selector.tsx).
 */
export function SynechronIdInput({ candidateId, value }: SynechronIdInputProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCancel = useCallback(() => {
    setDraft(value ?? '')
    setError(null)
    setOpen(false)
  }, [value])

  // Keep local draft in sync with prop when value changes externally
  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancel()
      }
    }
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscapeKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [open, handleCancel])

  // Autofocus input when popover opens
  useEffect(() => {
    if (open) {
      // next tick — element must be in the DOM
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [open])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = draft.trim()
    startTransition(async () => {
      const result = await updateSynechronCandidateId(candidateId, trimmed || null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
    })
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)]
                   px-2 py-0.5 text-xs font-medium text-[var(--color-fg)]
                   hover:border-[var(--color-border)] hover:text-[var(--color-fg)] transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value ? `SYNE: ${value}` : '+ Synechron ID'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Edit Synechron candidate ID"
          className="absolute left-0 top-full mt-2 z-20 w-72 rounded-md border border-[var(--color-border)]
                     bg-[var(--color-bg-elevated)] p-3 shadow-lg"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--color-fg)]" htmlFor="synechron-id-field">
              Synechron Candidate ID
            </label>
            <input
              id="synechron-id-field"
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="SYNE-1234"
              maxLength={64}
              disabled={pending}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1.5 text-sm
                         text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50"
            />
            <p className="text-[10px] text-[var(--color-fg-subtle)]">Letters, digits and hyphens only. Max 64 characters.</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-1
                           text-xs text-[var(--color-fg)] hover:bg-[var(--color-border)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-blue-700
                           bg-blue-900 px-3 py-1 text-xs font-medium text-blue-200
                           hover:bg-blue-800 disabled:opacity-50"
              >
                {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
