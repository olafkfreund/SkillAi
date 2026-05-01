'use client'

import type { Score } from '@/db/schema'
import { ScoreExpandModal } from './score-expand-modal'

type DimensionRow = {
  label: string
  score: number | null
  reasoning: string | null
  color: string
}

type Props = { score: Score }

export function ScoreChart({ score }: Props) {
  const dimensions: DimensionRow[] = [
    {
      label: 'Technical Skills',
      score: score.technicalScore,
      reasoning: score.technicalReasoning,
      color: 'bg-blue-500',
    },
    {
      label: 'Experience Level',
      score: score.experienceScore,
      reasoning: score.experienceReasoning,
      color: 'bg-indigo-500',
    },
    {
      label: 'Cultural Fit',
      score: score.culturalFitScore,
      reasoning: score.culturalFitReasoning,
      color: 'bg-violet-500',
    },
    {
      label: 'Communication',
      score: score.communicationScore,
      reasoning: score.communicationReasoning,
      color: 'bg-purple-500',
    },
  ]

  return (
    <div className="space-y-5">
      {dimensions.map((dim) => (
        <div key={dim.label}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-[var(--color-fg)]">{dim.label}</span>
            <span className="text-sm font-bold text-[var(--color-fg)]">
              {dim.score !== null ? `${dim.score}/100` : '—'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-bg-input)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${dim.color}`}
              style={{ width: `${dim.score ?? 0}%` }}
            />
          </div>
          {dim.reasoning && dim.score !== null ? (
            <ScoreExpandModal
              dimension={dim.label}
              score={dim.score}
              reasoning={dim.reasoning}
            />
          ) : dim.reasoning ? (
            <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">{dim.reasoning}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
