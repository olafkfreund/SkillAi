import { and, desc, eq, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import Link from 'next/link'
import { PlusIcon, BriefcaseIcon, SearchIcon } from 'lucide-react'
import { withTenant } from '@/db'
import { roles, customers } from '@/db/schema'
import { auth } from '@/lib/auth'
import { isRoleExpired } from '@/lib/roles/expiry'

export const metadata = { title: 'Roles — SkillAI' }

// Valid values for the ?expired= query param (undefined = 'all').
type ExpiryFilter = 'only' | 'exclude' | 'all'

function parseExpiryFilter(raw: string | undefined): ExpiryFilter {
  if (raw === 'only' || raw === 'exclude') return raw
  return 'all'
}

// Valid values for the ?archived= query param (undefined = 'exclude').
// 'exclude' = active roles only (default), 'only' = archived only, 'all' = both
type ArchivedFilter = 'only' | 'exclude' | 'all'

function parseArchivedFilter(raw: string | undefined): ArchivedFilter {
  if (raw === 'only' || raw === 'all') return raw
  return 'exclude'
}

interface PageProps {
  searchParams: Promise<{ q?: string; expired?: string; archived?: string }>
}

export default async function RolesPage({ searchParams }: PageProps) {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const { q, expired: expiredParam, archived: archivedParam } = await searchParams
  const trimmedQ = q?.trim() ?? ''
  const expiryFilter = parseExpiryFilter(expiredParam)
  const archivedFilter = parseArchivedFilter(archivedParam)

  // Today's date string for DB-level expiry comparisons (YYYY-MM-DD).
  const todayStr = new Date().toISOString().split('T')[0]

  const allRoles = tenantId
    ? await withTenant(tenantId, async (tx) => {
        const conditions = []

        // Archived filter — defaults to 'exclude' (active roles only).
        if (archivedFilter === 'exclude') {
          conditions.push(eq(roles.isActive, true))
        } else if (archivedFilter === 'only') {
          conditions.push(eq(roles.isActive, false))
        }
        // 'all' → no isActive filter applied

        if (trimmedQ) {
          conditions.push(
            or(
              ilike(roles.title, `%${trimmedQ}%`),
              ilike(roles.customerRoleId, `%${trimmedQ}%`)
            )!
          )
        }

        // Expiry filter — DEC-008: never auto-archive; just filter the view.
        if (expiryFilter === 'only') {
          // cutoffDate IS NOT NULL AND cutoffDate < today
          conditions.push(isNotNull(roles.cutoffDate))
          conditions.push(lt(roles.cutoffDate, sql`${todayStr}::date`))
        } else if (expiryFilter === 'exclude') {
          // cutoffDate IS NULL OR cutoffDate >= today
          conditions.push(
            or(
              isNull(roles.cutoffDate),
              sql`${roles.cutoffDate} >= ${todayStr}::date`
            )!
          )
        }

        return tx
          .select({
            id: roles.id,
            title: roles.title,
            description: roles.description,
            keySkills: roles.keySkills,
            topRequirements: roles.topRequirements,
            createdAt: roles.createdAt,
            cutoffDate: roles.cutoffDate,
            customerDayRate: roles.customerDayRate,
            rateCurrency: roles.rateCurrency,
            customerRoleId: roles.customerRoleId,
            customerRoleIdLabel: customers.roleIdLabel,
            isActive: roles.isActive,
          })
          .from(roles)
          .leftJoin(customers, eq(roles.customerId, customers.id))
          .where(and(...conditions))
          .orderBy(desc(roles.createdAt))
      })
    : []

  const canCreate = session?.user.role !== 'viewer'

  // Build chip href helpers — preserve the search query, swap the expired param.
  // When toggling the expired chip, preserve archived; when toggling archived,
  // preserve expired. 'archived: only' forces expired=all because mixing the
  // two filters tends to produce empty/confusing results.
  function expiredChipHref(nextExpired: 'all' | 'only' | 'exclude'): string {
    const params = new URLSearchParams()
    if (trimmedQ) params.set('q', trimmedQ)
    if (nextExpired !== 'all') params.set('expired', nextExpired)
    if (archivedFilter !== 'exclude') params.set('archived', archivedFilter)
    const qs = params.toString()
    return `/dashboard/roles${qs ? `?${qs}` : ''}`
  }

  function archivedChipHref(nextArchived: 'all' | 'only' | 'exclude'): string {
    const params = new URLSearchParams()
    if (trimmedQ) params.set('q', trimmedQ)
    if (expiryFilter !== 'all' && nextArchived !== 'only') params.set('expired', expiryFilter)
    if (nextArchived !== 'exclude') params.set('archived', nextArchived)
    const qs = params.toString()
    return `/dashboard/roles${qs ? `?${qs}` : ''}`
  }

  const countLabel = (() => {
    if (archivedFilter === 'only') {
      return `${allRoles.length} archived role${allRoles.length !== 1 ? 's' : ''}`
    }
    if (expiryFilter === 'only') {
      return `${allRoles.length} expired role${allRoles.length !== 1 ? 's' : ''}`
    }
    if (expiryFilter === 'exclude') {
      return `${allRoles.length} active role${allRoles.length !== 1 ? 's' : ''} (non-expired)`
    }
    if (archivedFilter === 'all') {
      return `${allRoles.length} role${allRoles.length !== 1 ? 's' : ''} (active + archived)`
    }
    return `${allRoles.length} active role${allRoles.length !== 1 ? 's' : ''}`
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Roles</h1>
          <p className="text-[var(--color-fg-subtle)] mt-1">{countLabel}</p>
        </div>
        {canCreate && (
          <Link
            href="/dashboard/roles/new"
            className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                       font-medium px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            New role
          </Link>
        )}
      </div>

      <form method="get" className="mb-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-fg-subtle)]" />
          <input
            type="text"
            name="q"
            defaultValue={trimmedQ}
            placeholder="Search by role title or customer role ID…"
            className="w-full rounded-md bg-[var(--color-bg-input)] border border-[var(--color-border)]
                       text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]
                       pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>

      {/* Filter chips — combined expiry + archived */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-[var(--color-fg-subtle)]">Show:</span>
        <Link
          href={expiredChipHref('all')}
          className={[
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            expiryFilter === 'all' && archivedFilter === 'exclude'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-blue-500',
          ].join(' ')}
        >
          All
        </Link>
        <Link
          href={expiredChipHref('exclude')}
          className={[
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            expiryFilter === 'exclude' && archivedFilter === 'exclude'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-blue-500',
          ].join(' ')}
        >
          Active only
        </Link>
        <Link
          href={expiredChipHref('only')}
          className={[
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            expiryFilter === 'only' && archivedFilter === 'exclude'
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-red-500',
          ].join(' ')}
        >
          Expired
        </Link>
        <Link
          href={archivedChipHref('only')}
          className={[
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            archivedFilter === 'only'
              ? 'bg-amber-600 border-amber-500 text-white'
              : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-amber-500',
          ].join(' ')}
        >
          Archived
        </Link>
      </div>

      {trimmedQ && (
        <p className="text-xs text-[var(--color-fg-subtle)] mb-3">
          Showing {allRoles.length} result{allRoles.length !== 1 ? 's' : ''} for &ldquo;{trimmedQ}&rdquo;
        </p>
      )}

      {allRoles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-16 text-center">
          <BriefcaseIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-3" />
          <p className="text-[var(--color-fg-muted)] font-medium">
            {archivedFilter === 'only'
              ? 'No archived roles'
              : expiryFilter === 'only'
                ? 'No expired roles'
                : 'No roles yet'}
          </p>
          {canCreate && archivedFilter !== 'only' && expiryFilter !== 'only' && (
            <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
              <Link href="/dashboard/roles/new" className="text-blue-400 hover:underline">
                Create your first role
              </Link>{' '}
              to start ranking candidates.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {allRoles.map((role) => {
            const expired = isRoleExpired(role.cutoffDate)
            return (
              <Link
                key={role.id}
                href={`/dashboard/roles/${role.id}`}
                className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-6 py-5
                           hover:border-blue-500 hover:shadow-sm transition-all block"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-[var(--color-fg)]">{role.title}</h2>

                    {/* Archived badge — visible when the archived-only or all filter surfaces inactive roles */}
                    {!role.isActive && (
                      <span className="inline-flex items-center rounded-full
                                       bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800
                                       text-amber-700 dark:text-amber-300 text-xs font-semibold px-2 py-0.5">
                        ARCHIVED
                      </span>
                    )}

                    {/* Expiry / countdown badge — uses isRoleExpired from src/lib/roles/expiry.ts */}
                    {expired ? (
                      <span className="inline-flex items-center rounded-full
                                       bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800
                                       text-red-700 dark:text-red-300 text-xs font-semibold px-2 py-0.5">
                        EXPIRED
                      </span>
                    ) : role.cutoffDate ? (() => {
                      const target = new Date(role.cutoffDate)
                      target.setHours(0, 0, 0, 0)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      if (days <= 7) {
                        return (
                          <span className="inline-flex items-center rounded-full
                                           bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800
                                           text-amber-700 dark:text-amber-300 text-xs font-medium px-2 py-0.5">
                            Cut-off in {days} day{days !== 1 ? 's' : ''}
                          </span>
                        )
                      }
                      return null
                    })() : null}

                    {role.customerDayRate && (
                      <span className="inline-flex items-center rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-medium px-2 py-0.5">
                        {role.rateCurrency ?? ''} {Number(role.customerDayRate).toFixed(0)}/day
                      </span>
                    )}
                    {role.customerRoleId && (
                      <span
                        className="inline-flex items-center rounded-full bg-slate-800 border border-slate-700
                                   text-slate-300 text-xs font-medium px-2 py-0.5"
                        title={`${role.customerRoleIdLabel ?? 'Customer Role ID'}: ${role.customerRoleId}`}
                      >
                        {role.customerRoleIdLabel ?? 'Customer Role ID'}: {role.customerRoleId}
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-[var(--color-fg-subtle)] whitespace-nowrap ml-4 mt-0.5 flex-shrink-0">
                    {new Date(role.createdAt).toLocaleDateString('en-GB')}
                  </time>
                </div>
                <p className="text-sm text-[var(--color-fg-subtle)] mt-0.5 line-clamp-2">{role.description}</p>
                {(role.keySkills.length > 0 || role.topRequirements.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {role.keySkills.slice(0, 6).map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center rounded-full bg-blue-950 border border-blue-800
                                   text-blue-300 text-xs px-2.5 py-0.5"
                      >
                        {s}
                      </span>
                    ))}
                    {role.topRequirements.slice(0, 3).map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center rounded-full bg-amber-950 border border-amber-800
                                   text-amber-300 text-xs px-2.5 py-0.5"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
