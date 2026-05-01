// Server component — no interactivity needed, pure display.

type ShortlistStatusPillProps = {
  sentAt: Date | null
  total: number
  reviewed: number
  approved: number
  rejected: number
}

function daysAgo(date: Date): number {
  const ms = Date.now() - date.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function formatSentDate(date: Date): string {
  const days = daysAgo(date)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

export function ShortlistStatusPill({
  sentAt,
  total,
  reviewed,
  approved,
  rejected,
}: ShortlistStatusPillProps) {
  if (!sentAt) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-zinc-300 dark:border-zinc-700
                   bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 text-xs font-medium px-3 py-1"
        aria-label="Shortlist not yet sent for approval"
      >
        Not sent for approval
      </span>
    )
  }

  const pending = total - approved - rejected
  const allReviewed = reviewed >= total && total > 0
  const allApproved = allReviewed && approved === total && rejected === 0
  const allRejected = allReviewed && rejected === total && approved === 0

  // Colour logic
  let colourClasses: string
  if (total === 0) {
    colourClasses = 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400'
  } else if (allApproved) {
    colourClasses = 'border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
  } else if (allRejected) {
    colourClasses = 'border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
  } else if (allReviewed) {
    // Mix of approved + rejected — amber
    colourClasses = 'border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
  } else {
    // Still pending reviews
    colourClasses = 'border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
  }

  const sentLabel = formatSentDate(sentAt)

  // Summary text: "Sent 3d ago — 4 approved, 1 rejected, 2 pending"
  const parts: string[] = []
  if (approved > 0) parts.push(`${approved} approved`)
  if (rejected > 0) parts.push(`${rejected} rejected`)
  if (pending > 0) parts.push(`${pending} pending`)

  const summaryText =
    total === 0
      ? 'No candidates shortlisted'
      : parts.join(', ')

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1
                  text-xs font-medium ${colourClasses}`}
      aria-label={`Shortlist sent ${sentLabel}. ${summaryText}`}
    >
      <span>Sent {sentLabel}</span>
      {total > 0 && (
        <>
          <span className="opacity-40">—</span>
          <span>{summaryText}</span>
        </>
      )}
    </span>
  )
}
