'use client'

import { useState, useTransition } from 'react'
import { SparklesIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { getShortlistSummary } from '@/actions/shortlist-summary'
import ReactMarkdown from 'react-markdown'

type Props = {
  roleId: string
}

export function ShortlistSummaryPanel({ roleId }: Props) {
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const result = await getShortlistSummary(roleId)
      if ('error' in result) {
        setError(result.error)
        setSummary(null)
      } else {
        setSummary(result.summary)
        setError(null)
      }
    })
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-violet-400" />
          <h2 className="font-semibold text-zinc-100">AI Hiring Recommendation</h2>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          className="flex items-center gap-2 rounded-md bg-violet-700 text-white text-sm
                     font-medium px-4 py-2 hover:bg-violet-600 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : summary ? (
            <RefreshCwIcon className="h-4 w-4" />
          ) : (
            <SparklesIcon className="h-4 w-4" />
          )}
          {isPending
            ? 'Generating…'
            : summary
              ? 'Regenerate'
              : 'Generate hiring recommendation'}
        </button>
      </div>

      {!summary && !error && !isPending && (
        <p className="text-zinc-500 text-sm">
          Generate an AI-powered narrative summary comparing the top candidates for this role.
        </p>
      )}

      {isPending && (
        <div className="flex items-center gap-3 text-zinc-400 text-sm py-4">
          <Loader2Icon className="h-4 w-4 animate-spin flex-shrink-0" />
          <span>Analysing top candidates and generating hiring recommendation…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {summary && (
        <div className="rounded-xl bg-violet-950/30 border border-violet-800 p-5">
          <div className="text-sm text-zinc-300 leading-relaxed space-y-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-zinc-100 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_strong]:text-zinc-100 [&_strong]:font-semibold [&_ul]:space-y-1 [&_ul]:pl-4 [&_ul>li]:list-disc [&_ul>li]:marker:text-violet-400 [&_ol]:space-y-1 [&_ol]:pl-4 [&_ol>li]:list-decimal [&_ol>li]:marker:text-violet-400 [&_p]:leading-relaxed">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
