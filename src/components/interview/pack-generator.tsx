'use client'

import { useState, useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SparklesIcon, Loader2Icon } from 'lucide-react'
import { createInterviewPack } from '@/actions/interview'
import type { CreatePackState } from '@/actions/interview'

type Props = { candidateId: string; roleId: string; roleName: string }

export function PackGenerator({ candidateId, roleId, roleName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [includeCode, setIncludeCode] = useState(false)

  const [state, action, pending] = useActionState<CreatePackState | null, FormData>(
    createInterviewPack,
    null
  )

  useEffect(() => {
    if (state?.success) {
      // Pack row created — trigger generation via API route from the client
      fetch('/api/interview-packs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: state.packId, includeCodeChallenge: includeCode }),
      }).catch((err) => console.error('Failed to trigger generation:', err))

      setOpen(false)
      router.push(`/dashboard/candidates/${candidateId}/interview/${state.packId}`)
      router.refresh()
    }
  }, [state, router, candidateId, includeCode])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md bg-violet-600 text-white text-sm
                   font-medium px-4 py-2 hover:bg-violet-700 transition-colors"
      >
        <SparklesIcon className="h-4 w-4" />
        <span>
          Generate pack
          <span className="opacity-75"> · {roleName}</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 rounded-xl shadow-xl border border-zinc-700 w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Generate interview pack</h2>
            <p className="text-sm text-zinc-500 mb-5">
              Role: <span className="font-medium text-zinc-300">{roleName}</span>
            </p>

            {state && !state.success && (
              <div role="alert" className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400 mb-4">
                {state.error}
              </div>
            )}

            <form action={action} className="space-y-4">
              <input type="hidden" name="candidateId" value={candidateId} />
              <input type="hidden" name="roleId" value={roleId} />
              <input type="hidden" name="includeCodeChallenge" value={String(includeCode)} />

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCode}
                  onChange={(e) => setIncludeCode(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 text-violet-600"
                />
                <span className="text-sm text-zinc-300">
                  Include code challenge
                  <span className="block text-xs text-zinc-500">
                    AI generates a language-appropriate coding exercise
                  </span>
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-2 flex-1 justify-center rounded-md
                             bg-violet-600 text-white text-sm font-medium py-2.5
                             hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                  {pending ? 'Creating…' : 'Generate'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="flex-1 rounded-md border border-zinc-600 text-sm text-zinc-400
                             py-2.5 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
