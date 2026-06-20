'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2Icon, CircleIcon, XIcon, SparklesIcon } from 'lucide-react'
import { dismissOnboarding, type OnboardingSteps } from '@/actions/onboarding'

const STEP_DEFS: Array<{
  key: keyof OnboardingSteps
  label: string
  description: string
  href: string
  cta: string
}> = [
  {
    key: 'agency',
    label: 'Add an agency',
    description: 'Track where your candidates come from.',
    href: '/dashboard/agencies',
    cta: 'Add agency',
  },
  {
    key: 'role',
    label: 'Create your first role',
    description: 'Describe the job you are hiring for.',
    href: '/dashboard/roles',
    cta: 'Create role',
  },
  {
    key: 'candidate',
    label: 'Upload a CV',
    description: 'Add a candidate from a role page to get them into the archive.',
    href: '/dashboard/roles',
    cta: 'Upload CV',
  },
  {
    key: 'score',
    label: 'Score the candidate',
    description: 'Let AI rank them against the role across four dimensions.',
    href: '/dashboard/roles',
    cta: 'Score',
  },
]

export function OnboardingChecklist({ steps }: { steps: OnboardingSteps }) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (dismissed) return null

  const completed = STEP_DEFS.filter((s) => steps[s.key]).length
  const pct = Math.round((completed / STEP_DEFS.length) * 100)

  const handleSkip = () => {
    setDismissed(true) // optimistic — hide immediately
    startTransition(async () => {
      await dismissOnboarding()
    })
  }

  return (
    <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2.5">
          <SparklesIcon className="h-5 w-5 text-violet-500 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">Get started with SkillAI</h2>
            <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
              {completed} of {STEP_DEFS.length} complete
            </p>
          </div>
        </div>
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-muted)]
                     hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
          aria-label="Skip onboarding"
        >
          <XIcon className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-[var(--color-bg-input)] mb-4 overflow-hidden">
        <div
          className="h-full bg-violet-500 transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <ul className="space-y-2">
        {STEP_DEFS.map((s) => {
          const done = steps[s.key]
          return (
            <li
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-[var(--color-bg-app)]"
            >
              <div className="flex items-center gap-3 min-w-0">
                {done ? (
                  <CheckCircle2Icon className="h-5 w-5 text-green-500 flex-shrink-0" />
                ) : (
                  <CircleIcon className="h-5 w-5 text-[var(--color-fg-subtle)] flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className={`text-sm ${done ? 'text-[var(--color-fg-subtle)] line-through' : 'text-[var(--color-fg)]'}`}>
                    {s.label}
                  </p>
                  {!done && (
                    <p className="text-xs text-[var(--color-fg-subtle)] truncate">{s.description}</p>
                  )}
                </div>
              </div>
              {!done && (
                <Link
                  href={s.href}
                  className="flex-shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white
                             hover:bg-blue-700 transition-colors"
                >
                  {s.cta}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
