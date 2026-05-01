'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SparklesIcon, RefreshCwIcon } from 'lucide-react'

interface PriorityKeywordsPanelProps {
  keywords: string[] | null
  canEdit: boolean
  audience?: 'recruiter' | 'customer' | 'manager'
  /** Where to send the recruiter to edit priorities (the existing role edit page). */
  roleEditHref: string
}

/**
 * Renders the role's manager priority keywords as soft-signal chips.
 * Edits flow through the existing role edit page — there is no inline edit here.
 */
export function PriorityKeywordsPanel({
  keywords,
  canEdit,
  audience = 'recruiter',
  roleEditHref,
}: PriorityKeywordsPanelProps) {
  const isManagerView = audience === 'manager'
  const items = (keywords ?? []).filter((k) => k.trim().length > 0)
  const empty = items.length === 0

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[var(--color-fg)] flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-yellow-400" />
          Manager Priorities
        </h2>
        {canEdit && !isManagerView && (
          <a
            href={roleEditHref}
            className="text-xs text-[var(--color-fg-muted)] border border-[var(--color-border)] rounded-md px-3 py-1.5
                       hover:bg-[var(--color-bg-input)] transition-colors"
          >
            {empty ? 'Add priorities' : 'Edit'}
          </a>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-[var(--color-fg-subtle)]">
          {canEdit
            ? 'No manager priorities recorded for this role. Click "Add priorities" to record what the hiring manager cares about most.'
            : 'No manager priorities recorded for this role.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center rounded-full bg-yellow-950 border border-yellow-800
                         text-yellow-300 text-xs font-medium px-3 py-1"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-fg-subtle)]">
        Soft-signal priorities surfaced in AI scoring summaries. Not a numeric dimension.
      </p>
    </div>
  )
}

interface StaleScorePillProps {
  candidateId: string
  roleId: string
  rescoreAction: (
    candidateId: string,
    roleId: string,
  ) => Promise<{ success: boolean; error?: string }>
}

/**
 * Pill rendered alongside an outdated score. Clicking it triggers a rescore
 * via the existing `rescoreCandidate` action and refreshes the route.
 */
export function StaleScorePill({
  candidateId,
  roleId,
  rescoreAction,
}: StaleScorePillProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const result = await rescoreAction(candidateId, roleId)
      if (result.success) router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Manager priorities have changed since this score was generated. Click to rescore."
      className="inline-flex items-center gap-1 rounded-full border border-yellow-700
                 bg-yellow-900/40 px-2 py-0.5 text-[10px] font-medium text-yellow-200
                 hover:bg-yellow-900/70 hover:text-yellow-100
                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <RefreshCwIcon className={`h-2.5 w-2.5 ${isPending ? 'animate-spin' : ''}`} />
      {isPending ? 'Rescoring…' : 'Priorities updated · rescore'}
    </button>
  )
}
