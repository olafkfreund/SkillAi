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
    className: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  },
  processing: {
    icon: <Loader2Icon className="h-3.5 w-3.5 animate-spin" />,
    label: 'Generating…',
    className: 'text-amber-400 bg-amber-950 border-amber-800',
  },
  complete: {
    icon: <CheckCircleIcon className="h-3.5 w-3.5" />,
    label: 'Ready',
    className: 'text-emerald-400 bg-emerald-950 border-emerald-700',
  },
  failed: {
    icon: <XCircleIcon className="h-3.5 w-3.5" />,
    label: 'Failed',
    className: 'text-red-400 bg-red-950 border-red-800',
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
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        Loading packs…
      </div>
    )
  }

  if (packs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-2">No interview packs generated yet.</p>
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
                : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800'}`}
          >
            <FileTextIcon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-100 truncate flex items-center gap-2">
                <span className="truncate">{pack.roleTitle ?? 'Unknown role'}</span>
                {pack.packType === 'pre_screening' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-950 text-amber-300 border border-amber-800 flex-shrink-0">
                    Pre-screening
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {isReady ? (
                  <>
                    {pack.questionCount} questions
                    {pack.includesCodeChallenge ? ' · code challenge' : ''}
                    {pack.recommendedDurationMinutes
                      ? ` · ${pack.recommendedDurationMinutes} min`
                      : ''}
                    {pack.experienceLevel ? ` · ${pack.experienceLevel}` : ''}
                    {' · '}{new Date(pack.createdAt).toLocaleDateString()}
                  </>
                ) : isStuck ? (
                  'Stuck — click to retry'
                ) : isPending && pack.generationStage ? (
                  pack.generationStage
                ) : (
                  new Date(pack.createdAt).toLocaleDateString()
                )}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                isStuck ? 'text-red-400 bg-red-950 border-red-800' : status.className
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
