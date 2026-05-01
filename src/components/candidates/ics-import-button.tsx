'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarIcon, Loader2Icon } from 'lucide-react'
import { importIcsSlots } from '@/actions/calendar'

type Props = {
  candidateId: string
  roleId?: string | null
}

/**
 * "Import from file" button that accepts a .ics calendar file, reads it in
 * the browser, and calls the importIcsSlots server action.
 *
 * On success the page is refreshed via router.refresh() so the calendar grid
 * shows the newly created slots without a full navigation.
 */
export function IcsImportButton({ candidateId, roleId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  // Clear any existing feedback after 3 seconds
  const showFeedback = (ok: boolean, message: string) => {
    setFeedback({ ok, message })
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleClick = () => {
    // Reset the input so the same file can be re-selected after an error
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()

    reader.onload = (event) => {
      const content = event.target?.result
      if (typeof content !== 'string') {
        showFeedback(false, 'Could not read file')
        return
      }

      startTransition(async () => {
        const result = await importIcsSlots(candidateId, roleId ?? null, content)

        if (result.success) {
          showFeedback(true, `Imported ${result.imported} slot${result.imported === 1 ? '' : 's'}`)
          router.refresh()
        } else {
          showFeedback(false, result.error)
        }
      })
    }

    reader.onerror = () => {
      showFeedback(false, 'Failed to read file')
    }

    reader.readAsText(file)
  }

  return (
    <div className="flex items-center gap-2">
      {/* Hidden file input — triggered programmatically */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)]
                   border border-[var(--color-border)] rounded-md hover:text-[var(--color-fg)] hover:border-[var(--color-border)]
                   transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CalendarIcon className="h-3.5 w-3.5" />
        )}
        {isPending ? 'Importing…' : 'Import from file'}
      </button>

      {/* Inline feedback message — fades after 3 s via state reset */}
      {feedback && (
        <span
          className={`text-xs font-medium ${
            feedback.ok ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {feedback.ok ? `\u2713 ${feedback.message}` : feedback.message}
        </span>
      )}
    </div>
  )
}
