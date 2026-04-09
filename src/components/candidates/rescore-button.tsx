'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCwIcon, ChevronDownIcon } from 'lucide-react'
import { rescoreCandidate } from '@/actions/scores'

type Props = {
  candidateId: string
  currentRoleId: string
  allRoles: { id: string; title: string }[]
}

export function RescoreButton({ candidateId, currentRoleId, allRoles }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  async function handleRescore(roleId: string) {
    setOpen(false)
    startTransition(async () => {
      const result = await rescoreCandidate(candidateId, roleId)
      if (result.success) {
        router.refresh()
      } else {
        console.error('Rescore failed:', result.error)
      }
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800
                   text-zinc-400 text-xs font-medium px-3 py-1.5
                   hover:bg-zinc-700 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCwIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        Re-score
        <ChevronDownIcon className="h-3 w-3" />
      </button>

      {open && (
        <>
          {/* Backdrop to close dropdown on outside click */}
          <div
            className="fixed inset-0 z-[9]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-10 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl min-w-48">
            {allRoles.length === 0 ? (
              <p className="px-4 py-2 text-sm text-zinc-500">No active roles</p>
            ) : (
              allRoles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRescore(role.id)}
                  className="w-full text-left px-4 py-2 text-sm text-zinc-300
                             hover:bg-zinc-800
                             first:rounded-t-lg last:rounded-b-lg
                             flex items-center justify-between gap-2"
                >
                  <span className="truncate">{role.title}</span>
                  {role.id === currentRoleId && (
                    <span className="text-xs text-zinc-500 shrink-0">current</span>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
