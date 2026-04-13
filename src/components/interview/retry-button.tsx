'use client'

import { useRouter } from 'next/navigation'
import { RefreshCwIcon } from 'lucide-react'
import { retryInterviewPack } from '@/actions/interview'

type Props = {
  packId: string
  includesCodeChallenge?: boolean
}

export function RetryButton({ packId, includesCodeChallenge = false }: Props) {
  const router = useRouter()

  async function handleRetry() {
    const result = await retryInterviewPack(packId)
    if (result.success) {
      fetch('/api/interview-packs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, includeCodeChallenge: includesCodeChallenge }),
      }).catch((err) => console.error('Failed to trigger generation:', err))

      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleRetry}
      className="flex items-center gap-1.5 rounded-md bg-red-900 border border-red-700
                 text-red-300 text-xs font-medium px-3 py-1.5 hover:bg-red-800
                 transition-colors flex-shrink-0"
    >
      <RefreshCwIcon className="h-3.5 w-3.5" />
      Retry
    </button>
  )
}
