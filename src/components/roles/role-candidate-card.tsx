'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Download, XIcon, HomeIcon } from 'lucide-react'

type ScorePillProps = { label: string; score: number | null }

function ScorePill({ label, score }: ScorePillProps) {
  if (score === null) return null
  const color =
    score >= 75 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800' :
    score >= 50 ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800' :
    'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600'
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${color}`}>
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium">{score}</span>
    </span>
  )
}

function MarginPill({
  roleRate, roleCurrency, candRate, candCurrency,
}: { roleRate: string | null; roleCurrency: string | null; candRate: string | null; candCurrency: string | null }) {
  if (!roleRate || !candRate) return null
  const mismatch = Boolean(roleCurrency && candCurrency && roleCurrency !== candCurrency)
  const margin = Number(roleRate) - Number(candRate)
  const color = margin >= 0
    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
    : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${color}`}
      title={mismatch ? `Currency mismatch: role ${roleCurrency} vs candidate ${candCurrency}` : undefined}
    >
      <span className="text-zinc-400">Margin</span>
      <span className="font-medium">{margin >= 0 ? '+' : ''}{roleCurrency ?? ''} {margin.toFixed(0)}/day</span>
      {mismatch && <span className="text-amber-400">⚠</span>}
    </span>
  )
}

type Props = {
  scoreId: string
  roleId: string
  candidateId: string
  firstName: string
  lastName: string
  email: string | null
  filePath: string | null
  scoreStatus: string
  overallScore: number | null
  technicalScore: number | null
  experienceScore: number | null
  culturalFitScore: number | null
  communicationScore: number | null
  roleDayRate: string | null
  roleCurrency: string | null
  candidateRate: string | null
  candidateCurrency: string | null
  isInternal?: boolean
  isSubmitted?: boolean
  agencyId?: string
  agencyName?: string | null
  agencyLogoPath?: string | null
  canEdit: boolean
  audience?: 'recruiter' | 'customer' | 'manager'
  removeAction: (scoreId: string, roleId: string) => Promise<void>
}

export function RoleCandidateCard({
  scoreId,
  roleId,
  candidateId,
  firstName,
  lastName,
  email,
  filePath,
  scoreStatus,
  overallScore,
  technicalScore,
  experienceScore,
  culturalFitScore,
  communicationScore,
  roleDayRate,
  roleCurrency,
  candidateRate,
  candidateCurrency,
  isInternal,
  isSubmitted,
  agencyId,
  agencyName,
  agencyLogoPath,
  canEdit,
  audience = 'recruiter',
  removeAction,
}: Props) {
  const isManagerView = audience === 'manager'
  const [isPending, startTransition] = useTransition()

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Remove ${firstName} ${lastName} from this role?`)) return
    startTransition(() => removeAction(scoreId, roleId))
  }

  async function handleDownloadCv(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const res = await fetch(`/api/candidates/${candidateId}/cv`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const disposition = res.headers.get('Content-Disposition') ?? ''
    const match = disposition.match(/filename="([^"]+)"/)
    a.download = match ? match[1] : `${firstName}-${lastName}-CV`
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Link
      href={`/dashboard/candidates/${candidateId}?roleId=${roleId}`}
      className={`flex items-center justify-between rounded-xl bg-zinc-900 border px-5 py-4
                  hover:border-blue-500 hover:shadow-sm transition-all
                  ${isPending ? 'opacity-40 pointer-events-none border-zinc-700' : 'border-zinc-700'}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-zinc-100 flex items-center gap-2 flex-wrap">
          <span>
            {firstName} {lastName}
          </span>
          {isInternal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800
                             text-blue-700 dark:text-blue-300 text-xs font-semibold px-2 py-0.5">
              <HomeIcon className="h-3 w-3" />
              INTERNAL
            </span>
          )}
          {isSubmitted && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                             bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Submitted
            </span>
          )}
          {email && <span className="font-normal text-zinc-500 text-sm ml-1">{email}</span>}
        </p>
        {scoreStatus === 'complete' && technicalScore !== null && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <ScorePill label="Tech" score={technicalScore} />
            <ScorePill label="Exp" score={experienceScore} />
            <ScorePill label="Fit" score={culturalFitScore} />
            <ScorePill label="Comm" score={communicationScore} />
            {!isManagerView && (
              <MarginPill
                roleRate={roleDayRate}
                roleCurrency={roleCurrency}
                candRate={candidateRate}
                candCurrency={candidateCurrency}
              />
            )}
          </div>
        )}
        {agencyId && !isInternal && agencyName && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {agencyLogoPath ? (
              <img
                src={`/api/agencies/${agencyId}/logo`}
                alt=""
                width={20}
                height={20}
                style={{ width: 20, height: 20 }}
                className="rounded-full border border-zinc-700 bg-zinc-800 object-contain shrink-0"
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-full bg-zinc-800
                           text-zinc-400 text-xs font-semibold shrink-0"
                style={{ width: 20, height: 20 }}
                aria-hidden="true"
              >
                {agencyName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-zinc-500">{agencyName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
        {scoreStatus === 'pending' || scoreStatus === 'processing' ? (
          <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-full">
            Scoring…
          </span>
        ) : scoreStatus === 'complete' && overallScore !== null ? (
          <div className="text-center">
            <p className="text-xl font-bold text-zinc-100">{overallScore}</p>
            <p className="text-xs text-zinc-500">/ 100</p>
          </div>
        ) : (
          <span className="text-xs text-red-400">Failed</span>
        )}

        {filePath && (
          <button
            type="button"
            onClick={handleDownloadCv}
            title="Download original CV"
            className="p-1.5 rounded-md text-zinc-600 hover:text-blue-400 hover:bg-blue-950/40
                       border border-transparent hover:border-blue-800 transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
        )}

        {canEdit && !isManagerView && (
          <button
            onClick={handleRemove}
            title="Remove from role"
            className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-950/40
                       border border-transparent hover:border-red-800 transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </Link>
  )
}
