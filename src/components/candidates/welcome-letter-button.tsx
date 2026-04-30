'use client'

import { useState, useEffect, useCallback } from 'react'
import { MailIcon, Loader2Icon, XIcon } from 'lucide-react'
import { SUPPORTED_LANGUAGES, getDisplayName } from '@/lib/ai/language'
import { INTERVIEW_TYPES } from '@/lib/ai/welcome-letter-schemas'
import type { SupportedLanguage } from '@/lib/ai/language'
import type { InterviewType } from '@/lib/ai/welcome-letter-schemas'

type CandidateRole = {
  id: string
  title: string
}

type Props = {
  candidateId: string
  candidateLanguagesSpoken: string[] | null
  defaultPackLanguage: string
  currentRoleId: string | null
  candidateRoles: CandidateRole[]
  audience: 'recruiter' | 'customer' | 'manager'
}

/**
 * Derive the best default language for the letter from:
 * 1. First language in candidateLanguagesSpoken that is also in SUPPORTED_LANGUAGES
 * 2. defaultPackLanguage if it's supported
 * 3. 'en' fallback
 */
function resolveDefaultLanguage(
  candidateLanguagesSpoken: string[] | null,
  defaultPackLanguage: string
): SupportedLanguage {
  const supported = new Set<string>(SUPPORTED_LANGUAGES)

  for (const lang of candidateLanguagesSpoken ?? []) {
    if (supported.has(lang)) return lang as SupportedLanguage
  }
  if (supported.has(defaultPackLanguage)) return defaultPackLanguage as SupportedLanguage
  return 'en'
}

export function WelcomeLetterButton({
  candidateId,
  candidateLanguagesSpoken,
  defaultPackLanguage,
  currentRoleId,
  candidateRoles,
  audience,
}: Props) {
  // Recruiter-only surface — renders nothing for other audiences
  if (audience !== 'recruiter') return null

  return (
    <WelcomeLetterButtonInner
      candidateId={candidateId}
      candidateLanguagesSpoken={candidateLanguagesSpoken}
      defaultPackLanguage={defaultPackLanguage}
      currentRoleId={currentRoleId}
      candidateRoles={candidateRoles}
    />
  )
}

// Separated into an inner component so the hook call is not conditional
type InnerProps = Omit<Props, 'audience'>

function WelcomeLetterButtonInner({
  candidateId,
  candidateLanguagesSpoken,
  defaultPackLanguage,
  currentRoleId,
  candidateRoles,
}: InnerProps) {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<SupportedLanguage>(() =>
    resolveDefaultLanguage(candidateLanguagesSpoken, defaultPackLanguage)
  )
  const [interviewType, setInterviewType] = useState<InterviewType>('standard')
  const [roleId, setRoleId] = useState<string>(currentRoleId ?? '')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    if (generating) return
    setOpen(false)
    setError(null)
  }, [generating])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  async function handleGenerate() {
    setError(null)
    setGenerating(true)

    const url = new URL(`/api/export/welcome-letter/${candidateId}`, window.location.origin)
    url.searchParams.set('lang', lang)
    url.searchParams.set('type', interviewType)
    if (roleId) url.searchParams.set('roleId', roleId)

    try {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/pdf' } })

      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string; detail?: string }
          detail = body.detail ?? body.error ?? detail
        } catch {
          // non-JSON error body — keep the status code
        }
        setError(`Generation failed: ${detail}`)
        return
      }

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `welcome-letter-${lang}.pdf`
      anchor.click()
      URL.revokeObjectURL(objectUrl)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  const roleOptions: CandidateRole[] = [
    { id: '', title: 'No specific role' },
    ...candidateRoles,
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600
                   text-sm text-zinc-400 px-3 py-1.5
                   hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
      >
        <MailIcon className="h-3.5 w-3.5" />
        Welcome letter
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Generate candidate welcome letter"
        >
          <div
            className="relative bg-zinc-950 border border-zinc-700 rounded-xl p-6
                        max-w-md w-[calc(100vw-2rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Welcome letter</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Generate a personalised interview prep letter for the candidate.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={generating}
                className="p-2 md:p-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Language */}
            <div className="mb-4">
              <label htmlFor="wl-lang" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Language
              </label>
              <select
                id="wl-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as SupportedLanguage)}
                disabled={generating}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100
                           text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50"
              >
                {SUPPORTED_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {getDisplayName(code)} ({code})
                  </option>
                ))}
              </select>
            </div>

            {/* Interview type */}
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Interview type</p>
              <div className="flex flex-col gap-1.5">
                {INTERVIEW_TYPES.map((t) => {
                  const labels: Record<InterviewType, string> = {
                    standard: 'Standard interview',
                    karat: 'Karat technical interview',
                    both: 'Both',
                  }
                  return (
                    <label
                      key={t}
                      className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="wl-interview-type"
                        value={t}
                        checked={interviewType === t}
                        onChange={() => setInterviewType(t)}
                        disabled={generating}
                        className="accent-blue-500"
                      />
                      {labels[t]}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Role context */}
            <div className="mb-5">
              <label htmlFor="wl-role" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Role context
              </label>
              <select
                id="wl-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={generating}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100
                           text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50"
              >
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Inline error */}
            {error && (
              <p className="mb-4 text-xs text-red-400 bg-red-950 border border-red-800 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={generating}
                className="rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300
                           text-sm font-medium px-4 py-2
                           hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50
                           transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white
                           text-sm font-medium px-4 py-2
                           hover:bg-blue-500 disabled:opacity-60 transition-colors"
              >
                {generating ? (
                  <>
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  'Generate & download'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
