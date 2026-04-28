'use client'

import { useState, useTransition } from 'react'
import { SparklesIcon, Loader2Icon } from 'lucide-react'

interface Props {
  roleId: string
  keySkills: string[]
  topRequirements: string[]
  canEdit: boolean
  audience?: 'recruiter' | 'customer' | 'manager'
  regenerateAction: () => Promise<{ success: boolean; error?: string }>
}

export function RoleTagsPanel({ keySkills, topRequirements, canEdit, audience = 'recruiter', regenerateAction }: Props) {
  const isManagerView = audience === 'manager'
  const [isPending, startTransition] = useTransition()
  const [triggered, setTriggered] = useState(false)

  const hasNoTags = keySkills.length === 0 && topRequirements.length === 0

  function handleRegenerate() {
    startTransition(async () => {
      await regenerateAction()
      setTriggered(true)
    })
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-zinc-100">Skills &amp; Requirements</h2>
        {canEdit && !isManagerView && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-zinc-400 border border-zinc-600
                       rounded-md px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="h-3.5 w-3.5" />
            )}
            {isPending ? 'Extracting…' : hasNoTags ? 'Generate tags' : 'Regenerate'}
          </button>
        )}
      </div>

      {isPending && (
        <p className="text-sm text-zinc-500 mb-4">
          AI is extracting tags — this page will refresh in a few seconds…
        </p>
      )}

      {triggered && !isPending && (
        <p className="text-sm text-emerald-400 mb-4">
          Tags generated. Reload the page to see the latest results.
        </p>
      )}

      {hasNoTags && !isPending ? (
        <p className="text-sm text-zinc-500">
          {canEdit
            ? 'No tags yet. Click "Generate tags" to extract skills and requirements using AI.'
            : 'No tags extracted yet.'}
        </p>
      ) : (
        <div className="space-y-4">
          {keySkills.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Key Skills
              </p>
              <div className="flex flex-wrap gap-2">
                {keySkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-blue-950 border border-blue-800
                               text-blue-300 text-xs font-medium px-3 py-1"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {topRequirements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Top Requirements
              </p>
              <div className="flex flex-wrap gap-2">
                {topRequirements.map((req) => (
                  <span
                    key={req}
                    className="inline-flex items-center rounded-full bg-amber-950 border border-amber-800
                               text-amber-300 text-xs font-medium px-3 py-1"
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
