import { desc, eq, and, ilike, or, count, sql, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { UsersIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, agencies } from '@/db/schema'
import { CandidateFilters } from '@/components/candidates/candidate-filters'
import { SemanticSearchToggle } from '@/components/candidates/semantic-search-toggle'
import { SelectableCandidateList } from '@/components/candidates/selectable-candidate-list'
import { ComparisonTray } from '@/components/candidates/comparison-tray'
import type { CandidateStatus, AvailabilityStatus } from '@/db/schema/candidates'

export const metadata = { title: 'Candidates — SkillAI' }

const PAGE_SIZE = 25

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    agencyId?: string
    availability?: string
    page?: string
    missingCv?: string
  }>
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const { q, status, agencyId, availability, page: pageParam, missingCv: missingCvParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE
  const missingCvFilter = missingCvParam === '1'

  // Validate status is a known enum value
  const validStatuses: CandidateStatus[] = [
    'new', 'shortlisted', 'interviewing', 'offered', 'rejected', 'rejected_by_customer', 'hired',
  ]
  const statusFilter = status && validStatuses.includes(status as CandidateStatus)
    ? (status as CandidateStatus)
    : undefined

  const validAvailability: AvailabilityStatus[] = ['available', 'on_project', 'unavailable']
  const availabilityFilter =
    availability && validAvailability.includes(availability as AvailabilityStatus)
      ? (availability as AvailabilityStatus)
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

    if (availabilityFilter) {
      conditions.push(eq(candidates.availabilityStatus, availabilityFilter))
    }

    if (missingCvFilter) {
      conditions.push(isNull(candidates.filePath))
    }

    return and(...conditions)
  }

  const result = tenantId
    ? await withTenant(tenantId, async (tx) => {
        const where = buildWhere()

        const [rows, [countRow], agencyRows, [benchRow]] = await Promise.all([
          tx
            .select({
              id: candidates.id,
              firstName: candidates.firstName,
              lastName: candidates.lastName,
              email: candidates.email,
              filePath: candidates.filePath,
              status: candidates.status,
              createdAt: candidates.createdAt,
              agencyId: candidates.agencyId,
              agencyName: agencies.name,
              agencyIsInternal: agencies.isInternal,
              agencyLogoPath: agencies.logoPath,
              candidateRate: candidates.candidateRate,
              customerRate: candidates.customerRate,
              rateCurrency: candidates.rateCurrency,
              availabilityStatus: candidates.availabilityStatus,
              availableFrom: candidates.availableFrom,
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
            .select({ id: agencies.id, name: agencies.name, isInternal: agencies.isInternal })
            .from(agencies)
            .where(eq(agencies.isActive, true))
            .orderBy(agencies.name),

          // Bench count: internal agency + available candidates
          tx
            .select({
              agencyId: agencies.id,
              total: count(candidates.id),
            })
            .from(agencies)
            .leftJoin(
              candidates,
              and(
                eq(candidates.agencyId, agencies.id),
                eq(candidates.isActive, true),
                eq(candidates.availabilityStatus, 'available')
              )
            )
            .where(and(eq(agencies.tenantId, tenantId), eq(agencies.isInternal, true)))
            .groupBy(agencies.id),
        ])

        return {
          rows,
          total: countRow?.total ?? 0,
          agencyRows,
          bench: benchRow ?? null,
        }
      })
    : null

  const allCandidates = result?.rows ?? []
  const totalCount = result?.total ?? 0
  const agencyList = result?.agencyRows ?? []
  const internalAgencyId = result?.bench?.agencyId ?? null
  const benchCount = result?.bench?.total ?? 0

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const rangeFrom = totalCount === 0 ? 0 : offset + 1
  const rangeTo = Math.min(offset + PAGE_SIZE, totalCount)

  const currentFilters = { q, status, agencyId, availability, missingCv: missingCvFilter }

  // Build pagination URL helper
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status) params.set('status', status)
    if (agencyId) params.set('agencyId', agencyId)
    if (availability) params.set('availability', availability)
    if (missingCvFilter) params.set('missingCv', '1')
    params.set('page', String(p))
    return `?${params.toString()}`
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Candidates</h1>
          <p className="text-[var(--color-fg-subtle)] mt-1">
            {totalCount} candidate{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Semantic search toggle */}
      <div className="mb-4">
        <SemanticSearchToggle />
      </div>

      {/* Quick filter: Internal bench */}
      {internalAgencyId && (
        <div className="mb-4 flex items-center gap-2">
          <Link
            href={`/dashboard/candidates?availability=available&agencyId=${internalAgencyId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950 text-blue-300
                       text-xs font-medium px-3 py-1 hover:bg-blue-900 transition-colors"
          >
            <HomeIcon className="h-3 w-3" />
            Bench ({benchCount})
          </Link>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-5">
        <CandidateFilters agencies={agencyList} currentFilters={currentFilters} />
      </div>

      {/* Result count */}
      {totalCount > 0 && (
        <p className="text-xs text-[var(--color-fg-subtle)] mb-3 tabular-nums">
          Showing {rangeFrom}–{rangeTo} of {totalCount} candidate{totalCount !== 1 ? 's' : ''}
        </p>
      )}

      {/* Empty state */}
      {allCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-16 text-center">
          <UsersIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-3" />
          {totalCount === 0 && !q && !status && !agencyId && !availability && !missingCvFilter ? (
            <>
              <p className="text-[var(--color-fg-muted)] font-medium">No candidates yet</p>
              <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
                Upload CVs from a{' '}
                <Link href="/dashboard/roles" className="text-blue-400 hover:underline">
                  role page
                </Link>{' '}
                to get started.
              </p>
            </>
          ) : (
            <>
              <p className="text-[var(--color-fg-muted)] font-medium">No candidates match your filters</p>
              <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
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
          {/* Serialize dates to strings for the client component */}
          <SelectableCandidateList
            candidates={allCandidates.map((c) => ({
              ...c,
              filePath: c.filePath ?? null,
              createdAt: c.createdAt instanceof Date
                ? c.createdAt.toISOString()
                : String(c.createdAt),
              isInternalAgency: Boolean(c.agencyIsInternal),
              agencyId: c.agencyId ?? null,
              agencyLogoPath: c.agencyLogoPath ?? null,
            }))}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 text-sm">
              <span className="text-[var(--color-fg-subtle)] tabular-nums">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildPageUrl(page - 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]
                               bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]
                               transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    Prev
                  </Link>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]
                               bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[var(--color-fg-subtle)] cursor-not-allowed opacity-50"
                    aria-disabled="true"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    Prev
                  </span>
                )}

                {page < totalPages ? (
                  <Link
                    href={buildPageUrl(page + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]
                               bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]
                               transition-colors"
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]
                               bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[var(--color-fg-subtle)] cursor-not-allowed opacity-50"
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
