import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { desc, asc, eq, and, gte, ne, count, sql, isNull } from 'drizzle-orm'
import {
  BriefcaseIcon,
  UsersIcon,
  TrendingUpIcon,
  BrainIcon,
  FileXIcon,
} from 'lucide-react'

import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, candidates, scores, interviewPacks, agencies, interviewSlots, users } from '@/db/schema'
import { NextInterviewsCard } from '@/components/dashboard/next-interviews-card'
import { ForYouSection } from '@/components/dashboard/for-you-section'
import { AwaitingCustomerFeedbackWidget } from '@/components/dashboard/awaiting-customer-feedback-widget'
import { getForYouFeed } from '@/actions/dashboard-tasks'

export const metadata = { title: 'Dashboard — SkillAI' }

// Stat counts are stable for several minutes — wrap in unstable_cache with a
// 60-second TTL. The cache key includes tenantId so tenants don't share entries.
// Eventual consistency is acceptable here: the cards show round-number aggregates
// (active roles, total candidates, …); a few seconds of staleness after a write
// is not user-visible. Lists below stay uncached because users expect freshness.
const getDashboardStats = unstable_cache(
  async (tenantId: string) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return withTenant(tenantId, async (tx) => {
      const [
        [{ value: roleCount }],
        [{ value: candidateCount }],
        [{ value: scoredCount }],
        [{ value: packsCount }],
        [{ value: missingCvCount }],
      ] = await Promise.all([
        tx.select({ value: count() }).from(roles).where(eq(roles.isActive, true)),
        tx.select({ value: count() }).from(candidates).where(eq(candidates.isActive, true)),
        tx
          .select({ value: count() })
          .from(scores)
          .where(and(eq(scores.scoreStatus, 'complete'), gte(scores.createdAt, sevenDaysAgo))),
        tx
          .select({ value: count() })
          .from(interviewPacks)
          .where(eq(interviewPacks.generationStatus, 'complete')),
        tx
          .select({ value: count() })
          .from(candidates)
          .where(and(eq(candidates.isActive, true), isNull(candidates.filePath))),
      ])
      return { roleCount, candidateCount, scoredCount, packsCount, missingCvCount }
    })
  },
  ['dashboard-stats'],
  { revalidate: 60 }
)

const STATUS_BADGE: Record<string, string> = {
  new:          'bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]',
  shortlisted:  'bg-blue-900/60 text-blue-300',
  interviewing: 'bg-violet-900/60 text-violet-300',
  offered:      'bg-amber-900/60 text-amber-300',
  rejected:     'bg-red-900/60 text-red-300',
  hired:        'bg-green-900/60 text-green-300',
}

