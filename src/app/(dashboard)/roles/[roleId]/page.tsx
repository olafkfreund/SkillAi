import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { ArrowLeftIcon, UsersIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, scores, candidates } from '@/db/schema'

type Props = { params: Promise<{ roleId: string }> }

export default async function RoleDetailPage({ params }: Props) {
  const { roleId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId))).limit(1)
  )
  if (!role) notFound()

  // Fetch scored candidates for this role
  const scoredCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        scoreId: scores.id,
        overallScore: scores.overallScore,
        scoreStatus: scores.scoreStatus,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        candidateId: candidates.id,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(eq(scores.roleId, roleId))
      .orderBy(desc(scores.overallScore))
  )

  return (
    <div>
      <Link
        href="/dashboard/roles"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        All roles
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{role.title}</h1>
          <p className="text-slate-500 mt-1">
            Created {new Date(role.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Link
          href={`/dashboard/roles/${roleId}/upload`}
          className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                     font-medium px-4 py-2 hover:bg-blue-700 transition-colors"
        >
          <UsersIcon className="h-4 w-4" />
          Upload CV
        </Link>
      </div>

      {/* Role description */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3">Description</h2>
        <p className="text-slate-600 whitespace-pre-wrap text-sm">{role.description}</p>
        <h2 className="font-semibold text-slate-900 mt-5 mb-3">Requirements</h2>
        <p className="text-slate-600 whitespace-pre-wrap text-sm">{role.requirements}</p>
      </div>

      {/* Candidates shortlist */}
      <div>
        <h2 className="font-semibold text-slate-900 mb-3">
          Candidates ({scoredCandidates.length})
        </h2>
        {scoredCandidates.length === 0 ? (
          <p className="text-slate-400 text-sm">No candidates scored for this role yet.</p>
        ) : (
          <div className="grid gap-2">
            {scoredCandidates.map((c) => (
              <Link
                key={c.scoreId}
                href={`/dashboard/candidates/${c.candidateId}?roleId=${roleId}`}
                className="flex items-center justify-between rounded-xl bg-white border border-slate-200
                           px-5 py-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-slate-900">
                  {c.firstName} {c.lastName}
                </span>
                <div className="flex items-center gap-3">
                  {c.scoreStatus === 'pending' || c.scoreStatus === 'processing' ? (
                    <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200
                                     px-2 py-0.5 rounded-full">
                      Scoring…
                    </span>
                  ) : c.scoreStatus === 'complete' && c.overallScore !== null ? (
                    <span className="text-sm font-bold text-slate-900">{c.overallScore}/100</span>
                  ) : (
                    <span className="text-xs text-red-500">Failed</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
