'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { FileTextIcon, Loader2Icon, CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react'

type Pack = {
  id: string
  generationStatus: string
  generationStage: string | null
  experienceLevel: string | null
  recommendedDurationMinutes: number | null
  includesCodeChallenge: boolean
  packType: 'full' | 'pre_screening'
  language: string
  createdAt: string
  updatedAt: string
  roleTitle: string | null
  roleId: string
  questionCount: number
}

type Props = { candidateId: string }

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  pending: {
    icon: <ClockIcon className="h-3.5 w-3.5" />,
    label: 'Pending',
    className: 'text-[var(--color-fg-muted)] bg-[var(--color-bg-input)] border-[var(--color-border)]',
  },
  processing: {
    icon: <Loader2Icon className="h-3.5 w-3.5 animate-spin" />,
    label: 'Generating…',
    className: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  },
  complete: {
    icon: <CheckCircleIcon className="h-3.5 w-3.5" />,
    label: 'Ready',
    className: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700',
  },
  failed: {
    icon: <XCircleIcon className="h-3.5 w-3.5" />,
    label: 'Failed',
    className: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800',
  },
}

export function PackList({ candidateId }: Props) {
  const { data: packs = [], isLoading } = useQuery<Pack[]>({
    queryKey: ['interview-packs', candidateId],
    queryFn: async () => {
      const res = await fetch(`/api/candidates/${candidateId}/interview-packs`)
      if (!res.ok) return []
      return res.json()
    },
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasPending = data.some(
        (p) => p.generationStatus === 'pending' || p.generationStatus === 'processing'
      )
      return hasPending ? 3000 : false
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-fg-subtle)] py-4">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        Loading packs…
      </div>
    )
  }

  if (packs.length === 0) {
    return (
      <p className="text-sm text-[var(--color-fg-subtle)] py-2">No interview packs generated yet.</p>
    )
  }

  return (
    <div className="space-y-2">
      {packs.map((pack) => {
        const status = STATUS_CONFIG[pack.generationStatus] ?? STATUS_CONFIG.pending
        const isReady = pack.generationStatus === 'complete'
        const isPending = pack.generationStatus === 'pending' || pack.generationStatus === 'processing'
        const ageMs = Date.now() - new Date(pack.updatedAt).getTime()
        const isStuck = isPending && ageMs > 3 * 60 * 1000

        const card = (
          <div
            className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors cursor-pointer
              ${isStuck
                ? 'bg-red-950/30 border-red-900 hover:bg-red-950/50'
                : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] hover:bg-[var(--color-bg-input)]'}`}
          >
            <FileTextIcon className="h-4 w-4 text-[var(--color-fg-subtle)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-fg)] truncate flex items-center gap-2">
                <span className="truncate">{pack.roleTitle ?? 'Unknown role'}</span>
                {pack.packType === 'pre_screening' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex-shrink-0">
                    Pre-screening
                  </span>
                )}
                {pack.language && pack.language !== 'en' && (
                  <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-fg)] flex-shrink-0">
                    {pack.language.toUpperCase()}
                  </span>
                )}
              </p>
              <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                {isReady ? (
                  <>
                    {pack.questionCount} questions
                    {pack.includesCodeChallenge ? ' · code challenge' : ''}
                    {pack.recommendedDurationMinutes
                      ? ` · ${pack.recommendedDurationMinutes} min`
                      : ''}
                    {pack.experienceLevel ? ` · ${pack.experienceLevel}` : ''}
                    {' · '}{new Date(pack.createdAt).toLocaleDateString('en-GB')}
                  </>
                ) : isStuck ? (
                  'Stuck — click to retry'
                ) : isPending && pack.generationStage ? (
                  pack.generationStage
                ) : (
                  new Date(pack.createdAt).toLocaleDateString('en-GB')
                )}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                isStuck ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800' : status.className
              }`}
            >
              {isStuck ? <XCircleIcon className="h-3.5 w-3.5" /> : status.icon}
              {isStuck ? 'Stuck' : status.label}
            </span>
          </div>
        )

        return (
          <Link
            key={pack.id}
            href={`/dashboard/candidates/${candidateId}/interview/${pack.id}`}
          >
            {card}
          </Link>
        )
      })}
    </div>
  )
}
