'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCwIcon } from 'lucide-react'
import { retryInterviewPack } from '@/actions/interview'

type PackStatus = {
  generationStatus: string
  generationStage: string | null
  errorMessage: string | null
  includesCodeChallenge: boolean
}

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
  const [status, setStatus] = useState<PackStatus>({
    generationStatus: 'pending',
    generationStage: null,
    errorMessage: null,
    includesCodeChallenge: false,
  })

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/interview-packs/${packId}`)
        if (!res.ok) return
        const data = await res.json()
        if (!active) return

        setStatus({
          generationStatus: data.pack.generationStatus,
          generationStage: data.pack.generationStage,
          errorMessage: data.pack.errorMessage,
          includesCodeChallenge: data.pack.includesCodeChallenge ?? false,
        })

        if (data.pack.generationStatus === 'complete') {
          router.refresh()
          return
        }
      } catch { /* ignore network errors during polling */ }

      if (active) setTimeout(poll, 2000)
    }

    poll()
    return () => { active = false }
  }, [packId, router])

  const currentStep = getStepIndex(status.generationStage)
  const isFailed = status.generationStatus === 'failed'
  const isPending = status.generationStatus === 'pending'

  if (isFailed) {
    return (
      <div className="rounded-xl bg-red-950 border border-red-800 px-5 py-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-red-400">Generation failed</p>
            {status.errorMessage && (
              <p className="text-xs text-red-500 mt-0.5 line-clamp-2">
                {status.errorMessage.split('\n')[0]}
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
                body: JSON.stringify({ packId, includeCodeChallenge: status.includesCodeChallenge }),
              }).catch(() => {})
              setStatus({ generationStatus: 'pending', generationStage: null, errorMessage: null, includesCodeChallenge: status.includesCodeChallenge })
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
    <div className="rounded-xl bg-zinc-900 border border-zinc-700 px-5 py-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-5 w-5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {isPending ? 'Starting generation…' : (status.generationStage ?? 'Processing…')}
          </p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="space-y-2 ml-1">
        {STAGE_STEPS.map((step, i) => {
          const isActive = i === currentStep && !isPending
          const isDone = i < currentStep && !isPending
          const isFuture = i > currentStep || isPending

          return (
            <div key={step} className="flex items-center gap-3">
              <div className={`flex items-center justify-center h-5 w-5 rounded-full flex-shrink-0 text-xs font-medium
                ${isDone
                  ? 'bg-emerald-600 text-white'
                  : isActive
                    ? 'bg-violet-600 text-white ring-2 ring-violet-400/30'
                    : 'bg-zinc-800 text-zinc-600 border border-zinc-700'
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
                    ? 'text-zinc-100 font-medium'
                    : 'text-zinc-600'
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
      <div className="mt-4 h-1 bg-zinc-800 rounded-full overflow-hidden">
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
