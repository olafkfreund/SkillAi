'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  BriefcaseIcon,
  SparklesIcon,
  Loader2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ZapIcon,
} from 'lucide-react'
import { getRoleFitSuggestionsForCandidate, type RoleFitSuggestion } from '@/actions/matching'
import { rescoreCandidate } from '@/actions/scores'

type Props = {
  candidateId: string
}

function FitScoreBadge({ score }: { score: number }) {
  const colorClass =
    score >= 75
      ? 'bg-green-900 border-green-700 text-green-300'
      : score >= 50
        ? 'bg-blue-900 border-blue-700 text-blue-300'
        : 'bg-[var(--color-bg-input)] border-[var(--color-border)] text-[var(--color-fg-muted)]'

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold ${colorClass}`}
    >
      {score}/100
    </span>
  )
}

function RoleFitCard({
  suggestion,
  candidateId,
}: {
  suggestion: RoleFitSuggestion
  candidateId: string
}) {
  const [addedState, setAddedState] = useState<'idle' | 'pending' | 'done'>('idle')

  async function handleAdd() {
    setAddedState('pending')
    try {
      await rescoreCandidate(candidateId, suggestion.role.id)
      setAddedState('done')
    } catch {
      setAddedState('idle')
    }
  }

  return (
    <div className="rounded-lg bg-[var(--color-bg-input)]/60 border border-[var(--color-border)] px-4 py-4">
      {/* Card header: title + score + add button */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/dashboard/roles/${suggestion.role.id}`}
            className="text-sm font-semibold text-[var(--color-fg)] hover:text-blue-300 transition-colors truncate"
          >
            {suggestion.role.title}
          </Link>
          <FitScoreBadge score={suggestion.fit.fitScore} />
        </div>

        <div className="flex-shrink-0">
          {addedState === 'done' ? (
            <span className="text-xs font-medium text-green-400">Added — scoring queued</span>
          ) : (
            <button
              onClick={handleAdd}
              disabled={addedState === 'pending'}
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-bg-input)] text-[var(--color-fg)] text-xs
                         font-medium px-3 py-1.5 hover:bg-[var(--color-border)] transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addedState === 'pending' ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ZapIcon className="h-3.5 w-3.5" />
              )}
              Add to this role
            </button>
          )}
        </div>
      </div>

      {/* Headline */}
      <p className="text-xs italic text-[var(--color-fg-muted)] mb-3">{suggestion.fit.headline}</p>

      {/* Pros */}
      {suggestion.fit.pros.length > 0 && (
        <ul className="mb-2 space-y-1">
          {suggestion.fit.pros.map((pro, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-fg)]">
              <span className="mt-px text-emerald-400 flex-shrink-0">&#10003;</span>
              {pro}
            </li>
          ))}
        </ul>
      )}

      {/* Cons */}
      {suggestion.fit.cons.length > 0 && (
        <ul className="space-y-1">
          {suggestion.fit.cons.map((con, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-fg-muted)]">
              <span className="mt-px text-amber-400 flex-shrink-0">&#9888;</span>
              {con}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * MatchingRolesPanel
 *
 * Displays a collapsible panel on the candidate profile page. When the recruiter
 * clicks "Find matching roles", it calls the Claude-powered server action and
 * renders a card per active role with fit score, pros, cons, and an option to
 * queue the candidate for scoring against that role.
 */
export function MatchingRolesPanel({ candidateId }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<RoleFitSuggestion[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hasSearched, setHasSearched] = useState(false)

  function handleFind() {
    startTransition(async () => {
      const results = await getRoleFitSuggestionsForCandidate(candidateId)
      setSuggestions(results)
      setHasSearched(true)
    })
  }

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl mb-6 overflow-hidden">
      {/* Collapsible toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-4 text-left
                   hover:bg-[var(--color-bg-input)]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BriefcaseIcon className="h-4 w-4 text-violet-400 flex-shrink-0" />
          <span className="font-semibold text-[var(--color-fg)]">Matching Roles</span>
        </div>
        {isOpen ? (
          <ChevronUpIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-5 border-t border-[var(--color-border)]">
          {/* Analyse button */}
          <div className="flex items-center justify-between py-4">
            <p className="text-sm text-[var(--color-fg-subtle)]">
              {hasSearched
                ? suggestions && suggestions.length > 0
                  ? `${suggestions.length} role${suggestions.length !== 1 ? 's' : ''} analysed`
                  : 'Analysis complete'
                : 'Click to find roles that match this candidate.'}
            </p>
            <button
              onClick={handleFind}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md bg-violet-700 text-white text-sm
                         font-medium px-4 py-2 hover:bg-violet-600 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {isPending ? 'Analysing…' : 'Find matching roles'}
            </button>
          </div>

          {/* Loading state */}
          {isPending && (
            <p className="text-sm text-[var(--color-fg-subtle)] mb-4">
              Analysing candidate against active roles…
            </p>
          )}

          {/* Empty state after search */}
          {!isPending && hasSearched && suggestions !== null && suggestions.length === 0 && (
            <p className="text-sm text-[var(--color-fg-subtle)]">
              No active roles found, or candidate profile needs more data.
            </p>
          )}

          {/* Results */}
          {!isPending && suggestions !== null && suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions.map((s) => (
                <RoleFitCard
                  key={s.role.id}
                  suggestion={s}
                  candidateId={candidateId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
