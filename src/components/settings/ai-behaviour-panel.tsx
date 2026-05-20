'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { BrainCircuitIcon } from 'lucide-react'
import { updateHrSkillSettings } from '@/actions/settings'
import type { HrSkillSettingsRecord } from '@/actions/settings'
import { HR_SKILL_PROFILES } from '@/lib/ai/skills/profiles'
import type { HrSkillProfile } from '@/lib/ai/skills/profiles'

const PROFILE_LABELS: Record<HrSkillProfile, string> = {
  'recruiter-eu-uk':    'Recruiter — EU/UK',
  'talent-acquisition': 'Talent Acquisition',
  'people-analytics':   'People Analytics',
}

interface AiBehaviourPanelProps {
  initial: HrSkillSettingsRecord
}

/**
 * AiBehaviourPanel — admin-only settings card that surfaces the per-tenant
 * HR skill toggle and skill profile selector.
 *
 * When enabled, Claude scoring, interview generation, and transcript analysis
 * load the selected HR guidance pack as a cached system block.
 *
 * Rendered in /settings page inside the admin-only branch.
 */
export function AiBehaviourPanel({ initial }: AiBehaviourPanelProps) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [profile, setProfile] = useState<HrSkillProfile>(initial.profile)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await updateHrSkillSettings(enabled, profile)
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
      <div className="flex items-center gap-2 mb-2">
        <BrainCircuitIcon className="h-4 w-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[var(--color-fg)]">AI Behaviour</h2>
      </div>
      <p className="text-xs text-[var(--color-fg-subtle)] mb-5">
        When enabled, Claude scoring, interview generation, and transcript analysis use
        HR-policy-aware reasoning. The skill profile determines which guidance pack is
        loaded.{' '}
        <Link
          href="/dashboard/help/ai-behaviour"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          Learn more →
        </Link>
      </p>

      <div className="space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-fg)]">Enable HR skill in AI calls</p>
            <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
              Default off. Opt-in per tenant — no AI behaviour changes without enabling this first.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => {
              setEnabled((v) => !v)
              if (success) setSuccess(false)
              if (error) setError(null)
            }}
            disabled={pending}
            className={[
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
              'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              'focus:ring-offset-[var(--color-bg-elevated)]',
              'disabled:opacity-50',
              enabled ? 'bg-blue-600' : 'bg-[var(--color-border)]',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
                'transition duration-200 ease-in-out',
                enabled ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Profile selector */}
        <div>
          <label
            htmlFor="hr-skill-profile"
            className="block text-sm font-medium text-[var(--color-fg)] mb-1.5"
          >
            Skill profile
          </label>
          <p className="text-xs text-[var(--color-fg-subtle)] mb-2">
            Selects which HR guidance pack is injected into AI system prompts.
          </p>
          <select
            id="hr-skill-profile"
            value={profile}
            onChange={(e) => {
              setProfile(e.target.value as HrSkillProfile)
              if (success) setSuccess(false)
              if (error) setError(null)
            }}
            disabled={pending || !enabled}
            className={[
              'w-full max-w-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)]',
              'text-sm text-[var(--color-fg)] px-3 py-2',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'disabled:opacity-50',
            ].join(' ')}
          >
            {HR_SKILL_PROFILES.map((p: HrSkillProfile) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
          {!enabled && (
            <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">
              Enable the HR skill toggle above to change the profile.
            </p>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {success && (
        <p className="mt-3 text-sm text-emerald-400">AI behaviour settings saved.</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="mt-5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-input)] disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save AI behaviour'}
      </button>
    </section>
  )
}
