'use client'

import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface ChipInputProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  /** Maximum number of chips. Defaults to 15. */
  maxChips?: number
  /** Maximum length of a single chip (HTML maxLength on the input). Defaults to 120. */
  maxLength?: number
  disabled?: boolean
  className?: string
  /** id on the underlying input — useful for label association */
  id?: string
  'aria-describedby'?: string
}

/**
 * Generic, controlled chip-input.
 *
 * Parent owns the array via `value` + `onChange`. The component holds only the
 * draft text being typed.
 *
 * Commit triggers: Enter or comma. Whitespace-only drafts are rejected.
 * Duplicates are rejected case-insensitively. Backspace on an empty input
 * removes the last chip. When `maxChips` is reached, the input is hidden and
 * a small "Max reached" hint is shown.
 *
 * Style intentionally uses the yellow palette — this is the manager-priority
 * colour from Epic #42 and the chips will be reused for must-have / nice-to-have
 * keyword inputs on roles.
 */
export function ChipInput({
  value,
  onChange,
  placeholder,
  maxChips = 15,
  maxLength = 120,
  disabled = false,
  className,
  id,
  'aria-describedby': ariaDescribedBy,
}: ChipInputProps) {
  const [draft, setDraft] = useState('')

  const lowerSet = useMemo(
    () => new Set(value.map((v) => v.trim().toLowerCase())),
    [value]
  )

  const atLimit = value.length >= maxChips
  const inputHidden = atLimit

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return false
      if (lowerSet.has(trimmed.toLowerCase())) return false
      if (value.length >= maxChips) return false
      onChange([...value, trimmed])
      return true
    },
    [lowerSet, maxChips, onChange, value]
  )

  const removeAt = useCallback(
    (index: number) => {
      const next = value.slice()
      next.splice(index, 1)
      onChange(next)
    },
    [onChange, value]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        if (commit(draft)) {
          setDraft('')
        }
        return
      }
      if (e.key === 'Backspace' && draft === '' && value.length > 0) {
        e.preventDefault()
        removeAt(value.length - 1)
      }
    },
    [commit, draft, removeAt, value.length]
  )

  return (
    <div
      className={
        'flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5' +
        (disabled ? ' opacity-60' : '') +
        (className ? ` ${className}` : '')
      }
    >
      {value.map((chip, idx) => (
        <span
          key={`${chip}-${idx}`}
          className="inline-flex items-center gap-1 rounded-full border border-yellow-700 bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-100"
        >
          <span>{chip}</span>
          <button
            type="button"
            aria-label={`Remove ${chip}`}
            disabled={disabled}
            onClick={() => removeAt(idx)}
            className="p-1 rounded text-yellow-300 hover:text-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      {inputHidden ? (
        <span className="text-xs text-zinc-500" aria-live="polite">
          Max reached
        </span>
      ) : (
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
        />
      )}
    </div>
  )
}
