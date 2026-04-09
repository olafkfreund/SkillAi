import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and } from 'drizzle-orm'
import { ArrowLeftIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, scores, roles, notes, agencies } from '@/db/schema'
import { ScoreChart } from '@/components/candidates/score-chart'
import { ScorePolling } from '@/components/candidates/score-polling'

type Props = { params: Promise<{ candidateId: string }>; searchParams: Promise<{ roleId?: string }> }

export default async function CandidateProfilePage({ params, searchParams }: Props) {
  const { candidateId } = await params
  const { roleId } = await searchParams
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!candidate) notFound()

  const [agency] = candidate.agencyId
    ? await withTenant(tenantId, async (tx) =>
        tx.select().from(agencies).where(eq(agencies.id, candidate.agencyId!)).limit(1)
      )
    : [null]

  // Fetch score for the requested role (or latest)
  const candidateScores = await withTenant(tenantId, async (tx) =>
    tx
      .select({ score: scores, role: roles })
      .from(scores)
      .innerJoin(roles, eq(scores.roleId, roles.id))
      .where(eq(scores.candidateId, candidateId))
  )

  const activeScore = roleId
    ? candidateScores.find((s) => s.score.roleId === roleId)
    : candidateScores[0]

  const candidateNotes = await withTenant(tenantId, async (tx) =>
    tx.select().from(notes).where(eq(notes.candidateId, candidateId))
  )

  const isPending =
    activeScore?.score.scoreStatus === 'pending' ||
    activeScore?.score.scoreStatus === 'processing'

  return (
    <div className="max-w-4xl">
      <Link
        href={roleId ? `/dashboard/roles/${roleId}` : '/dashboard/candidates'}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {roleId ? 'Back to role' : 'All candidates'}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {candidate.firstName} {candidate.lastName}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
            {candidate.email && <span>{candidate.email}</span>}
            {candidate.phone && <span>{candidate.phone}</span>}
            {agency && <span>via {agency.name}</span>}
          </div>
        </div>
        {activeScore?.score.scoreStatus === 'complete' && activeScore.score.overallScore !== null && (
          <div className="text-center bg-blue-50 border border-blue-200 rounded-xl px-6 py-3">
            <p className="text-3xl font-bold text-blue-700">{activeScore.score.overallScore}</p>
            <p className="text-xs text-blue-500 mt-0.5">Overall score</p>
          </div>
        )}
      </div>

      {/* Scoring section */}
      {isPending && activeScore ? (
        <ScorePolling
          candidateId={candidateId}
          roleId={activeScore.score.roleId}
          currentStatus={activeScore.score.scoreStatus}
        />
      ) : activeScore?.score.scoreStatus === 'complete' ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4">
            Score for: {activeScore.role.title}
          </h2>
          <ScoreChart score={activeScore.score} />
          {activeScore.score.aiSummary && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">AI Summary</h3>
              <p className="text-sm text-slate-600">{activeScore.score.aiSummary}</p>
            </div>
          )}
        </div>
      ) : activeScore?.score.scoreStatus === 'failed' ? (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
          Scoring failed: {activeScore.score.errorMessage ?? 'Unknown error'}
        </div>
      ) : null}

      {/* CV text */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3">CV</h2>
        <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">
          {candidate.cvText}
        </pre>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-3">Notes ({candidateNotes.length})</h2>
        {candidateNotes.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {candidateNotes.map((note) => (
              <div key={note.id} className="rounded-md bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-700">{note.body}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
