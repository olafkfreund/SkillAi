import { headers } from 'next/headers'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { PlusIcon, BuildingIcon } from 'lucide-react'
import { withTenant } from '@/db'
import { agencies } from '@/db/schema'
import { auth } from '@/lib/auth'

export const metadata = { title: 'Agencies — SkillAI' }

export default async function AgenciesPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const allAgencies = tenantId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({
            id: agencies.id,
            name: agencies.name,
            contactEmail: agencies.contactEmail,
            contactPhone: agencies.contactPhone,
            notes: agencies.notes,
            isActive: agencies.isActive,
            createdAt: agencies.createdAt,
          })
          .from(agencies)
          .where(eq(agencies.isActive, true))
          .orderBy(desc(agencies.createdAt))
      )
    : []

  const canCreate = session?.user.role !== 'viewer'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Agencies</h1>
          <p className="text-zinc-500 mt-1">
            {allAgencies.length} active {allAgencies.length !== 1 ? 'agencies' : 'agency'}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/dashboard/agencies/new"
            className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                       font-medium px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            New agency
          </Link>
        )}
      </div>

      {allAgencies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-zinc-700 bg-zinc-950 px-6 py-16 text-center">
          <BuildingIcon className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium">No agencies yet</p>
          {canCreate && (
            <p className="text-zinc-500 text-sm mt-1">
              <Link href="/dashboard/agencies/new" className="text-blue-400 hover:underline">
                Add your first agency
              </Link>{' '}
              to track recruitment sources.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {allAgencies.map((agency) => (
            <Link
              key={agency.id}
              href={`/dashboard/agencies/${agency.id}`}
              className="flex items-start justify-between rounded-xl bg-zinc-900 border border-zinc-700
                         px-6 py-5 hover:border-blue-500 hover:shadow-sm transition-all"
            >
              <div>
                <h2 className="font-semibold text-zinc-100">{agency.name}</h2>
                <div className="flex gap-4 mt-1">
                  {agency.contactEmail && (
                    <span className="text-sm text-zinc-500">{agency.contactEmail}</span>
                  )}
                  {agency.contactPhone && (
                    <span className="text-sm text-zinc-500">{agency.contactPhone}</span>
                  )}
                </div>
                {agency.notes && (
                  <p className="text-sm text-zinc-500 mt-1 line-clamp-1">{agency.notes}</p>
                )}
              </div>
              <time className="text-xs text-zinc-500 whitespace-nowrap ml-4 mt-0.5">
                {new Date(agency.createdAt).toLocaleDateString()}
              </time>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
