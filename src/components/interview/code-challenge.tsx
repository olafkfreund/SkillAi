'use client'

import { useState } from 'react'
import { ChevronDownIcon, CodeIcon } from 'lucide-react'
import type { CodeChallenge } from '@/db/schema'

type Props = { challenge: CodeChallenge }

export function CodeChallengeCard({ challenge }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-800 transition-colors"
      >
        <CodeIcon className="h-4 w-4 text-violet-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{challenge.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-950 text-violet-400 border-violet-700">
              {challenge.language}
            </span>
            {challenge.estimatedMinutes && (
              <span className="text-xs text-zinc-500">{challenge.estimatedMinutes} min</span>
            )}
          </div>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-700 pt-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Problem</p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {challenge.problemDescription}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Starter Code</p>
            <pre className="bg-zinc-950 text-zinc-100 rounded-lg px-4 py-3 text-xs overflow-x-auto font-mono leading-relaxed">
              {challenge.starterCode}
            </pre>
          </div>

          {challenge.unitTests && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Unit Tests</p>
              <pre className="bg-zinc-950 text-zinc-100 rounded-lg px-4 py-3 text-xs overflow-x-auto font-mono leading-relaxed">
                {challenge.unitTests}
              </pre>
            </div>
          )}

          {challenge.evaluationCriteria && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Evaluation Criteria</p>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {challenge.evaluationCriteria}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
