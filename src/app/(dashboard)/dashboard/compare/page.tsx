import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, desc, and } from 'drizzle-orm'
import { ArrowLeftIcon, UsersIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, scores, roles } from '@/db/schema'
import type { Candidate } from '@/db/schema/candidates'
import type { Score } from '@/db/schema/scores'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateData {
  candidate: Candidate
  topScore: { score: Score; roleTitle: string } | null
}

// ---------------------------------------------------------------------------
// Score bar sub-component
// ---------------------------------------------------------------------------

function DimensionBar({ label, value }: { label: string; value: number | null }) {
  const pct = value ?? 0
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-[var(--color-fg-subtle)] mb-1">
        <span className="capitalize">{label.replace('_', ' ')}</span>
        <span className="text-[var(--color-fg-muted)]">{value ?? '—'}</span>
      </div>
      <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]',
  shortlisted: 'bg-blue-900 text-blue-300',
  interviewing: 'bg-amber-900 text-amber-300',
  offered: 'bg-purple-900 text-purple-300',
  rejected: 'bg-red-900 text-red-400',
  hired: 'bg-green-900 text-green-300',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.new}`}
    >
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Candidate card
// ---------------------------------------------------------------------------

function CandidateCard({ data }: { data: CandidateData }) {
  const { candidate, topScore } = data
  const score = topScore?.score
  const isComplete = score?.scoreStatus === 'complete'

  const summary = score?.aiSummary
  const truncatedSummary =
    summary && summary.length > 250 ? summary.slice(0, 247) + '…' : summary

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--color-fg)] truncate">
            {candidate.firstName} {candidate.lastName}
          </h2>
          {candidate.email && (
            <p className="text-xs text-[var(--color-fg-subtle)] truncate mt-0.5">{candidate.email}</p>
          )}
          <div className="mt-2">
            <StatusBadge status={candidate.status ?? 'new'} />
          </div>
        </div>

        {/* Overall score badge */}
        {isComplete && score?.overallScore != null && (
          <div className="flex-shrink-0 text-center bg-blue-950 border border-blue-700 rounded-xl px-4 py-2">
            <p className="text-2xl font-bold text-blue-300">{score.overallScore}</p>
            <p className="text-xs text-blue-400">score</p>
          </div>
        )}
      </div>

      {/* Role */}
      {topScore && (
        <p className="text-xs text-[var(--color-fg-subtle)]">
          Scored for:{' '}
          <span className="text-[var(--color-fg-muted)] font-medium">{topScore.roleTitle}</span>
        </p>
      )}

      {/* Dimension bars */}
      {isComplete && score && (
        <div>
          <DimensionBar label="Technical skills" value={score.technicalScore} />
          <DimensionBar label="Experience" value={score.experienceScore} />
          <DimensionBar label="Role fit" value={score.culturalFitScore} />
          <DimensionBar label="Communication" value={score.communicationScore} />
        </div>
      )}

      {/* No score state */}
      {!topScore && (
        <p className="text-xs text-[var(--color-fg-subtle)] italic">No completed score yet</p>
      )}

      {/* AI summary */}
      {truncatedSummary && (
        <p className="text-xs text-[var(--color-fg-muted)] leading-relaxed border-t border-[var(--color-border)] pt-3">
          {truncatedSummary}
        </p>
      )}

      {/* View full profile link */}
      <Link
        href={`/dashboard/candidates/${candidate.id}`}
        className="mt-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        View full profile &rarr;
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid column class helper
// ---------------------------------------------------------------------------

function gridClass(count: number): string {
  if (count === 2) return 'grid-cols-1 md:grid-cols-2'
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  if (count === 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Props = {
  searchParams: Promise<{ ids?: string }>
}

export default async function ComparePage({ searchParams }: Props) {
  const { ids: rawIds } = await searchParams

  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  // Parse and validate IDs (max 5, UUID-ish)
  const ids = rawIds
    ? rawIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : []

  // Empty state — fewer than 2 IDs
  if (ids.length < 2) {
    return (
      <div className="max-w-4xl">
        <Link
          href="/dashboard/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] mb-6"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          All candidates
        </Link>
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-20 text-center">
          <UsersIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-4" />
          <h1 className="text-lg font-semibold text-[var(--color-fg)] mb-2">No candidates selected</h1>
          <p className="text-sm text-[var(--color-fg-subtle)] max-w-xs mb-6">
            Select 2–5 candidates from the candidates list using the comparison checkboxes, then
            click &ldquo;Compare&rdquo;.
          </p>
          <Link
            href="/dashboard/candidates"
            className="rounded-md bg-blue-600 text-white text-sm font-medium px-5 py-2 hover:bg-blue-700 transition-colors"
          >
            Browse candidates
          </Link>
        </div>
      </div>
    )
  }

  // Fetch each candidate + their best completed score
  const candidatesData: CandidateData[] = await Promise.all(
    ids.map(async (id) => {
      const [candidate] = await withTenant(tenantId, async (tx) =>
        tx
          .select()
          .from(candidates)
          .where(and(eq(candidates.id, id), eq(candidates.isActive, true)))
          .limit(1)
      )

      if (!candidate) return null

      const [topScoreRow] = await withTenant(tenantId, async (tx) =>
        tx
          .select({ score: scores, roleTitle: roles.title })
          .from(scores)
          .innerJoin(roles, eq(scores.roleId, roles.id))
          .where(
            and(
              eq(scores.candidateId, id),
              eq(scores.scoreStatus, 'complete')
            )
          )
          .orderBy(desc(scores.overallScore))
          .limit(1)
      )

      return {
        candidate,
        topScore: topScoreRow
          ? { score: topScoreRow.score, roleTitle: topScoreRow.roleTitle }
          : null,
      }
    })
  ).then((results) => results.filter((r): r is CandidateData => r !== null))

  if (candidatesData.length < 2) {
    return (
      <div className="max-w-4xl">
        <Link
          href="/dashboard/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] mb-6"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          All candidates
        </Link>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">
            Could not load enough candidates. They may have been archived or the IDs are invalid.
          </p>
          <Link
            href="/dashboard/candidates"
            className="mt-4 inline-block text-xs text-blue-400 hover:text-blue-300"
          >
            &larr; Back to candidates
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/dashboard/candidates"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] mb-2"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            All candidates
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-fg)]">
            Comparing {candidatesData.length} candidates
          </h1>
        </div>
      </div>

      {/* Comparison grid */}
      <div className={`grid gap-4 ${gridClass(candidatesData.length)}`}>
        {candidatesData.map((data) => (
          <CandidateCard key={data.candidate.id} data={data} />
        ))}
      </div>
    </div>
  )
}
