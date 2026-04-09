import Link from 'next/link'

type RoleHistoryEntry = {
  scoreId: string
  roleId: string
  roleTitle: string
  overallScore: number | null
  scoreStatus: string
  technicalScore: number | null
  experienceScore: number | null
  culturalFitScore: number | null
  communicationScore: number | null
  scoredAt: Date
}

type Props = {
  roleHistory: RoleHistoryEntry[]
}

function scoreBadgeClass(score: number): string {
  if (score >= 75) return 'bg-green-900 text-green-300 border-green-700'
  if (score >= 50) return 'bg-blue-900 text-blue-300 border-blue-700'
  return 'bg-zinc-800 text-zinc-400 border-zinc-600'
}

function DimensionPill({ label, score }: { label: string; score: number | null }) {
  if (score === null) return null
  const colorClass =
    score >= 75
      ? 'bg-green-900/50 text-green-300'
      : score >= 50
        ? 'bg-blue-900/50 text-blue-300'
        : 'bg-zinc-800 text-zinc-400'
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label} {score}
    </span>
  )
}

export function RoleHistoryPanel({ roleHistory }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-5 mb-6">
      <h2 className="font-semibold text-zinc-100 mb-4">Role History</h2>

      {roleHistory.length === 0 ? (
        <p className="text-sm text-zinc-500">No roles scored yet.</p>
      ) : (
        <ul className="space-y-3">
          {roleHistory.map((entry) => {
            const date = new Date(entry.scoredAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })

            const isComplete = entry.scoreStatus === 'complete'
            const isFailed = entry.scoreStatus === 'failed'
            const isPending =
              entry.scoreStatus === 'pending' || entry.scoreStatus === 'processing'

            return (
              <li
                key={entry.scoreId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-3"
              >
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/dashboard/roles/${entry.roleId}`}
                    className="text-sm font-medium text-zinc-100 hover:text-blue-300 transition-colors"
                  >
                    {entry.roleTitle}
                  </Link>
                  <span className="text-xs text-zinc-500">{date}</span>
                  {isComplete && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <DimensionPill label="Tech" score={entry.technicalScore} />
                      <DimensionPill label="Exp" score={entry.experienceScore} />
                      <DimensionPill label="Fit" score={entry.culturalFitScore} />
                      <DimensionPill label="Comm" score={entry.communicationScore} />
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  {isComplete && entry.overallScore !== null ? (
                    <span
                      className={`inline-flex items-center rounded-lg border px-3 py-1 text-sm font-bold ${scoreBadgeClass(entry.overallScore)}`}
                    >
                      {entry.overallScore}
                    </span>
                  ) : isFailed ? (
                    <span className="rounded-lg border border-red-800 bg-red-950 px-3 py-1 text-xs font-medium text-red-400">
                      Failed
                    </span>
                  ) : isPending ? (
                    <span className="rounded-lg border border-yellow-800 bg-yellow-950 px-3 py-1 text-xs font-medium text-yellow-400">
                      Pending
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
