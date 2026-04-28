'use client'

import { useState, useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SparklesIcon, Loader2Icon } from 'lucide-react'
import { createInterviewPack } from '@/actions/interview'
import type { CreatePackState } from '@/actions/interview'
import { isSupportedLanguage, type SupportedLanguage } from '@/lib/ai/language'
import { PackLanguagePicker } from './pack-language-picker'

type Props = {
  candidateId: string
  roleId: string
  roleName: string
  candidateLanguages?: string[]
  /**
   * Tenant-wide default pack language (BCP 47 short code). Used when the
   * candidate has no usable language preference. Falls through to 'en' if
   * absent or unsupported.
   */
  tenantDefaultLanguage?: string
}
type PackType = 'full' | 'pre_screening'

/**
 * Resolve the default pack language using the 3-tier fallback chain:
 *   1. candidate.languagesSpoken[0..n] (first entry that maps to a SupportedLanguage)
 *   2. tenant default (admin-configurable in /dashboard/settings)
 *   3. 'en'
 *
 * Matches both BCP 47 codes ('pl') and full names ('Polish').
 */
function resolveDefaultLanguage(
  candidateLanguages: string[] | undefined,
  tenantDefaultLanguage: string | undefined
): SupportedLanguage {
  // Tier 1: candidate-spoken languages
  if (candidateLanguages?.length) {
    for (const raw of candidateLanguages) {
      const normalised = raw.trim().toLowerCase()
      if (isSupportedLanguage(normalised)) return normalised
      // Try mapping common display names back to a code
      const codeFromName: Record<string, SupportedLanguage> = {
        english: 'en',
        polish: 'pl',
        german: 'de',
        french: 'fr',
        spanish: 'es',
        italian: 'it',
        portuguese: 'pt',
        dutch: 'nl',
        czech: 'cs',
        swedish: 'sv',
      }
      const mapped = codeFromName[normalised]
      if (mapped) return mapped
    }
  }

  // Tier 2: tenant default
  if (isSupportedLanguage(tenantDefaultLanguage)) return tenantDefaultLanguage

  // Tier 3: hard fallback
  return 'en'
}

export function PackGenerator({ candidateId, roleId, roleName, candidateLanguages, tenantDefaultLanguage }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [includeCode, setIncludeCode] = useState(false)
  const [packType, setPackType] = useState<PackType>('full')
  const [language, setLanguage] = useState<SupportedLanguage>(() =>
    resolveDefaultLanguage(candidateLanguages, tenantDefaultLanguage)
  )

  const isPreScreening = packType === 'pre_screening'
  const effectiveIncludeCode = isPreScreening ? false : includeCode

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
        body: JSON.stringify({
          packId: state.packId,
          includeCodeChallenge: effectiveIncludeCode,
          packType,
          language,
        }),
      }).catch((err) => console.error('Failed to trigger generation:', err))

      setOpen(false)
      router.push(`/dashboard/candidates/${candidateId}/interview/${state.packId}`)
      router.refresh()
    }
  }, [state, router, candidateId, effectiveIncludeCode, packType, language])

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pack-gen-title"
          onClick={(e) => { if (e.target === e.currentTarget && !pending) setOpen(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape' && !pending) setOpen(false) }}
        >
          <div className="bg-zinc-900 rounded-xl shadow-xl border border-zinc-700 w-full max-w-md p-6">
            <h2 id="pack-gen-title" className="text-lg font-semibold text-zinc-100 mb-1">Generate interview pack</h2>
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
              <input type="hidden" name="includeCodeChallenge" value={String(effectiveIncludeCode)} />
              <input type="hidden" name="packType" value={packType} />

              {/* Language picker — defaults to candidate's primary spoken language if supported */}
              <PackLanguagePicker
                value={language}
                onChange={setLanguage}
                disabled={pending}
              />

              {/* Pack type radio group */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-zinc-300 mb-1">Pack type</legend>
                <label className="flex items-start gap-3 cursor-pointer rounded-md border border-zinc-700 bg-zinc-800/50 p-3 hover:bg-zinc-800 transition-colors">
                  <input
                    type="radio"
                    name="packTypeRadio"
                    value="full"
                    checked={packType === 'full'}
                    onChange={() => setPackType('full')}
                    disabled={pending}
                    className="mt-0.5 h-4 w-4 border-zinc-600 text-violet-600"
                  />
                  <span className="text-sm text-zinc-100">
                    Full interview pack
                    <span className="block text-xs text-zinc-500">8-12 questions · ~60 min</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer rounded-md border border-zinc-700 bg-zinc-800/50 p-3 hover:bg-zinc-800 transition-colors">
                  <input
                    type="radio"
                    name="packTypeRadio"
                    value="pre_screening"
                    checked={packType === 'pre_screening'}
                    onChange={() => setPackType('pre_screening')}
                    disabled={pending}
                    className="mt-0.5 h-4 w-4 border-zinc-600 text-violet-600"
                  />
                  <span className="text-sm text-zinc-100">
                    Pre-screening call
                    <span className="block text-xs text-zinc-500">5 questions · ~30 min · quick fit check</span>
                  </span>
                </label>
              </fieldset>

              {/* Code challenge — disabled for pre-screening */}
              <label className={`flex items-start gap-3 ${isPreScreening ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={effectiveIncludeCode}
                  onChange={(e) => setIncludeCode(e.target.checked)}
                  disabled={pending || isPreScreening}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 text-violet-600"
                />
                <span className="text-sm text-zinc-300">
                  Include code challenge
                  <span className="block text-xs text-zinc-500">
                    {isPreScreening
                      ? 'Not available for pre-screening calls'
                      : 'AI generates a language-appropriate coding exercise'}
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
