'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon, SparklesIcon, AlertTriangleIcon } from 'lucide-react'
import type { AutoMatchStatusResult, AutoMatchCandidate, AutoMatchRateMatch } from '@/actions/auto-match-status'

type Props = { roleId: string }

// Polled every 3s while the orchestrator is still running; stops once status
// reaches a terminal state. Matches the cadence used by ScorePolling so
// recruiters see a consistent feel across background AI jobs.
const POLL_INTERVAL_MS = 3000

function RateMatchPill({ match, percent }: { match: AutoMatchRateMatch; percent: number | null }) {
  if (match === 'within') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                       bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300
                       border border-emerald-300 dark:border-emerald-800">
        Within budget
      </span>
    )
  }
  if (match === 'over') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                       bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300
                       border border-amber-300 dark:border-amber-800">
        Over by {percent ?? 0}%
      </span>
    )
  }
  if (match === 'currency_mismatch') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                       bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]
                       border border-[var(--color-border)]">
        Currency mismatch
      </span>
    )
  }
  return null // 'unknown' — silent
}

function AvailabilityBadge({ status, availableFrom }: { status: AutoMatchCandidate['availabilityStatus']; availableFrom: string | null }) {
  if (status === 'available') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                       bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300
                       border border-blue-300 dark:border-blue-800">
        Available now
      </span>
    )
  }
  if (status === 'on_project') {
    const formatted = availableFrom
      ? new Date(availableFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : null
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                       bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300
                       border border-violet-300 dark:border-violet-800">
        {formatted ? `Available from ${formatted}` : 'On project'}
      </span>
    )
  }
  return null
}

function AgencyChip({ name, logoPath }: { name: string | null; logoPath: string | null }) {
  if (logoPath && name) {
    return (
      <img
        src={logoPath}
        alt={name}
        width={20}
        height={20}
        className="rounded-full bg-zinc-200 dark:bg-zinc-800 object-contain flex-shrink-0"
        title={name}
      />
    )
  }
  const initials = name ? name.slice(0, 2).toUpperCase() : '·'
  return (
    <span
      className="inline-flex items-center justify-center rounded-full w-5 h-5 text-[10px] font-semibold
                 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex-shrink-0"
      title={name ?? 'No agency'}
    >
      {initials}
    </span>
  )
}

function ScoreBadge({ score, status }: { score: number | null; status: AutoMatchCandidate['scoreStatus'] }) {
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                       bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300
                       border border-red-300 dark:border-red-800">
        Scoring failed
      </span>
    )
  }
  if (score === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
                       bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]
                       border border-[var(--color-border)]">
        <Loader2Icon className="h-3 w-3 animate-spin" />
        Scoring…
      </span>
    )
  }
  const tone =
    score >= 75
      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
      : score >= 50
        ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
        : 'bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] border-[var(--color-border)]'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${tone}`}>
      {score}/100
    </span>
  )
}

function CandidateCard({
  candidate,
  roleId,
}: {
  candidate: AutoMatchCandidate
  roleId: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg
                    bg-[var(--color-bg-input)] border border-[var(--color-border)]
                    px-4 py-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <AgencyChip name={candidate.agencyName} logoPath={candidate.agencyLogoPath} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/candidates/${candidate.id}?roleId=${roleId}`}
            className="text-sm font-medium text-[var(--color-fg)] hover:text-violet-600 dark:hover:text-violet-300
                       transition-colors truncate block"
          >
            {candidate.firstName} {candidate.lastName}
          </Link>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <AvailabilityBadge status={candidate.availabilityStatus} availableFrom={candidate.availableFrom} />
            <RateMatchPill match={candidate.rateMatch} percent={candidate.rateOveragePercent} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ScoreBadge score={candidate.overallScore} status={candidate.scoreStatus} />
      </div>
    </div>
  )
}

/**
 * Auto-match panel for the role detail page (epic #267 / issue #271).
 *
 * Polls /api/roles/{id}/auto-match-status until the orchestrator publishes
 * a terminal audit row. Recruiter+ only — gate enforced by the parent page
 * AND by the API route.
 */
export function ArchiveMatchesPanel({ roleId }: Props) {
  const { data, isLoading } = useQuery<AutoMatchStatusResult>({
    queryKey: ['auto-match-status', roleId],
    queryFn: async () => {
      const res = await fetch(`/api/roles/${roleId}/auto-match-status`)
      if (!res.ok) {
        return { status: 'idle', reason: null, candidates: [] }
      }
      return res.json()
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Stop polling once we have a terminal state. Also stop polling for the
      // idle case (role created before the feature shipped — no signal coming).
      if (status === 'complete' || status === 'failed' || status === 'idle') return false
      return POLL_INTERVAL_MS
    },
    refetchOnWindowFocus: false,
  })

  const status = data?.status ?? (isLoading ? 'pending' : 'idle')

  if (status === 'idle') return null

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <SparklesIcon className="h-4 w-4 text-violet-500 dark:text-violet-400" />
        <h2 className="font-semibold text-[var(--color-fg)]">Top archive matches</h2>
      </div>

      {status === 'pending' && (
        <div className="grid gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)]
                         px-4 py-3 animate-pulse"
            >
              <div className="w-5 h-5 rounded-full bg-[var(--color-border)]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-[var(--color-border)] w-1/3" />
                <div className="h-2 rounded bg-[var(--color-border)] w-1/4" />
              </div>
            </div>
          ))}
          <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
            Scanning archive for matches…
          </p>
        </div>
      )}

      {status === 'failed' && data?.candidates && data.candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40
                          border border-amber-300 dark:border-amber-800
                          text-amber-900 dark:text-amber-200 px-3 py-2 text-xs">
            <AlertTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              {data.reason === 'daily_cost_cap_exceeded'
                ? 'Daily auto-match budget reached. Candidates listed below; scoring will resume tomorrow.'
                : `Auto-match could not complete${data.reason ? `: ${data.reason}` : '.'}`}
            </p>
          </div>
          <div className="grid gap-2">
            {data.candidates.map((c) => (
              <CandidateCard key={c.id} candidate={c} roleId={roleId} />
            ))}
          </div>
        </div>
      )}

      {status === 'failed' && (!data?.candidates || data.candidates.length === 0) && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40
                        border border-amber-300 dark:border-amber-800
                        text-amber-900 dark:text-amber-200 px-3 py-2 text-xs">
          <AlertTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            Auto-match could not complete{data?.reason ? `: ${data.reason}` : '.'} Try again
            from the role action menu when ready.
          </p>
        </div>
      )}

      {status === 'complete' && data?.candidates && data.candidates.length === 0 && (
        <p className="text-sm text-[var(--color-fg-subtle)]">
          No archive matches found. Try widening the budget or relaxing the requirements.
        </p>
      )}

      {status === 'complete' && data?.candidates && data.candidates.length > 0 && (
        <div className="grid gap-2">
          {data.candidates.map((c) => (
            <CandidateCard key={c.id} candidate={c} roleId={roleId} />
          ))}
        </div>
      )}
    </div>
  )
}
