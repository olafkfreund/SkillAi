import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { PlusIcon, BuildingIcon, LockIcon, HomeIcon } from 'lucide-react'
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
            isInternal: agencies.isInternal,
            isSystem: agencies.isSystem,
            logoPath: agencies.logoPath,
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
          {allAgencies.map((agency) => {
            const isSystem = agency.isSystem
            const isInternal = agency.isInternal
            return (
              <Link
                key={agency.id}
                href={`/dashboard/agencies/${agency.id}`}
                className={`flex items-start justify-between rounded-xl border px-6 py-5
                            hover:shadow-sm transition-all
                            ${isInternal
                              ? 'bg-blue-950/30 border-blue-800 hover:border-blue-600'
                              : 'bg-zinc-900 border-zinc-700 hover:border-blue-500'}`}
              >
                <div className="flex items-start gap-3">
                  {/* 32px logo or initials avatar */}
                  {agency.logoPath ? (
                    <img
                      src={`/api/agencies/${agency.id}/logo`}
                      alt=""
                      width={32}
                      height={32}
                      className="rounded-full border border-zinc-700 bg-zinc-800 object-contain shrink-0 mt-0.5"
                      style={{ width: 32, height: 32 }}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400
                                 text-xs font-semibold shrink-0 mt-0.5"
                      style={{ width: 32, height: 32 }}
                      aria-hidden="true"
                    >
                      {agency.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-zinc-100">
                    {isInternal && <HomeIcon className="h-4 w-4 text-blue-400" />}
                    {agency.name}
                    {isSystem && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-800
                                   text-zinc-300 text-xs font-medium px-2 py-0.5"
                        title="System agency — managed by SkillAI"
                      >
                        <LockIcon className="h-3 w-3" />
                        System
                      </span>
                    )}
                  </h2>
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
                </div>
                <time className="text-xs text-zinc-500 whitespace-nowrap ml-4 mt-0.5">
                  {new Date(agency.createdAt).toLocaleDateString()}
                </time>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
