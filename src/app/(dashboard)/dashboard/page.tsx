import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq, and, gte, count } from 'drizzle-orm'
import {
  BriefcaseIcon,
  UsersIcon,
  TrendingUpIcon,
  BrainIcon,
} from 'lucide-react'

import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, candidates, scores, interviewPacks } from '@/db/schema'

export const metadata = { title: 'Dashboard — SkillAI' }

const STATUS_BADGE: Record<string, string> = {
  new:          'bg-zinc-700 text-zinc-300',
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

  // ── Stat queries ─────────────────────────────────────────────────────────
  const [{ value: roleCount }] = await withTenant(tenantId, async (tx) =>
    tx.select({ value: count() }).from(roles).where(eq(roles.isActive, true))
  )

  const [{ value: candidateCount }] = await withTenant(tenantId, async (tx) =>
    tx.select({ value: count() }).from(candidates).where(eq(candidates.isActive, true))
  )

  const [{ value: scoredCount }] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ value: count() })
      .from(scores)
      .where(and(eq(scores.scoreStatus, 'complete'), gte(scores.createdAt, sevenDaysAgo)))
  )

  const [{ value: packsCount }] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ value: count() })
      .from(interviewPacks)
      .where(eq(interviewPacks.generationStatus, 'complete'))
  )

  // ── Recent roles ─────────────────────────────────────────────────────────
  const recentRoles = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roles.id, title: roles.title, createdAt: roles.createdAt })
      .from(roles)
      .where(eq(roles.isActive, true))
      .orderBy(desc(roles.createdAt))
      .limit(5)
  )

  // ── Top candidates by overall score ──────────────────────────────────────
  const topCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        candidateId: candidates.id,
        firstName:   candidates.firstName,
        lastName:    candidates.lastName,
        overallScore: scores.overallScore,
        roleId:      roles.id,
        roleTitle:   roles.title,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .innerJoin(roles, eq(scores.roleId, roles.id))
      .where(eq(scores.scoreStatus, 'complete'))
      .orderBy(desc(scores.overallScore))
      .limit(5)
  )

  // ── Recent uploads ────────────────────────────────────────────────────────
  const recentUploads = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id:        candidates.id,
        firstName: candidates.firstName,
        lastName:  candidates.lastName,
        status:    candidates.status,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .where(eq(candidates.isActive, true))
      .orderBy(desc(candidates.createdAt))
      .limit(5)
  )

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-500 mt-1">
          Welcome back,{' '}
          <span className="font-medium text-zinc-300">{session?.user.name}</span>.
        </p>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1
                      sm:grid-cols-2
                      lg:grid-cols-4 gap-4 mb-10">
        {/* Active Roles */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500">Active Roles</span>
            <BriefcaseIcon className="h-4 w-4 text-violet-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{roleCount}</p>
        </div>

        {/* Total Candidates */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500">Total Candidates</span>
            <UsersIcon className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{candidateCount}</p>
        </div>

        {/* Scored This Week */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500">Scored This Week</span>
            <TrendingUpIcon className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{scoredCount}</p>
        </div>

        {/* Interview Packs Ready */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500">Interview Packs Ready</span>
            <BrainIcon className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{packsCount}</p>
        </div>
      </div>

      {/* ── Content grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1
                      lg:grid-cols-3 gap-6">

        {/* Recent Roles */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
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
            <p className="text-sm text-zinc-500 py-4 text-center">No active roles yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {recentRoles.map((role) => (
                <li key={role.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/roles/${role.id}`}
                    className="flex items-center justify-between group"
                  >
                    <span className="text-sm text-zinc-200 group-hover:text-white transition-colors truncate pr-2">
                      {role.title}
                    </span>
                    <time className="text-xs text-zinc-500 whitespace-nowrap">
                      {new Date(role.createdAt).toLocaleDateString()}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top Candidates */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              Top Candidates
            </h2>
            <Link
              href="/dashboard/candidates"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
            </Link>
          </div>

          {topCandidates.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No scored candidates yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {topCandidates.map((c) => (
                <li key={`${c.candidateId}-${c.roleId}`} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/candidates/${c.candidateId}`}
                    className="flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{c.roleTitle}</p>
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
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
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
            <p className="text-sm text-zinc-500 py-4 text-center">No candidates uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {recentUploads.map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/candidates/${c.id}`}
                    className="flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <time className="text-xs text-zinc-500">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </time>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_BADGE[c.status] ?? 'bg-zinc-700 text-zinc-300'}`}
                    >
                      {c.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
