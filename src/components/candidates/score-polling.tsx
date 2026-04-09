'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon } from 'lucide-react'

type Props = {
  candidateId: string
  roleId: string
  currentStatus: 'pending' | 'processing'
}

export function ScorePolling({ candidateId, roleId, currentStatus }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)

  useEffect(() => {
    if (status === 'pending' || status === 'processing') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/candidates/${candidateId}/score-status?roleId=${roleId}`
          )
          if (!res.ok) return
          const data = await res.json()
          setStatus(data.status)
          if (data.status === 'complete' || data.status === 'failed') {
            clearInterval(interval)
            router.refresh()
          }
        } catch {
          // ignore transient fetch errors
        }
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [candidateId, roleId, status, router])

  return (
    <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 mb-6">
      <Loader2Icon className="h-5 w-5 text-amber-500 animate-spin flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-800">
          {status === 'pending' ? 'Score queued' : 'Scoring in progress…'}
        </p>
        <p className="text-xs text-amber-600 mt-0.5">
          Claude is analysing this CV against the role. This takes 10–30 seconds.
        </p>
      </div>
    </div>
  )
}
