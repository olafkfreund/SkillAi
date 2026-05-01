import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BriefcaseIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/auth/require-role'
import { withTenant } from '@/db'
import { roles, customers, agencies } from '@/db/schema'
import {
  getAllSubmissionsForTenant,
  type SubmissionWithDetails,
} from '@/actions/role-submissions'
import { SubmissionFilters } from '@/components/submissions/submission-filters'
import { SubmissionStatusPill } from '@/components/roles/submission-status-pill'
import { SubmissionCard } from '@/components/submissions/submission-card'
import type { SubmissionStatus } from '@/db/schema/role-submissions'

// Agent A extends SubmissionWithDetails with roleTitle and customerName for the
// tenant-wide loader. We declare the extended shape here so the page is
// self-documenting about what it expects.
type SubmissionRow = SubmissionWithDetails & {
  roleTitle: string
  customerName: string | null
}

export const metadata = { title: 'Submissions — SkillAI' }

const PAGE_SIZE = 25

const VALID_STATUSES: SubmissionStatus[] = [
  'submitted',
  'interview_scheduled',
  'interview_done',
  'feedback_pending',
  'hired',
  'rejected',
  'withdrawn',
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Inline timeAgo helper — mirrors the pattern in awaiting-customer-feedback-widget.tsx
function timeAgo(date: Date): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    roleId?: string
    customerId?: string
    agencyId?: string
    q?: string
    dateFrom?: string
    dateTo?: string
    sort?: string
    page?: string
  }>
}

