'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Download, SparklesIcon, Loader2Icon, SearchIcon, ZapIcon } from 'lucide-react'
import { getSuggestedCandidates } from '@/actions/matching'
import { rescoreCandidate } from '@/actions/scores'

type SuggestedCandidate = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  filePath: string | null
  similarity: number
}

type Props = {
  roleId: string
  roleText: string
}

function SimilarityBadge({ similarity }: { similarity: number }) {
  const colorClass =
    similarity >= 75
      ? 'bg-green-950 border border-green-700 text-green-300'
      : similarity >= 50
        ? 'bg-blue-950 border border-blue-700 text-blue-300'
        : 'bg-[var(--color-bg-input)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'

  return (
    <span className={`inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 ${colorClass}`}>
      {similarity}% match
    </span>
  )
}

export function SuggestCandidatesPanel({ roleId, roleText }: Props) {
  const [candidates, setCandidates] = useState<SuggestedCandidate[] | null>(null)
  const [notEnoughData, setNotEnoughData] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [scoringId, setScoringId] = useState<string | null>(null)
  const [scoredIds, setScoredIds] = useState<Set<string>>(new Set())

  function handleFind() {
    startTransition(async () => {
      const results = await getSuggestedCandidates(roleId, roleText, 5)
      if (results.length === 0 && candidates === null) {
        setNotEnoughData(true)
      } else {
        setNotEnoughData(false)
      }
      setCandidates(results)
    })
  }

  async function handleScore(candidateId: string) {
    setScoringId(candidateId)
    try {
      await rescoreCandidate(candidateId, roleId)
      setScoredIds((prev) => new Set([...prev, candidateId]))
    } finally {
      setScoringId(null)
    }
  }

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-violet-400" />
          <h2 className="font-semibold text-[var(--color-fg)]">Matching candidates from archive</h2>
        </div>
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
            <SearchIcon className="h-4 w-4" />
          )}
          {isPending ? 'Searching…' : 'Find matching candidates'}
        </button>
      </div>

      {candidates === null && !isPending && (
        <p className="text-[var(--color-fg-subtle)] text-sm">
          Click the button above to find archived candidates who might be a good fit for this role.
        </p>
      )}

      {notEnoughData && candidates !== null && candidates.length === 0 && (
        <p className="text-[var(--color-fg-subtle)] text-sm">
          Not enough candidate data yet. Upload more CVs to enable matching.
        </p>
      )}

      {candidates !== null && candidates.length === 0 && !notEnoughData && (
        <p className="text-[var(--color-fg-subtle)] text-sm">No matching candidates found in archive.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="grid gap-2">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)]
                         px-4 py-3 gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/candidates/${c.id}?roleId=${roleId}`}
                    className="text-sm font-medium text-[var(--color-fg)] hover:text-violet-300 transition-colors truncate block"
                  >
                    {c.firstName} {c.lastName}
                  </Link>
                  {c.email && (
                    <p className="text-xs text-[var(--color-fg-subtle)] truncate">{c.email}</p>
                  )}
                </div>
                <SimilarityBadge similarity={c.similarity} />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {c.filePath && (
                  <a
                    href={`/api/candidates/${c.id}/cv`}
                    download
                    title="Download original CV"
                    className="rounded p-1.5 text-[var(--color-fg-subtle)] hover:text-blue-400 hover:bg-blue-950/40
                               border border-transparent hover:border-blue-800 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {scoredIds.has(c.id) ? (
                  <span className="text-xs text-green-400 font-medium">Queued for scoring</span>
                ) : (
                  <button
                    onClick={() => handleScore(c.id)}
                    disabled={scoringId === c.id}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--color-border)] text-[var(--color-fg)] text-xs
                               font-medium px-3 py-1.5 hover:bg-[var(--color-bg-input)] transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scoringId === c.id ? (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ZapIcon className="h-3.5 w-3.5" />
                    )}
                    Score against this role
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
