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
            createdAt: roles.createdAt,
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
              className="flex items-start justify-between rounded-xl bg-zinc-900 border border-zinc-700
                         px-6 py-5 hover:border-blue-500 hover:shadow-sm transition-all"
            >
              <div>
                <h2 className="font-semibold text-zinc-100">{role.title}</h2>
                <p className="text-sm text-zinc-500 mt-0.5 line-clamp-2">{role.description}</p>
              </div>
              <time className="text-xs text-zinc-500 whitespace-nowrap ml-4 mt-0.5">
                {new Date(role.createdAt).toLocaleDateString()}
              </time>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
