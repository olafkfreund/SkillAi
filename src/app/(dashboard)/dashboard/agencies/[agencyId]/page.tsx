import { notFound } from 'next/navigation'
import { eq, and, desc, isNull, count, avg, max, sql } from 'drizzle-orm'
import Link from 'next/link'
import { HomeIcon, LockIcon } from 'lucide-react'
import { withTenant } from '@/db'
import { agencies, candidates, scores } from '@/db/schema'
import { auth } from '@/lib/auth'
import { AgencyEditForm } from '@/components/agencies/agency-edit-form'
import { AgencyCandidatePanel } from '@/components/agencies/agency-candidate-panel'

export const metadata = { title: 'Agency — SkillAI' }

interface Props {
  params: Promise<{ agencyId: string }>
}

export default async function AgencyDetailPage({ params }: Props) {
  const { agencyId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [agency] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(agencies)
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
      .limit(1)
  )

  if (!agency) notFound()

  const agencyCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        filePath: candidates.filePath,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .where(and(eq(candidates.agencyId, agencyId), eq(candidates.tenantId, tenantId)))
      .orderBy(desc(candidates.createdAt))
  )

  // Candidates with no agency (for assignment)
  const unassignedCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
      })
      .from(candidates)
      .where(and(isNull(candidates.agencyId), eq(candidates.tenantId, tenantId), eq(candidates.isActive, true)))
      .orderBy(candidates.firstName)
  )

  // ── Performance stats ─────────────────────────────────────────────────────
  // Aggregate stats for completed scores on this agency's candidates
  const [perfStats] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        totalCandidates: count(candidates.id),
        avgScore:        avg(scores.overallScore),
        maxScore:        max(scores.overallScore),
      })
      .from(candidates)
      .leftJoin(
        scores,
        and(eq(scores.candidateId, candidates.id), eq(scores.scoreStatus, 'complete'))
      )
      .where(and(eq(candidates.agencyId, agencyId), eq(candidates.tenantId, tenantId)))
  )

  // Highest scoring candidate name for the performance header
  const [topCandidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        firstName:    candidates.firstName,
        lastName:     candidates.lastName,
        overallScore: scores.overallScore,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.agencyId, agencyId),
          eq(candidates.tenantId, tenantId),
          eq(scores.scoreStatus, 'complete')
        )
      )
      .orderBy(desc(scores.overallScore))
      .limit(1)
  )

  // Score distribution buckets
  const [distribution] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        excellent: sql<number>`cast(count(*) filter (where ${scores.overallScore} >= 75) as integer)`,
        good:      sql<number>`cast(count(*) filter (where ${scores.overallScore} >= 50 and ${scores.overallScore} < 75) as integer)`,
        below:     sql<number>`cast(count(*) filter (where ${scores.overallScore} < 50) as integer)`,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.agencyId, agencyId),
          eq(candidates.tenantId, tenantId),
          eq(scores.scoreStatus, 'complete')
        )
      )
  )

  const canEdit = session?.user.role !== 'viewer'

  const avgScoreDisplay = perfStats?.avgScore
    ? Math.round(Number(perfStats.avgScore))
    : null

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/agencies" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to agencies
        </Link>
        <div className="flex items-center gap-4 mt-2">
          {/* 64px logo or initials avatar */}
          {agency.logoPath ? (
            <img
              src={`/api/agencies/${agency.id}/logo`}
              alt=""
              width={64}
              height={64}
              className="rounded-xl border border-zinc-700 bg-zinc-800 object-contain shrink-0"
              style={{ width: 64, height: 64 }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-400
                         text-xl font-semibold shrink-0"
              style={{ width: 64, height: 64 }}
              aria-hidden="true"
            >
              {agency.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            {agency.isInternal && <HomeIcon className="h-5 w-5 text-blue-400" />}
            {agency.name}
            {agency.isSystem && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-800
                           text-zinc-300 text-xs font-medium px-2 py-0.5"
                title="System agency — managed by SkillAI, cannot be archived"
              >
                <LockIcon className="h-3 w-3" />
                System agency
              </span>
            )}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details / Edit */}
        <div className="lg:col-span-1">
          {canEdit ? (
            <AgencyEditForm agency={agency} />
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 space-y-4">
              {agency.contactEmail && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Email</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{agency.contactEmail}</p>
                </div>
              )}
              {agency.contactPhone && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Phone</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{agency.contactPhone}</p>
                </div>
              )}
              {agency.notes && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap">{agency.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Candidates from this agency */}
        <div className="lg:col-span-2">
          <AgencyCandidatePanel
            agencyId={agencyId}
            agencyCandidates={agencyCandidates.map((c) => ({
              ...c,
              filePath: c.filePath ?? null,
              createdAt: c.createdAt.toISOString(),
            }))}
            unassignedCandidates={unassignedCandidates}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* ── Agency Performance ─────────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Agency Performance</h2>

        {/* Stat cards */}
        <div className="grid grid-cols-1
                        sm:grid-cols-3 gap-4 mb-6">
          {/* Total candidates */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
            <p className="text-xs text-zinc-500 mb-2">Total Candidates</p>
            <p className="text-3xl font-bold text-zinc-100">
              {perfStats?.totalCandidates ?? 0}
            </p>
          </div>

          {/* Average overall score */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
            <p className="text-xs text-zinc-500 mb-2">Avg Overall Score</p>
            {avgScoreDisplay !== null ? (
              <p className="text-3xl font-bold text-zinc-100">
                {avgScoreDisplay}
                <span className="text-base font-normal text-zinc-500">/100</span>
              </p>
            ) : (
              <p className="text-3xl font-bold text-zinc-500">—</p>
            )}
          </div>

          {/* Highest scoring candidate */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
            <p className="text-xs text-zinc-500 mb-2">Top Candidate</p>
            {topCandidate ? (
              <div>
                <p className="text-base font-semibold text-zinc-100 truncate">
                  {topCandidate.firstName} {topCandidate.lastName}
                </p>
                <p className="text-sm text-green-400 font-medium">
                  {topCandidate.overallScore}/100
                </p>
              </div>
            ) : (
              <p className="text-base text-zinc-500">No scored candidates</p>
            )}
          </div>
        </div>

        {/* Score distribution */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
            Score Distribution
          </h3>
          {(distribution?.excellent ?? 0) + (distribution?.good ?? 0) + (distribution?.below ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">No completed scores yet for this agency.</p>
          ) : (
            <ul className="space-y-3">
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm text-zinc-300">Excellent (≥ 75)</span>
                </div>
                <span className="text-sm font-semibold text-zinc-100">
                  {distribution?.excellent ?? 0} candidate{(distribution?.excellent ?? 0) === 1 ? '' : 's'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-sm text-zinc-300">Good (50 – 74)</span>
                </div>
                <span className="text-sm font-semibold text-zinc-100">
                  {distribution?.good ?? 0} candidate{(distribution?.good ?? 0) === 1 ? '' : 's'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-sm text-zinc-300">Below threshold (&lt; 50)</span>
                </div>
                <span className="text-sm font-semibold text-zinc-100">
                  {distribution?.below ?? 0} candidate{(distribution?.below ?? 0) === 1 ? '' : 's'}
                </span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
