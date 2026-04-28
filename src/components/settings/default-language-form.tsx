'use client'

import { useState, useTransition } from 'react'
import { GlobeIcon } from 'lucide-react'
import { saveDefaultPackLanguage } from '@/actions/settings'
import { PackLanguagePicker } from '@/components/interview/pack-language-picker'
import { isSupportedLanguage, type SupportedLanguage } from '@/lib/ai/language'

interface DefaultLanguageFormProps {
  /**
   * Tenant's current default pack language. Falls back to 'en' if the stored
   * value is not in SUPPORTED_LANGUAGES (defensive — getter already coerces).
   */
  initial: string
}

/**
 * DefaultLanguageForm — admin-only editor for the per-tenant default language
 * used by interview / pre-screening pack generation when a candidate has no
 * explicit language preference set on their profile.
 *
 * Resolution chain (consumed in pack-generator.tsx):
 *   1. candidate.languagesSpoken[0] (if it maps to a SupportedLanguage)
 *   2. tenant default (this setting)
 *   3. 'en'
 */
export function DefaultLanguageForm({ initial }: DefaultLanguageFormProps) {
  const safe: SupportedLanguage = isSupportedLanguage(initial) ? initial : 'en'
  const [value, setValue] = useState<SupportedLanguage>(safe)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await saveDefaultPackLanguage(value)
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex items-center gap-2 mb-2">
        <GlobeIcon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-zinc-100">Default pack language</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        New interview and screening packs default to this language when the
        candidate has no language preference set.
      </p>
      <div className="max-w-xs">
        <PackLanguagePicker
          value={value}
          onChange={(next) => {
            setValue(next)
            if (success) setSuccess(false)
            if (error) setError(null)
          }}
          disabled={pending}
          id="default-pack-language"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {success && (
        <p className="mt-2 text-sm text-emerald-400">Default language updated.</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="mt-4 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save default language'}
      </button>
    </section>
  )
}
