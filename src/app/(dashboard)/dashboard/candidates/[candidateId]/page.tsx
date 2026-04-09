import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and } from 'drizzle-orm'
import { ArrowLeftIcon, ArchiveIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, scores, roles, notes, agencies, candidateEnrichments } from '@/db/schema'
import { ScoreChart } from '@/components/candidates/score-chart'
import { ScorePolling } from '@/components/candidates/score-polling'
import { PackGenerator } from '@/components/interview/pack-generator'
import { PackList } from '@/components/interview/pack-list'
import { DownloadPdfButton } from '@/components/export/download-pdf-button'
import { EnrichmentPanel } from '@/components/candidates/enrichment-panel'
import { StatusSelector } from '@/components/candidates/status-selector'
import { EditDetailsForm } from '@/components/candidates/edit-details-form'
import { archiveCandidate } from '@/actions/candidates'
import { hasRole } from '@/lib/auth/require-role'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'

type Props = { params: Promise<{ candidateId: string }>; searchParams: Promise<{ roleId?: string }> }

export default async function CandidateProfilePage({ params, searchParams }: Props) {
  const { candidateId } = await params
  const { roleId } = await searchParams
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const userRole = (session?.user as { role?: string }).role as string | undefined
  const canEdit = hasRole((userRole ?? 'viewer') as 'admin' | 'recruiter' | 'viewer', 'recruiter')

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

  const allRoles = await withTenant(tenantId, async (tx) =>
    tx.select({ id: roles.id, title: roles.title }).from(roles).where(eq(roles.isActive, true))
  )

  // Load existing enrichment data
  const [enrichmentRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))
      .limit(1)
  )

  const initialEnrichment = enrichmentRow
    ? {
        webHits: (enrichmentRow.webHits as WebHit[]) ?? [],
        githubProfile: (enrichmentRow.githubProfile as GitHubProfile | null) ?? null,
        searchedAt: enrichmentRow.searchedAt.toISOString(),
      }
    : null

  const isPending =
    activeScore?.score.scoreStatus === 'pending' ||
    activeScore?.score.scoreStatus === 'processing'

  return (
    <div className="max-w-4xl">
      <Link
        href={roleId ? `/dashboard/roles/${roleId}` : '/dashboard/candidates'}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {roleId ? 'Back to role' : 'All candidates'}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-100">
              {candidate.firstName} {candidate.lastName}
            </h1>
            {canEdit && (
              <StatusSelector
                candidateId={candidateId}
                currentStatus={candidate.status ?? 'new'}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
            {candidate.email && <span>{candidate.email}</span>}
            {candidate.phone && <span>{candidate.phone}</span>}
            {agency && <span>via {agency.name}</span>}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <DownloadPdfButton
              href={`/api/export/candidate/${candidateId}${roleId ? `?roleId=${roleId}` : ''}`}
              label="Download profile PDF"
            />
            {canEdit && candidate.isActive && (
              <form action={archiveCandidate.bind(null, candidateId)}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800
                             text-zinc-400 text-xs font-medium px-3 py-1.5
                             hover:bg-red-950 hover:text-red-400 hover:border-red-800 transition-colors"
                >
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  Archive
                </button>
              </form>
            )}
          </div>
        </div>
        {activeScore?.score.scoreStatus === 'complete' && activeScore.score.overallScore !== null && (
          <div className="text-center bg-blue-950 border border-blue-700 rounded-xl px-6 py-3">
            <p className="text-3xl font-bold text-blue-300">{activeScore.score.overallScore}</p>
            <p className="text-xs text-blue-400 mt-0.5">Overall score</p>
          </div>
        )}
      </div>

      {/* Edit candidate details (recruiter+ only) */}
      {canEdit && (
        <EditDetailsForm
          candidate={{
            id: candidate.id,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email ?? null,
            phone: candidate.phone ?? null,
          }}
        />
      )}

      {/* Scoring section */}
      {isPending && activeScore ? (
        <ScorePolling
          candidateId={candidateId}
          roleId={activeScore.score.roleId}
          currentStatus={activeScore.score.scoreStatus}
        />
      ) : activeScore?.score.scoreStatus === 'complete' ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
          <h2 className="font-semibold text-zinc-100 mb-4">
            Score for: {activeScore.role.title}
          </h2>
          <ScoreChart score={activeScore.score} />
          {activeScore.score.aiSummary && (
            <div className="mt-5 pt-5 border-t border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">AI Summary</h3>
              <p className="text-sm text-zinc-400">{activeScore.score.aiSummary}</p>
            </div>
          )}
        </div>
      ) : activeScore?.score.scoreStatus === 'failed' ? (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400 mb-6">
          Scoring failed: {activeScore.score.errorMessage ?? 'Unknown error'}
        </div>
      ) : null}

      {/* Web intelligence */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-zinc-100">Web Intelligence</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Search LinkedIn, GitHub, Reddit and more to build a fuller picture
            </p>
          </div>
        </div>
        <EnrichmentPanel
          candidateId={candidateId}
          initialLinkedinUrl={candidate.linkedinUrl ?? null}
          initialGithubUsername={candidate.githubUsername ?? null}
          initialEnrichment={initialEnrichment}
        />
      </div>

      {/* Interview packs */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-zinc-100">Interview Packs</h2>
          {allRoles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allRoles.map((role) => (
                <PackGenerator
                  key={role.id}
                  candidateId={candidateId}
                  roleId={role.id}
                  roleName={role.title}
                />
              ))}
            </div>
          )}
        </div>
        <PackList candidateId={candidateId} />
      </div>

      {/* CV text */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
        <h2 className="font-semibold text-zinc-100 mb-3">CV</h2>
        <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">
          {candidate.cvText}
        </pre>
      </div>

      {/* Notes */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        <h2 className="font-semibold text-zinc-100 mb-3">Notes ({candidateNotes.length})</h2>
        {candidateNotes.length === 0 ? (
          <p className="text-sm text-zinc-500">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {candidateNotes.map((note) => (
              <div key={note.id} className="rounded-md bg-zinc-800 px-4 py-3">
                <p className="text-sm text-zinc-300">{note.body}</p>
                <p className="text-xs text-zinc-500 mt-1">
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
