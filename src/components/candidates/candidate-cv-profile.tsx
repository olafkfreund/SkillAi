'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { RefreshCwIcon, BriefcaseIcon, CheckCircle2Icon, AlertCircleIcon, Loader2Icon, SparklesIcon } from 'lucide-react'
import { reextractCvProfile } from '@/actions/cv-profiles'
import { reformatCv } from '@/actions/cv-reformat'
import { CvDisplay } from './cv-display'
import { RoleContent } from '@/components/roles/role-content'

type ProfileRow = {
  experienceLevel: string | null
  summary: string | null
  technicalSkills: string[] | null
  companies: Array<{ name: string; role: string; keyAchievements: string[] }> | null
  personalizableMoments: string[] | null
  extractionStatus: string
  errorMessage: string | null
  extractedAt: string | null
}

type Props = {
  candidateId: string
  cvText: string
  cvTextFormatted: string | null
  profile: ProfileRow | null
  canEdit: boolean
}

// ── Skill categorisation (heuristic, no AI) ─────────────────────────────────
const LANGUAGES = new Set([
  'javascript', 'typescript', 'python', 'java', 'c', 'c++', 'c#', 'go', 'golang',
  'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'r', 'bash', 'shell', 'sql',
  'html', 'css', 'elixir', 'erlang', 'haskell', 'clojure', 'dart', 'lua', 'perl',
  'objective-c', 'vb.net', 'nim', 'zig', 'julia', 'f#',
])
const FRAMEWORKS = new Set([
  'react', 'angular', 'vue', 'svelte', 'next.js', 'nextjs', 'next', 'nuxt', 'remix',
  'express', 'nestjs', 'fastify', 'django', 'flask', 'fastapi', 'rails', 'laravel',
  'spring', 'spring boot', '.net', 'dotnet', 'asp.net', 'gatsby', 'astro',
  'tailwind', 'tailwindcss', 'bootstrap', 'jquery', 'redux', 'zustand',
  'electron', 'react native', 'flutter', 'ionic', 'xamarin',
])
const TOOLS = new Set([
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'puppet', 'chef',
  'aws', 'azure', 'gcp', 'google cloud', 'digitalocean', 'linode', 'heroku',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'kafka', 'rabbitmq', 'grpc', 'graphql', 'rest', 'webpack', 'vite',
  'git', 'github', 'gitlab', 'jenkins', 'ci/cd', 'nginx', 'apache',
  'linux', 'unix', 'nixos', 'datadog', 'prometheus', 'grafana',
])

function categorizeSkill(skill: string): 'languages' | 'frameworks' | 'tools' | 'other' {
  const s = skill.toLowerCase().trim()
  if (LANGUAGES.has(s)) return 'languages'
  if (FRAMEWORKS.has(s)) return 'frameworks'
  if (TOOLS.has(s)) return 'tools'
  return 'other'
}

// ── Experience level badge styles ───────────────────────────────────────────
const LEVEL_STYLES: Record<string, string> = {
  junior: 'bg-zinc-100 dark:bg-[var(--color-bg-input)] text-zinc-700 dark:text-[var(--color-fg)] border-zinc-300 dark:border-[var(--color-border)]',
  mid: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  senior: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800',
  lead: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
}

