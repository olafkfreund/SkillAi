import { desc, eq, and, ilike, or, count, sql } from 'drizzle-orm'
import Link from 'next/link'
import { UsersIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, agencies } from '@/db/schema'
import { CandidateFilters } from '@/components/candidates/candidate-filters'
import { SemanticSearchToggle } from '@/components/candidates/semantic-search-toggle'
import { ComparisonCheckbox } from '@/components/candidates/comparison-checkbox'
import { ComparisonTray } from '@/components/candidates/comparison-tray'
import type { CandidateStatus } from '@/db/schema/candidates'

export const metadata = { title: 'Candidates — SkillAI' }

const PAGE_SIZE = 25

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-zinc-700 text-zinc-300',
  shortlisted: 'bg-blue-900/50 text-blue-300',
  interviewing: 'bg-purple-900/50 text-purple-300',
  offered: 'bg-amber-900/50 text-amber-300',
  hired: 'bg-green-900/50 text-green-300',
  rejected: 'bg-red-900/50 text-red-300',
}

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    agencyId?: string
    page?: string
  }>
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const { q, status, agencyId, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  // Validate status is a known enum value
  const validStatuses: CandidateStatus[] = [
    'new', 'shortlisted', 'interviewing', 'offered', 'rejected', 'hired',
  ]
  const statusFilter = status && validStatuses.includes(status as CandidateStatus)
    ? (status as CandidateStatus)
    : undefined

  // Build where conditions
  const buildWhere = () => {
    const conditions = [eq(candidates.isActive, true)]

    if (q?.trim()) {
      conditions.push(
        or(
          ilike(candidates.firstName, `%${q.trim()}%`),
          ilike(candidates.lastName, `%${q.trim()}%`),
          // email is nullable — use sql COALESCE for safety
          sql`LOWER(COALESCE(${candidates.email}, '')) LIKE LOWER(${'%' + q.trim() + '%'})`
        )!
      )
    }

    if (statusFilter) {
      conditions.push(eq(candidates.status, statusFilter))
    }

    if (agencyId?.trim()) {
      conditions.push(eq(candidates.agencyId, agencyId.trim()))
    }

    return and(...conditions)
  }

  const result = tenantId
    ? await withTenant(tenantId, async (tx) => {
        const where = buildWhere()

        const [rows, [countRow], agencyRows] = await Promise.all([
          tx
            .select({
              id: candidates.id,
              firstName: candidates.firstName,
              lastName: candidates.lastName,
              email: candidates.email,
              status: candidates.status,
              createdAt: candidates.createdAt,
              agencyName: agencies.name,
            })
            .from(candidates)
            .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
            .where(where)
            .orderBy(desc(candidates.createdAt))
            .limit(PAGE_SIZE)
            .offset(offset),

          tx
            .select({ total: count() })
            .from(candidates)
            .where(where),

          tx
            .select({ id: agencies.id, name: agencies.name })
            .from(agencies)
            .where(eq(agencies.isActive, true))
            .orderBy(agencies.name),
        ])

        return { rows, total: countRow?.total ?? 0, agencyRows }
      })
    : null

  const allCandidates = result?.rows ?? []
  const totalCount = result?.total ?? 0
  const agencyList = result?.agencyRows ?? []

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const rangeFrom = totalCount === 0 ? 0 : offset + 1
  const rangeTo = Math.min(offset + PAGE_SIZE, totalCount)

  const currentFilters = { q, status, agencyId }

  // Build pagination URL helper
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status) params.set('status', status)
    if (agencyId) params.set('agencyId', agencyId)
    params.set('page', String(p))
    return `?${params.toString()}`
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Candidates</h1>
          <p className="text-zinc-500 mt-1">
            {totalCount} candidate{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Semantic search toggle */}
      <div className="mb-4">
        <SemanticSearchToggle />
      </div>

      {/* Filter bar */}
      <div className="mb-5">
        <CandidateFilters agencies={agencyList} currentFilters={currentFilters} />
      </div>

      {/* Result count */}
      {totalCount > 0 && (
        <p className="text-xs text-zinc-500 mb-3 tabular-nums">
          Showing {rangeFrom}–{rangeTo} of {totalCount} candidate{totalCount !== 1 ? 's' : ''}
        </p>
      )}

      {/* Empty state */}
      {allCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-zinc-700 bg-zinc-950 px-6 py-16 text-center">
          <UsersIcon className="h-10 w-10 text-zinc-600 mb-3" />
          {totalCount === 0 && !q && !status && !agencyId ? (
            <>
              <p className="text-zinc-400 font-medium">No candidates yet</p>
              <p className="text-zinc-500 text-sm mt-1">
                Upload CVs from a{' '}
                <Link href="/dashboard/roles" className="text-blue-400 hover:underline">
                  role page
                </Link>{' '}
                to get started.
              </p>
            </>
          ) : (
            <>
              <p className="text-zinc-400 font-medium">No candidates match your filters</p>
              <p className="text-zinc-500 text-sm mt-1">
                Try adjusting or{' '}
                <Link href="/dashboard/candidates" className="text-blue-400 hover:underline">
                  clearing your filters
                </Link>
                .
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800">
                  {/* Compare checkbox column */}
                  <th className="w-10 px-4 py-3" aria-label="Select for comparison" />
                  <th className="text-left px-5 py-3 font-medium text-zinc-400">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-zinc-400">Email</th>
                  <th className="text-left px-5 py-3 font-medium text-zinc-400 hidden sm:table-cell">
                    Agency
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-zinc-400 hidden md:table-cell">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-zinc-400 hidden lg:table-cell">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody>
                {allCandidates.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-zinc-700 hover:bg-zinc-800 transition-colors last:border-0"
                  >
                    {/* Comparison checkbox */}
                    <td className="px-4 py-3">
                      <ComparisonCheckbox
                        candidateId={c.id}
                        candidateName={`${c.firstName} ${c.lastName}`}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/candidates/${c.id}`}
                        className="font-medium text-zinc-100 hover:text-blue-400 transition-colors"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 truncate max-w-[200px]">
                      {c.email ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 hidden sm:table-cell">
                      {c.agencyName ?? '—'}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize
                                    ${STATUS_BADGE[c.status] ?? 'bg-zinc-700 text-zinc-300'}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 hidden lg:table-cell tabular-nums">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 text-sm">
              <span className="text-zinc-500 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildPageUrl(page - 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700
                               bg-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100
                               transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    Prev
                  </Link>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/50
                               bg-zinc-800/50 px-3 py-1.5 text-zinc-600 cursor-not-allowed"
                    aria-disabled="true"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    Prev
                  </span>
                )}

                {page < totalPages ? (
                  <Link
                    href={buildPageUrl(page + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700
                               bg-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100
                               transition-colors"
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/50
                               bg-zinc-800/50 px-3 py-1.5 text-zinc-600 cursor-not-allowed"
                    aria-disabled="true"
                  >
                    Next
                    <ChevronRightIcon className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Comparison tray — fixed to bottom, only visible when candidates are selected */}
      <ComparisonTray />
    </div>
  )
}
