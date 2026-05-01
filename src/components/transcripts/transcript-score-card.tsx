import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from 'lucide-react'

type Dimension = {
  label: string
  score: number | null
  reasoning: string | null
  color: string
}

type Props = {
  overallScore: number | null
  communicationScore: number | null
  communicationReasoning: string | null
  technicalDepthScore: number | null
  technicalDepthReasoning: string | null
  problemSolvingScore: number | null
  problemSolvingReasoning: string | null
  socialFitScore: number | null
  socialFitReasoning: string | null
  recommendedDecision: 'proceed' | 'consider' | 'decline' | null
  summary: string | null
}

const DECISION_CONFIG = {
  proceed: {
    label: 'Proceed',
    icon: CheckCircleIcon,
    classes: 'bg-emerald-950 border-emerald-800 text-emerald-400',
  },
  consider: {
    label: 'Consider',
    icon: MinusCircleIcon,
    classes: 'bg-amber-950 border-amber-800 text-amber-400',
  },
  decline: {
    label: 'Decline',
    icon: XCircleIcon,
    classes: 'bg-red-950 border-red-800 text-red-400',
  },
}

export function TranscriptScoreCard({
  overallScore,
  communicationScore,
  communicationReasoning,
  technicalDepthScore,
  technicalDepthReasoning,
  problemSolvingScore,
  problemSolvingReasoning,
  socialFitScore,
  socialFitReasoning,
  recommendedDecision,
  summary,
}: Props) {
  const dimensions: Dimension[] = [
    {
      label: 'Communication',
      score: communicationScore,
      reasoning: communicationReasoning,
      color: 'bg-blue-500',
    },
    {
      label: 'Technical Depth',
      score: technicalDepthScore,
      reasoning: technicalDepthReasoning,
      color: 'bg-indigo-500',
    },
    {
      label: 'Problem Solving',
      score: problemSolvingScore,
      reasoning: problemSolvingReasoning,
      color: 'bg-violet-500',
    },
    {
      label: 'Social Fit',
      score: socialFitScore,
      reasoning: socialFitReasoning,
      color: 'bg-purple-500',
    },
  ]

  const decision = recommendedDecision ? DECISION_CONFIG[recommendedDecision] : null
  const DecisionIcon = decision?.icon

  return (
    <div className="space-y-4">
      {/* Overall score + decision badge */}
      <div className="flex items-center justify-between">
        {overallScore !== null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-[var(--color-fg)]">{overallScore}</span>
            <span className="text-sm text-[var(--color-fg-subtle)]">/100</span>
          </div>
        )}
        {decision && DecisionIcon && (
          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${decision.classes}`}>
            <DecisionIcon className="h-3.5 w-3.5" />
            {decision.label}
          </div>
        )}
      </div>

      {/* Dimension bars */}
      <div className="space-y-4">
        {dimensions.map((dim) => (
          <div key={dim.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-[var(--color-fg)]">{dim.label}</span>
              <span className="text-sm font-bold text-[var(--color-fg)]">
                {dim.score !== null ? `${dim.score}/100` : '—'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${dim.color}`}
                style={{ width: `${dim.score ?? 0}%` }}
              />
            </div>
            {dim.reasoning && (
              <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)] line-clamp-2">{dim.reasoning}</p>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {summary && (
        <div className="pt-4 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-fg-muted)]">{summary}</p>
        </div>
      )}
    </div>
  )
}
