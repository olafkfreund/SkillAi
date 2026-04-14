import { headers } from 'next/headers'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { PlusIcon, BriefcaseIcon } from 'lucide-react'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { auth } from '@/lib/auth'

export const metadata = { title: 'Roles — SkillAI' }

export default async function RolesPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const allRoles = tenantId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({
            id: roles.id,
            title: roles.title,
            description: roles.description,
            keySkills: roles.keySkills,
            topRequirements: roles.topRequirements,
            createdAt: roles.createdAt,
            cutoffDate: roles.cutoffDate,
          })
          .from(roles)
          .where(eq(roles.isActive, true))
          .orderBy(desc(roles.createdAt))
      )
    : []

  const canCreate = session?.user.role !== 'viewer'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Roles</h1>
          <p className="text-zinc-500 mt-1">{allRoles.length} active role{allRoles.length !== 1 ? 's' : ''}</p>
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

      {allRoles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-zinc-700 bg-zinc-950 px-6 py-16 text-center">
          <BriefcaseIcon className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium">No roles yet</p>
          {canCreate && (
            <p className="text-zinc-500 text-sm mt-1">
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
              className="rounded-xl bg-zinc-900 border border-zinc-700 px-6 py-5
                         hover:border-blue-500 hover:shadow-sm transition-all block"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-zinc-100">{role.title}</h2>
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
                </div>
                <time className="text-xs text-zinc-500 whitespace-nowrap ml-4 mt-0.5 flex-shrink-0">
                  {new Date(role.createdAt).toLocaleDateString()}
                </time>
              </div>
              <p className="text-sm text-zinc-500 mt-0.5 line-clamp-2">{role.description}</p>
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
