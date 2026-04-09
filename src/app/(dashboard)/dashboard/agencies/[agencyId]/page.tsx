import { notFound } from 'next/navigation'
import { eq, and, desc, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { withTenant } from '@/db'
import { agencies, candidates } from '@/db/schema'
import { auth } from '@/lib/auth'
import { AgencyEditForm } from '@/components/agencies/agency-edit-form'
import { AgencyCandidatePanel } from '@/components/agencies/agency-candidate-panel'

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

  // Candidates with no agency (for assignment)
  const unassignedCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
      })
      .from(candidates)
      .where(and(isNull(candidates.agencyId), eq(candidates.tenantId, tenantId), eq(candidates.isActive, true)))
      .orderBy(candidates.firstName)
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
          <AgencyCandidatePanel
            agencyId={agencyId}
            agencyCandidates={agencyCandidates.map((c) => ({
              ...c,
              createdAt: c.createdAt.toISOString(),
            }))}
            unassignedCandidates={unassignedCandidates}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  )
}