export default async function SubmissionsPage({ searchParams }: PageProps) {
  const session = await auth()

  // Recruiter + admin only — managers redirect to dashboard
  if (!session?.user) redirect('/login')
  if (!hasRole(session.user.role, 'recruiter')) redirect('/dashboard')

  const tenantId = session.user.tenantId

  const {
    status: statusParam,
    roleId: roleIdParam,
    customerId: customerIdParam,
    agencyId: agencyIdParam,
    q,
    dateFrom: dateFromParam,
    dateTo: dateToParam,
    sort: sortParam,
    page: pageParam,
  } = await searchParams

  // Parse + validate status — single value for v1
  const statusFilter =
    statusParam && VALID_STATUSES.includes(statusParam as SubmissionStatus)
      ? (statusParam as SubmissionStatus)
      : undefined

  // Validate UUID params — ignore if invalid
  const roleIdFilter =
    roleIdParam && UUID_RE.test(roleIdParam) ? roleIdParam : undefined
  const customerIdFilter =
    customerIdParam && UUID_RE.test(customerIdParam) ? customerIdParam : undefined
  const agencyIdFilter =
    agencyIdParam && UUID_RE.test(agencyIdParam) ? agencyIdParam : undefined

  // Parse date params — YYYY-MM-DD; clamp to year >= 2020
  const parseDateParam = (raw: string | undefined): Date | undefined => {
    if (!raw) return undefined
    const d = new Date(raw)
    if (isNaN(d.getTime())) return undefined
    if (d.getFullYear() < 2020) return undefined
    return d
  }
  const dateFrom = parseDateParam(dateFromParam)
  const dateTo = parseDateParam(dateToParam)

  // Parse sort
  const validSorts = ['sentAt', 'statusUpdatedAt'] as const
  const validDirs = ['asc', 'desc'] as const
  type SortBy = (typeof validSorts)[number]
  type SortDir = (typeof validDirs)[number]

  let sortBy: SortBy = 'sentAt'
  let sortDir: SortDir = 'desc'

  if (sortParam) {
    const [rawSortBy, rawSortDir] = sortParam.split('-')
    if (validSorts.includes(rawSortBy as SortBy)) sortBy = rawSortBy as SortBy
    if (validDirs.includes(rawSortDir as SortDir)) sortDir = rawSortDir as SortDir
  }

  // Pagination
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  // Fetch submissions + filter dropdown options in parallel
  const [submissionsResult, filterOptions] = await Promise.all([
    getAllSubmissionsForTenant({
      status: statusFilter ? [statusFilter] : undefined,
      roleId: roleIdFilter,
      customerId: customerIdFilter,
      agencyId: agencyIdFilter,
      q: q?.trim() || undefined,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    withTenant(tenantId, async (tx) => {
      const [roleRows, customerRows, agencyRows] = await Promise.all([
        tx
          .select({ id: roles.id, title: roles.title })
          .from(roles)
          .where(eq(roles.isActive, true))
          .orderBy(roles.title),
        tx
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(eq(customers.isActive, true))
          .orderBy(customers.name),
        tx
          .select({ id: agencies.id, name: agencies.name })
          .from(agencies)
          .where(eq(agencies.isActive, true))
          .orderBy(agencies.name),
      ])
      return { roleRows, customerRows, agencyRows }
    }),
  ])

  // Cast to the extended row shape Agent A exports (includes roleTitle + customerName)
  const allSubmissions = submissionsResult.rows as SubmissionRow[]
  const totalCount = submissionsResult.totalCount

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const rangeFrom = totalCount === 0 ? 0 : offset + 1
  const rangeTo = Math.min(offset + PAGE_SIZE, totalCount)

  const hasFilters =
    !!statusFilter ||
    !!roleIdFilter ||
    !!customerIdFilter ||
    !!agencyIdFilter ||
    !!q?.trim() ||
    !!dateFrom ||
    !!dateTo

  // Build pagination URL helper — preserves all current filters
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (statusFilter) params.set('status', statusFilter)
    if (roleIdFilter) params.set('roleId', roleIdFilter)
    if (customerIdFilter) params.set('customerId', customerIdFilter)
    if (agencyIdFilter) params.set('agencyId', agencyIdFilter)
    if (dateFromParam) params.set('dateFrom', dateFromParam)
    if (dateToParam) params.set('dateTo', dateToParam)
    if (sortParam) params.set('sort', sortParam)
    params.set('page', String(p))
    return `?${params.toString()}`
  }

  // Derive the compound sort value for the filter UI
  const currentSort = `${sortBy}-${sortDir}`

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Submissions</h1>
          <p className="text-[var(--color-fg-subtle)] mt-1">
            {totalCount} submission{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-5">
        <SubmissionFilters
          initialStatus={statusFilter ?? ''}
          initialRoleId={roleIdFilter ?? ''}
          initialCustomerId={customerIdFilter ?? ''}
          initialAgencyId={agencyIdFilter ?? ''}
          initialQ={q ?? ''}
          initialDateFrom={dateFromParam ?? ''}
          initialDateTo={dateToParam ?? ''}
          initialSort={currentSort}
          roleOptions={filterOptions.roleRows}
          customerOptions={filterOptions.customerRows}
          agencyOptions={filterOptions.agencyRows}
        />
      </div>

      {/* Result count */}
      {totalCount > 0 && (
        <p className="text-xs text-[var(--color-fg-subtle)] mb-3 tabular-nums">
          Showing {rangeFrom}–{rangeTo} of {totalCount} submission{totalCount !== 1 ? 's' : ''}
        </p>
      )}

      {/* Empty state */}
      {allSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-16 text-center">
          <BriefcaseIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-3" />
          {hasFilters ? (
            <>
              <p className="text-[var(--color-fg-muted)] font-medium">No submissions match your filters</p>
              <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
                Try adjusting or{' '}
                <Link href="/dashboard/submissions" className="text-blue-400 hover:underline">
                  clearing your filters
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <p className="text-[var(--color-fg-muted)] font-medium">No submissions yet</p>
              <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
                Submit candidates to customers from a{' '}
                <Link href="/dashboard/roles" className="text-blue-400 hover:underline">
                  role page
                </Link>{' '}
                to get started.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list — hidden md:+ */}
          <div className="md:hidden">
            {allSubmissions.map((sub) => (
              <SubmissionCard
                key={sub.id}
                submission={sub}
                timeAgo={timeAgo}
              />
            ))}
          </div>

          {/* Desktop table — hidden below md */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Candidate
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Role
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Sent
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Last update
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {allSubmissions.map((sub) => {
                  const agencyId = sub.candidate.agencyId
                  const agencyLogoPath = sub.candidate.agencyLogoPath
                  const agencyName = sub.candidate.agencyName
                  const initials = (
                    (sub.candidate.firstName[0] ?? '') +
                    (sub.candidate.lastName[0] ?? '')
                  ).toUpperCase()

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-[var(--color-bg-input)]/50 transition-colors"
                    >
                      {/* Candidate */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {/* Agency logo / initials fallback — 20px per codebase convention */}
                          {agencyId && agencyLogoPath ? (
                            <img
                              src={`/api/agencies/${agencyId}/logo`}
                              alt={agencyName ?? ''}
                              width={20}
                              height={20}
                              className="rounded-full bg-[var(--color-bg-input)] object-contain shrink-0"
                              style={{ width: 20, height: 20 }}
                            />
                          ) : (
                            <div
                              className="flex items-center justify-center rounded-full bg-[var(--color-bg-input)]
                                         text-[var(--color-fg-muted)] text-[10px] font-semibold shrink-0"
                              style={{ width: 20, height: 20 }}
                              aria-hidden="true"
                            >
                              {initials}
                            </div>
                          )}
                          <span className="font-medium text-[var(--color-fg)]">
                            {sub.candidate.firstName} {sub.candidate.lastName}
                          </span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <Link
                          href={`/dashboard/roles/${sub.roleId}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {sub.roleTitle}
                        </Link>
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-4 text-[var(--color-fg-muted)]">
                        {sub.customerName ?? (
                          <span className="text-[var(--color-fg-subtle)]">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <SubmissionStatusPill status={sub.status} />
                      </td>

                      {/* Sent */}
                      <td className="px-5 py-4 text-[var(--color-fg-muted)] whitespace-nowrap tabular-nums">
                        {timeAgo(sub.sentAt)}
                      </td>

                      {/* Last update */}
                      <td className="px-5 py-4 text-[var(--color-fg-muted)] whitespace-nowrap tabular-nums">
                        {timeAgo(sub.statusUpdatedAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/dashboard/roles/${sub.roleId}`}
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                        >
                          Open role
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

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
    </div>
  )
}
