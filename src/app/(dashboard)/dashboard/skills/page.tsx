import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SparklesIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/auth/require-role'
import { getUniqueSkillsWithCandidateCounts } from '@/actions/skills'

export const metadata = { title: 'Skills — SkillAI' }

// DO NOT REMOVE — Next 16.2 + React 19 prerender bug (#41 workaround). Any new
// route under (dashboard)/ whose layout renders a context-using client
// component at module scope must opt out of prerender or `next build` will
// throw `useContext null` for the static path. Remove only when upstream Next
// ships a fix.
export const dynamic = 'force-dynamic'

export default async function SkillsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const userRole = (session.user as { role?: string }).role
  if (!hasRole((userRole ?? 'viewer') as 'admin' | 'recruiter' | 'hiring_manager' | 'viewer', 'recruiter')) {
    return (
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-8 text-center">
        <h1 className="text-lg font-medium text-[var(--color-fg)] mb-2">Recruiter access required</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          The Skills Explorer is only available to recruiters and admins.
        </p>
      </div>
    )
  }

  const skills = await getUniqueSkillsWithCandidateCounts()
  const candidateTotal = skills.reduce((acc, s) => Math.max(acc, s.candidateCount), 0)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <SparklesIcon className="h-5 w-5 text-violet-500 dark:text-violet-400" />
          <h1 className="text-xl font-semibold text-[var(--color-fg)]">Skills</h1>
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {skills.length === 0
            ? 'No skills extracted yet.'
            : `${skills.length} skill${skills.length === 1 ? '' : 's'} across the candidate archive — click a chip to filter.`}
        </p>
      </header>

      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
        {skills.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-fg-muted)] mb-1">
              Skills will appear here automatically once CVs have been processed.
            </p>
            <p className="text-xs text-[var(--color-fg-subtle)]">
              New uploads typically take 30 to 60 seconds to extract.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <Link
                key={skill.skillKey}
                href={`/dashboard/candidates?skills=${encodeURIComponent(skill.displayName)}`}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm
                           bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300
                           border border-blue-300 dark:border-blue-800
                           hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors"
              >
                <span className="font-medium">{skill.displayName}</span>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                  {skill.candidateCount}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {candidateTotal > 0 && (
        <p className="text-xs text-[var(--color-fg-subtle)]">
          Skills are extracted from candidate CVs in the background. Chip counts reflect distinct
          candidates per skill (case-insensitive grouping).
        </p>
      )}
    </div>
  )
}