export function CandidateCvProfile({ candidateId, cvText, cvTextFormatted, profile: initialProfile, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [retryError, setRetryError] = useState<string | null>(null)
  const [isReformatting, startReformatTransition] = useTransition()
  const [reformatError, setReformatError] = useState<string | null>(null)

  async function handleReformat() {
    setReformatError(null)
    startReformatTransition(async () => {
      const result = await reformatCv(candidateId)
      if (!result.success) setReformatError(result.error ?? 'Reformat failed')
    })
  }

  // Poll while extraction is in progress
  const { data: livePack } = useQuery<ProfileRow | null>({
    queryKey: ['cv-profile', candidateId],
    queryFn: async () => {
      const res = await fetch(`/api/candidates/${candidateId}/cv-profile`)
      if (!res.ok) return null
      return res.json()
    },
    initialData: initialProfile,
    refetchInterval: (query) => {
      const status = query.state.data?.extractionStatus
      if (status === 'pending' || status === 'processing') return 3000
      return false
    },
  })

  const profile = livePack ?? initialProfile
  const status = profile?.extractionStatus

  // Refresh server page data when extraction completes
  useEffect(() => {
    if (status === 'complete') {
      router.refresh()
    }
  }, [status, router])

  async function handleReextract() {
    setRetryError(null)
    startTransition(async () => {
      const result = await reextractCvProfile(candidateId)
      if (!result.success) setRetryError(result.error ?? 'Re-extraction failed')
    })
  }

  const skills = profile?.technicalSkills ?? []
  const companies = profile?.companies ?? []
  const isProcessing = status === 'pending' || status === 'processing'
  const isFailed = status === 'failed'
  const isComplete = status === 'complete'

  // Group skills heuristically
  const skillGroups = {
    languages: skills.filter((s) => categorizeSkill(s) === 'languages'),
    frameworks: skills.filter((s) => categorizeSkill(s) === 'frameworks'),
    tools: skills.filter((s) => categorizeSkill(s) === 'tools'),
    other: skills.filter((s) => categorizeSkill(s) === 'other'),
  }

  return (
    <div className="space-y-4">
      {/* Header row — experience level + re-extract button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {profile?.experienceLevel && (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border capitalize ${
              LEVEL_STYLES[profile.experienceLevel] ?? LEVEL_STYLES.mid
            }`}>
              {profile.experienceLevel} level
            </span>
          )}
          {isComplete && profile?.extractedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-subtle)]">
              <CheckCircle2Icon className="h-3 w-3 text-emerald-500" />
              Extracted {new Date(profile.extractedAt).toLocaleDateString('en-GB')}
            </span>
          )}
          {isProcessing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
              <Loader2Icon className="h-3 w-3 animate-spin" />
              Extracting profile with AI…
            </span>
          )}
        </div>
        {canEdit && !isProcessing && (
          <button
            type="button"
            onClick={handleReextract}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-fg-muted)] text-xs px-2.5 py-1 hover:bg-[var(--color-bg-input)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
          >
            <RefreshCwIcon className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Queuing…' : 'Re-extract'}
          </button>
        )}
      </div>

      {retryError && (
        <div className="rounded-md bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          {retryError}
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-xl bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Profile extraction failed</p>
              {profile?.errorMessage && (
                <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{profile.errorMessage.split('\n')[0]}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {isComplete && profile?.summary && (
        <div className="bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-sm text-[var(--color-fg)] leading-relaxed">{profile.summary}</p>
        </div>
      )}

      {/* Skills */}
      {isComplete && skills.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">Skills</h3>
          <div className="space-y-3">
            {(['languages', 'frameworks', 'tools', 'other'] as const).map((cat) => {
              const items = skillGroups[cat]
              if (items.length === 0) return null
              const label = cat === 'languages' ? 'Languages' : cat === 'frameworks' ? 'Frameworks' : cat === 'tools' ? 'Tools & Platforms' : 'Other'
              return (
                <div key={cat}>
                  <p className="text-[11px] text-[var(--color-fg-subtle)] uppercase tracking-wide mb-1.5">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((skill) => (
                      <SkillChip key={skill} skill={skill} category={cat} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Company timeline */}
      {isComplete && companies.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">Experience</h3>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[var(--color-bg-input)]" />
            <div className="space-y-4">
              {companies.map((company, i) => (
                <div key={`${company.name}-${i}`} className="relative">
                  <span className="absolute -left-6 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/20 border-2 border-violet-500">
                    <BriefcaseIcon className="h-2 w-2 text-violet-300" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-fg)]">
                      {company.role} <span className="text-[var(--color-fg-subtle)] font-normal">·</span>{' '}
                      <span className="text-[var(--color-fg)] font-normal">{company.name}</span>
                    </p>
                    {company.keyAchievements.length > 0 && (
                      <ul className="mt-1.5 space-y-1 text-sm text-[var(--color-fg-muted)]">
                        {company.keyAchievements.map((ach, j) => (
                          <li key={j} className="flex gap-2 leading-relaxed">
                            <span className="text-[var(--color-fg-subtle)] flex-shrink-0">•</span>
                            <span>{ach}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pending skeleton when no profile data at all */}
      {isProcessing && skills.length === 0 && companies.length === 0 && (
        <div className="space-y-3">
          <div className="h-16 bg-[var(--color-bg-elevated)] border border-[var(--color-bg-input)] rounded-lg animate-pulse" />
          <div className="h-24 bg-[var(--color-bg-elevated)] border border-[var(--color-bg-input)] rounded-lg animate-pulse" />
          <div className="h-32 bg-[var(--color-bg-elevated)] border border-[var(--color-bg-input)] rounded-lg animate-pulse" />
        </div>
      )}

      {/* Raw / formatted CV disclosure */}
      <details className="group" open={!isComplete}>
        <summary className="cursor-pointer text-sm text-violet-400 hover:text-violet-300 select-none py-2 flex items-center gap-2">
          <span className="flex-1">
            <span className="group-open:hidden">▸ Show full CV text</span>
            <span className="hidden group-open:inline">▾ Hide full CV text</span>
          </span>
          {cvTextFormatted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950 border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-[10px] font-medium px-2 py-0.5">
              <SparklesIcon className="h-2.5 w-2.5" />
              AI-formatted
            </span>
          )}
        </summary>

        <div className="mt-2 pt-3 border-t border-[var(--color-bg-input)]">
          {/* Reformat button — recruiters/admins only */}
          {canEdit && (
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-xs text-[var(--color-fg-subtle)]">
                {cvTextFormatted
                  ? 'Showing AI-formatted version. Click below to regenerate from raw text.'
                  : 'Showing raw extracted text. Click "Reformat with AI" for a cleaner version.'}
              </p>
              <button
                type="button"
                onClick={handleReformat}
                disabled={isReformatting}
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 dark:border-violet-800 bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-xs font-medium px-2.5 py-1 hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors disabled:opacity-50"
              >
                {isReformatting ? (
                  <Loader2Icon className="h-3 w-3 animate-spin" />
                ) : (
                  <SparklesIcon className="h-3 w-3" />
                )}
                {isReformatting
                  ? 'Reformatting…'
                  : cvTextFormatted ? 'Re-format with AI' : 'Reformat with AI'}
              </button>
            </div>
          )}
          {reformatError && (
            <div className="mb-3 rounded-md bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {reformatError}
            </div>
          )}

          {cvTextFormatted ? (
            <RoleContent text={cvTextFormatted} />
          ) : (
            <CvDisplay cvText={cvText} />
          )}
        </div>
      </details>
    </div>
  )
}

// ── Skill chip ──────────────────────────────────────────────────────────────
function SkillChip({ skill, category }: { skill: string; category: 'languages' | 'frameworks' | 'tools' | 'other' }) {
  const styles = {
    languages: 'bg-blue-100 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    frameworks: 'bg-violet-100 dark:bg-violet-950/50 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300',
    tools: 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    other: 'bg-zinc-100 dark:bg-[var(--color-bg-input)] border-zinc-300 dark:border-[var(--color-border)] text-zinc-700 dark:text-[var(--color-fg)]',
  }[category]
  return (
    <span className={`inline-flex items-center rounded-full border text-xs px-2.5 py-1 ${styles}`}>
      {skill}
    </span>
  )
}
