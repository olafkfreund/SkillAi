'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2Icon } from 'lucide-react'

type Props = {
  candidateId: string
  roleId: string
  currentStatus: 'pending' | 'processing' | 'complete' | 'failed'
}

export function ScorePolling({ candidateId, roleId, currentStatus }: Props) {
  const router = useRouter()

  const { data } = useQuery({
    queryKey: ['score-status', candidateId, roleId],
    queryFn: async () => {
      const res = await fetch(
        `/api/candidates/${candidateId}/score-status?roleId=${roleId}`
      )
      if (!res.ok) return { status: currentStatus }
      return res.json()
    },
    initialData: { status: currentStatus },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'complete' || status === 'failed') return false
      return 2000
    },
  })

  const status = data?.status ?? currentStatus

  useEffect(() => {
    if (status === 'complete' || status === 'failed') {
      router.refresh()
    }
  }, [status, router])

  return (
    <div className="flex items-center gap-3 rounded-xl bg-amber-950 border border-amber-800 px-5 py-4 mb-6">
      <Loader2Icon className="h-5 w-5 text-amber-400 animate-spin flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-400">
          {status === 'pending' ? 'Score queued' : 'Scoring in progress…'}
        </p>
        <p className="text-xs text-amber-500 mt-0.5">
          Claude is analysing this CV against the role. This takes 10–30 seconds.
        </p>
      </div>
    </div>
  )
}