export default async function DashboardPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId

  if (!tenantId) notFound()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const now = new Date()

  // Three independent top-level fetches run in parallel:
  //   1. for-you feed (its own withTenant + parallel sub-queries internally)
  //   2. stat counts (cached for 60s, single withTenant when cold)
  //   3. list queries (one withTenant + Promise.all across the four lists)
  //
  // Previously the page ran 8 separate withTenant calls sequentially. Each
  // withTenant opens a transaction and sets the RLS session variable, so each
  // is one round-trip to Postgres. Collapsing to three top-level fetches
  // (parallel), one of which batches four queries, removes ~7 round-trips.
  const [feed, stats, lists] = await Promise.all([
    getForYouFeed(
      session.user.id,
      session.user.role as 'admin' | 'recruiter' | 'hiring_manager' | 'viewer',
      tenantId,
    ),
    getDashboardStats(tenantId),
    withTenant(tenantId, async (tx) =>
      Promise.all([
        // Recent roles (with candidate count via scores)
        tx
          .select({
            id:             roles.id,
            title:          roles.title,
            createdAt:      roles.createdAt,
            candidateCount: sql<number>`cast(count(${scores.id}) as integer)`,
          })
          .from(roles)
          .leftJoin(scores, eq(scores.roleId, roles.id))
          .where(eq(roles.isActive, true))
          .groupBy(roles.id)
          .orderBy(desc(roles.createdAt))
          .limit(5),

        // Top candidates this week by overall score
        tx
          .select({
            candidateId:  candidates.id,
            firstName:    candidates.firstName,
            lastName:     candidates.lastName,
            overallScore: scores.overallScore,
            roleId:       roles.id,
            roleTitle:    roles.title,
          })
          .from(scores)
          .innerJoin(candidates, eq(scores.candidateId, candidates.id))
          .innerJoin(roles, eq(scores.roleId, roles.id))
          .where(and(eq(scores.scoreStatus, 'complete'), gte(scores.updatedAt, sevenDaysAgo)))
          .orderBy(desc(scores.overallScore))
          .limit(5),

        // Recent uploads (with agency name)
        tx
          .select({
            id:         candidates.id,
            firstName:  candidates.firstName,
            lastName:   candidates.lastName,
            status:     candidates.status,
            createdAt:  candidates.createdAt,
            agencyName: agencies.name,
          })
          .from(candidates)
          .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
          .where(eq(candidates.isActive, true))
          .orderBy(desc(candidates.createdAt))
          .limit(8),

        // Upcoming interviews (next 5, soonest first, excluding cancelled)
        tx
          .select({
            id:                  interviewSlots.id,
            scheduledAt:         interviewSlots.scheduledAt,
            durationMinutes:     interviewSlots.durationMinutes,
            title:               interviewSlots.title,
            location:            interviewSlots.location,
            meetingUrl:          interviewSlots.meetingUrl,
            status:              interviewSlots.status,
            candidateId:         interviewSlots.candidateId,
            candidateFirstName:  candidates.firstName,
            candidateLastName:   candidates.lastName,
            roleTitle:           roles.title,
            interviewerName:     users.name,
          })
          .from(interviewSlots)
          .innerJoin(candidates, eq(interviewSlots.candidateId, candidates.id))
          .leftJoin(roles, eq(interviewSlots.roleId, roles.id))
          .leftJoin(users, eq(interviewSlots.interviewerId, users.id))
          .where(and(
            gte(interviewSlots.scheduledAt, now),
            ne(interviewSlots.status, 'cancelled')
          ))
          .orderBy(asc(interviewSlots.scheduledAt))
          .limit(5),
      ])
    ),
  ])

  const { roleCount, candidateCount, scoredCount, packsCount, missingCvCount } = stats
  const [recentRoles, topCandidates, recentUploads, upcomingInterviews] = lists

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-fg)]">Dashboard</h1>
        <p className="text-[var(--color-fg-subtle)] mt-1">
          Welcome back,{' '}
          <span className="font-medium text-[var(--color-fg-muted)]">{session?.user.name}</span>.
        </p>
      </div>

      {/* ── For You section ────────────────────────────────────────────── */}
      <ForYouSection feed={feed} />

      {/* ── Next interviews widget ──────────────────────────────────────── */}
      <NextInterviewsCard interviews={upcomingInterviews} />

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1
                      sm:grid-cols-2
                      lg:grid-cols-5 gap-4 mb-10">
        {/* Active Roles */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--color-fg-subtle)]">Active Roles</span>
            <BriefcaseIcon className="h-4 w-4 text-violet-500" />
          </div>
          <p className="text-3xl font-bold text-[var(--color-fg)]">{roleCount}</p>
        </div>

        {/* Total Candidates */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--color-fg-subtle)]">Total Candidates</span>
            <UsersIcon className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-[var(--color-fg)]">{candidateCount}</p>
        </div>

        {/* Scored This Week */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--color-fg-subtle)]">Scored This Week</span>
            <TrendingUpIcon className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-[var(--color-fg)]">{scoredCount}</p>
        </div>

        {/* Interview Packs Ready */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--color-fg-subtle)]">Interview Packs Ready</span>
            <BrainIcon className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-[var(--color-fg)]">{packsCount}</p>
        </div>

        {/* Missing CV */}
        <Link
          href="/dashboard/candidates?missingCv=1"
          className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5
                     hover:border-amber-500/60 hover:bg-[var(--color-bg-input)]/60 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)] transition-colors">
              Missing CV
            </span>
            <FileXIcon className="h-4 w-4 text-amber-500" />
          </div>
          <p className={`text-3xl font-bold ${missingCvCount > 0 ? 'text-amber-400' : 'text-[var(--color-fg)]'}`}>
            {missingCvCount}
          </p>
        </Link>
      </div>

      {/* ── Content grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1
                      lg:grid-cols-2
                      xl:grid-cols-4 gap-6">

        {/* Recent Roles */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Recent Roles
            </h2>
            <Link
              href="/dashboard/roles"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
            </Link>
          </div>

          {recentRoles.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)] py-4 text-center">No active roles yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recentRoles.map((role) => (
                <li key={role.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/roles/${role.id}`}
                    className="flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-sm text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate block">
                        {role.title}
                      </span>
                      <span className="text-xs text-[var(--color-fg-subtle)]">
                        {role.candidateCount} candidate{role.candidateCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <time className="text-xs text-[var(--color-fg-subtle)] whitespace-nowrap">
                      {new Date(role.createdAt).toLocaleDateString('en-GB')}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top Candidates This Week */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Top Candidates This Week
            </h2>
            <Link
              href="/dashboard/candidates"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
            </Link>
          </div>

          {topCandidates.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)] py-4 text-center">No scored candidates this week.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {topCandidates.map((c) => (
                <li key={`${c.candidateId}-${c.roleId}`} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/candidates/${c.candidateId}`}
                    className="flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-[var(--color-fg-subtle)] truncate">{c.roleTitle}</p>
                    </div>
                    <span className="text-sm font-semibold text-green-400 whitespace-nowrap">
                      {c.overallScore ?? '—'}/100
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Uploads */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
              Recent Uploads
            </h2>
            <Link
              href="/dashboard/candidates"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
            </Link>
          </div>

          {recentUploads.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)] py-4 text-center">No candidates uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recentUploads.map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/candidates/${c.id}`}
                    className="flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-[var(--color-fg-subtle)] truncate">
                        {c.agencyName ?? 'Direct'} ·{' '}
                        <time>{new Date(c.createdAt).toLocaleDateString('en-GB')}</time>
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize whitespace-nowrap ${STATUS_BADGE[c.status] ?? 'bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]'}`}
                    >
                      {c.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Awaiting Customer Feedback */}
        <AwaitingCustomerFeedbackWidget />
      </div>
    </div>
  )
}
