import { headers } from 'next/headers'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import Link from 'next/link'
import { PlusIcon, BriefcaseIcon, SearchIcon } from 'lucide-react'
import { withTenant } from '@/db'
import { roles, customers } from '@/db/schema'
import { auth } from '@/lib/auth'

export const metadata = { title: 'Roles — SkillAI' }

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function RolesPage({ searchParams }: PageProps) {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const { q } = await searchParams
  const trimmedQ = q?.trim() ?? ''

  const allRoles = tenantId
    ? await withTenant(tenantId, async (tx) => {
        const conditions = [eq(roles.isActive, true)]
        if (trimmedQ) {
          conditions.push(
            or(
              ilike(roles.title, `%${trimmedQ}%`),
              ilike(roles.customerRoleId, `%${trimmedQ}%`)
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
          })
          .from(roles)
          .leftJoin(customers, eq(roles.customerId, customers.id))
          .where(and(...conditions))
          .orderBy(desc(roles.createdAt))
      })
    : []

  const canCreate = session?.user.role !== 'viewer'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Roles</h1>
          <p className="text-[var(--color-fg-subtle)] mt-1">{allRoles.length} active role{allRoles.length !== 1 ? 's' : ''}</p>
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
      {trimmedQ && (
        <p className="text-xs text-[var(--color-fg-subtle)] mb-3">
          Showing {allRoles.length} result{allRoles.length !== 1 ? 's' : ''} for &ldquo;{trimmedQ}&rdquo;
        </p>
      )}

      {allRoles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-16 text-center">
          <BriefcaseIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-3" />
          <p className="text-[var(--color-fg-muted)] font-medium">No roles yet</p>
          {canCreate && (
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
          {allRoles.map((role) => (
            <Link
              key={role.id}
              href={`/dashboard/roles/${role.id}`}
              className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-6 py-5
                         hover:border-blue-500 hover:shadow-sm transition-all block"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-[var(--color-fg)]">{role.title}</h2>
                  {(() => {
                    if (!role.cutoffDate) return null
                    const target = new Date(role.cutoffDate)
                    target.setHours(0, 0, 0, 0)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    if (days < 0) {
                      return (
                        <span className="inline-flex items-center rounded-full bg-red-950 border border-red-800 text-red-300 text-xs font-semibold px-2 py-0.5">
                          EXPIRED
                        </span>
                      )
                    }
                    if (days <= 7) {
                      return (
                        <span className="inline-flex items-center rounded-full bg-amber-950 border border-amber-800 text-amber-300 text-xs font-medium px-2 py-0.5">
                          Cut-off in {days} day{days !== 1 ? 's' : ''}
                        </span>
                      )
                    }
                    return null
                  })()}
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
          ))}
        </div>
      )}
    </div>
  )
}
