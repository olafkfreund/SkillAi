'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { retryInterviewPack } from '@/actions/interview'

const STAGE_STEPS = [
  'Loading candidate and role data',
  'Analysing CV with AI',
  'Generating personalised interview questions',
  'Saving interview pack',
]

function getStepIndex(stage: string | null): number {
  if (!stage) return 0
  return STAGE_STEPS.findIndex((s) => stage.toLowerCase().startsWith(s.toLowerCase()))
}

type Props = {
  packId: string
}

export function GenerationProgress({ packId }: Props) {
  const router = useRouter()

  const { data } = useQuery({
    queryKey: ['interview-pack', packId],
    queryFn: async () => {
      const res = await fetch(`/api/interview-packs/${packId}`)
      if (!res.ok) return null
      return res.json()
    },
    refetchInterval: (query) => {
      const pack = query.state.data?.pack
      if (!pack) return 2000
      if (pack.generationStatus === 'complete' || pack.generationStatus === 'failed') return false
      return 2000
    },
  })

  const pack = data?.pack
  const generationStatus = pack?.generationStatus ?? 'pending'
  const generationStage = pack?.generationStage ?? null
  const errorMessage = pack?.errorMessage ?? null
  const includesCodeChallenge = pack?.includesCodeChallenge ?? false

  // Auto-refresh page when complete
  useEffect(() => {
    if (generationStatus === 'complete') {
      router.refresh()
    }
  }, [generationStatus, router])

  const currentStep = getStepIndex(generationStage)
  const isFailed = generationStatus === 'failed'
  const isPending = generationStatus === 'pending'

  if (isFailed) {
    return (
      <div className="rounded-xl bg-red-950 border border-red-800 px-5 py-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-red-400">Generation failed</p>
            {errorMessage && (
              <p className="text-xs text-red-500 mt-0.5 line-clamp-2">
                {errorMessage.split('\n')[0]}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              await retryInterviewPack(packId)
              fetch('/api/interview-packs/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packId, includeCodeChallenge: includesCodeChallenge }),
              }).catch(() => {})
            }}
            className="flex items-center gap-1.5 rounded-md bg-red-900 border border-red-700
                       text-red-300 text-xs font-medium px-3 py-1.5 hover:bg-red-800
                       transition-colors flex-shrink-0"
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-5 py-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-5 w-5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[var(--color-fg)]">
            {isPending ? 'Starting generation…' : (generationStage ?? 'Processing…')}
          </p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="space-y-2 ml-1">
        {STAGE_STEPS.map((step, i) => {
          const isActive = i === currentStep && !isPending
          const isDone = i < currentStep && !isPending

          return (
            <div key={step} className="flex items-center gap-3">
              <div className={`flex items-center justify-center h-5 w-5 rounded-full flex-shrink-0 text-xs font-medium
                ${isDone
                  ? 'bg-emerald-600 text-white'
                  : isActive
                    ? 'bg-violet-600 text-white ring-2 ring-violet-400/30'
                    : 'bg-[var(--color-bg-input)] text-[var(--color-fg-subtle)] border border-[var(--color-border)]'
                }`}
              >
                {isDone ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className={`text-sm ${
                isDone
                  ? 'text-emerald-400'
                  : isActive
                    ? 'text-[var(--color-fg)] font-medium'
                    : 'text-[var(--color-fg-subtle)]'
              }`}>
                {step}
                {isActive && (
                  <span className="inline-block ml-1 text-violet-400 animate-pulse">…</span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1 bg-[var(--color-bg-input)] rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-700 ease-out"
          style={{
            width: isPending
              ? '5%'
              : `${Math.max(10, ((currentStep + 1) / STAGE_STEPS.length) * 100)}%`,
          }}
        />
      </div>
    </div>
  )
}
