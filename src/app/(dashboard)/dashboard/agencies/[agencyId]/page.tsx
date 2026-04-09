import { notFound } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import Link from 'next/link'
import { withTenant } from '@/db'
import { agencies, candidates } from '@/db/schema'
import { auth } from '@/lib/auth'
import { AgencyEditForm } from '@/components/agencies/agency-edit-form'

export const metadata = { title: 'Agency — SkillAI' }

interface Props {
  params: Promise<{ agencyId: string }>
}

export default async function AgencyDetailPage({ params }: Props) {
  const { agencyId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [agency] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(agencies)
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
      .limit(1)
  )

  if (!agency) notFound()

  const agencyCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .where(and(eq(candidates.agencyId, agencyId), eq(candidates.tenantId, tenantId)))
      .orderBy(desc(candidates.createdAt))
  )

  const canEdit = session?.user.role !== 'viewer'

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/agencies" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to agencies
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-2">{agency.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details / Edit */}
        <div className="lg:col-span-1">
          {canEdit ? (
            <AgencyEditForm agency={agency} />
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 space-y-4">
              {agency.contactEmail && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Email</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{agency.contactEmail}</p>
                </div>
              )}
              {agency.contactPhone && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Phone</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{agency.contactPhone}</p>
                </div>
              )}
              {agency.notes && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap">{agency.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Candidates from this agency */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">
            Candidates ({agencyCandidates.length})
          </h2>
          {agencyCandidates.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 px-6 py-10 text-center">
              <p className="text-zinc-500 text-sm">No candidates from this agency yet.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {agencyCandidates.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/candidates/${c.id}`}
                  className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-700
                             px-5 py-3 hover:border-blue-500 hover:shadow-sm transition-all"
                >
                  <span className="text-sm font-medium text-zinc-100">
                    {c.firstName} {c.lastName}
                    {c.email && (
                      <span className="font-normal text-zinc-500 ml-2">{c.email}</span>
                    )}
                  </span>
                  <time className="text-xs text-zinc-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </time>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
