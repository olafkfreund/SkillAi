import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { ArrowLeftIcon, ArchiveIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db, withTenant } from '@/db'
import { candidates, scores, roles, notes, agencies, candidateEnrichments, cvProfiles, interviewSlots, calendarConnections } from '@/db/schema'
import { ScoreChart } from '@/components/candidates/score-chart'
import { ScorePolling } from '@/components/candidates/score-polling'
import { RescoreButton } from '@/components/candidates/rescore-button'
import { PackGenerator } from '@/components/interview/pack-generator'
import { PackList } from '@/components/interview/pack-list'
import { DownloadPdfButton } from '@/components/export/download-pdf-button'
import { SynechronCvButton } from '@/components/export/synechron-cv-button'
import { EnrichmentPanel } from '@/components/candidates/enrichment-panel'
import { NotesPanel } from '@/components/candidates/notes-panel'
import { StatusSelector } from '@/components/candidates/status-selector'
import { SynechronIdInput } from '@/components/candidates/synechron-id-input'
import { CandidateCvProfile } from '@/components/candidates/candidate-cv-profile'
import { EditDetailsForm } from '@/components/candidates/edit-details-form'
import { InterviewCalendar } from '@/components/candidates/interview-calendar'
import { IcsImportButton } from '@/components/candidates/ics-import-button'
import { RoleHistoryPanel } from '@/components/candidates/role-history-panel'
import { MatchingRolesPanel } from '@/components/candidates/matching-roles-panel'
import { CvFilePanel } from '@/components/candidates/cv-file-panel'
import { TranscriptSection } from '@/components/transcripts/transcript-section'
import { archiveCandidate } from '@/actions/candidates'
import { rescoreCandidate } from '@/actions/scores'
import { hasRole } from '@/lib/auth/require-role'
import { StaleScorePill } from '@/components/roles/priority-keywords-panel'
import { isScoreOutdatedAgainstPriorities } from '@/lib/scores/staleness'
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

  // agency depends on candidate.agencyId — must remain sequential after the candidate fetch
  const [agency] = candidate.agencyId
    ? await withTenant(tenantId, async (tx) =>
        tx.select().from(agencies).where(eq(agencies.id, candidate.agencyId!)).limit(1)
      )
    : [null]

  // All remaining queries are independent of each other and of the agency result.
  // They only need candidateId, tenantId, or userId — all available before any DB call.
  const userId = session.user.id
  const [
    candidateScores,
    candidateNotes,
    allRoles,
    allAgencies,
    rawSlots,
    calendarConns,
    [enrichmentRow],
    [cvProfileRow],
  ] = await Promise.all([
    withTenant(tenantId, async (tx) =>
      tx
        .select({ score: scores, role: roles })
        .from(scores)
        .innerJoin(roles, eq(scores.roleId, roles.id))
        .where(eq(scores.candidateId, candidateId))
        .orderBy(desc(scores.updatedAt))
    ),
    withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(notes)
        .where(eq(notes.candidateId, candidateId))
        .orderBy(desc(notes.createdAt))
    ),
    withTenant(tenantId, async (tx) =>
      tx.select({ id: roles.id, title: roles.title }).from(roles).where(eq(roles.isActive, true))
    ),
    withTenant(tenantId, async (tx) =>
      tx.select({ id: agencies.id, name: agencies.name }).from(agencies).where(eq(agencies.isActive, true))
    ),
    // Load interview slots for this candidate
    withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(interviewSlots)
        .where(eq(interviewSlots.candidateId, candidateId))
        .orderBy(desc(interviewSlots.scheduledAt))
    ),
    // Check which calendar providers are connected for the current user
    db
      .select({ provider: calendarConnections.provider })
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, userId)),
    // Load existing enrichment data
    withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(candidateEnrichments)
        .where(eq(candidateEnrichments.candidateId, candidateId))
        .limit(1)
    ),
    // Load CV profile (structured AI extraction)
    withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(cvProfiles)
        .where(eq(cvProfiles.candidateId, candidateId))
        .limit(1)
    ),
  ])

  const activeScore = roleId
    ? candidateScores.find((s) => s.score.roleId === roleId)
    : candidateScores[0]

  const roleHistory = candidateScores.map((s) => ({
    scoreId: s.score.id,
    roleId: s.role.id,
    roleTitle: s.role.title,
    overallScore: s.score.overallScore,
    scoreStatus: s.score.scoreStatus,
    technicalScore: s.score.technicalScore,
    experienceScore: s.score.experienceScore,
    culturalFitScore: s.score.culturalFitScore,
    communicationScore: s.score.communicationScore,
    scoredAt: s.score.updatedAt,
  }))

  const initialSlots = rawSlots.map((s) => ({
    id: s.id,
    title: s.title,
    scheduledAt: s.scheduledAt.toISOString(),
    durationMinutes: s.durationMinutes,
    status: s.status,
    location: s.location ?? null,
    meetingUrl: s.meetingUrl ?? null,
  }))

  const connectedProviders = new Set(calendarConns.map((c) => c.provider))
  const hasGoogleCalendar = connectedProviders.has('google')
  const hasMicrosoftCalendar = connectedProviders.has('microsoft')

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
            {canEdit && (
              <SynechronIdInput
                candidateId={candidateId}
                value={candidate.synechronCandidateId ?? null}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
            {candidate.email && <span>{candidate.email}</span>}
            {candidate.phone && <span>{candidate.phone}</span>}
            {agency && <span>via {agency.name}</span>}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <DownloadPdfButton
              href={`/api/export/candidate/${candidateId}${roleId ? `?roleId=${roleId}` : ''}`}
              label="Internal PDF"
            />
            <DownloadPdfButton
              href={`/api/export/candidate/${candidateId}?audience=customer${roleId ? `&roleId=${roleId}` : ''}`}
              label="Customer PDF"
            />
            <SynechronCvButton candidateId={candidateId} />
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
          {/* Original CV — download / attach / replace */}
          <div className="mt-2">
            <CvFilePanel
              candidateId={candidateId}
              filePath={candidate.filePath ?? null}
              fileType={candidate.fileType ?? null}
            />
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
            agencyId: candidate.agencyId ?? null,
            country: candidate.country ?? null,
            city: candidate.city ?? null,
            languagesSpoken: candidate.languagesSpoken ?? [],
            willingToRelocate: candidate.willingToRelocate ?? null,
            candidateRate: candidate.candidateRate ?? null,
            customerRate: candidate.customerRate ?? null,
            rateCurrency: candidate.rateCurrency ?? null,
            availabilityStatus: candidate.availabilityStatus ?? 'available',
            availableFrom: candidate.availableFrom ?? null,
          }}
          agencies={allAgencies}
        />
      )}

      {/* Location & Language */}
      {(candidate.country || candidate.city || (candidate.languagesSpoken && candidate.languagesSpoken.length > 0)) && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Location & Language</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {(candidate.country || candidate.city) && (
              <div>
                <p className="text-xs text-zinc-500">Location</p>
                <p className="text-sm text-zinc-100">
                  {[candidate.city, candidate.country].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
            {candidate.languagesSpoken && candidate.languagesSpoken.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500">Languages</p>
                <p className="text-sm text-zinc-100">{candidate.languagesSpoken.join(', ')}</p>
              </div>
            )}
            {candidate.willingToRelocate !== null && (
              <div>
                <p className="text-xs text-zinc-500">Willing to Relocate</p>
                <p className="text-sm text-zinc-100">{candidate.willingToRelocate ? 'Yes' : 'No'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Commercial Details */}
      {(candidate.candidateRate || candidate.customerRate) && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Commercial Details</h3>
          <div className="grid grid-cols-3 gap-4">
            {candidate.candidateRate && (
              <div>
                <p className="text-xs text-zinc-500">Candidate Rate/day</p>
                <p className="text-lg font-semibold text-zinc-100">
                  {candidate.rateCurrency ?? ''} {Number(candidate.candidateRate).toFixed(2)}
                </p>
              </div>
            )}
            {candidate.customerRate && (
              <div>
                <p className="text-xs text-zinc-500">Customer Rate/day</p>
                <p className="text-lg font-semibold text-zinc-100">
                  {candidate.rateCurrency ?? ''} {Number(candidate.customerRate).toFixed(2)}
                </p>
              </div>
            )}
            {candidate.candidateRate && candidate.customerRate && (
              <div>
                <p className="text-xs text-zinc-500">Margin</p>
                <p className="text-lg font-semibold text-emerald-400">
                  {candidate.rateCurrency ?? ''} {(Number(candidate.customerRate) - Number(candidate.candidateRate)).toFixed(2)}
                  <span className="text-sm text-zinc-500 ml-1">
                    ({((Number(candidate.customerRate) - Number(candidate.candidateRate)) / Number(candidate.customerRate) * 100).toFixed(1)}%)
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-zinc-100">Score for: {activeScore.role.title}</h2>
              {isScoreOutdatedAgainstPriorities(activeScore.score, activeScore.role) && canEdit && (
                <StaleScorePill
                  candidateId={candidateId}
                  roleId={activeScore.score.roleId}
                  rescoreAction={rescoreCandidate}
                />
              )}
            </div>
            {canEdit && (
              <RescoreButton
                candidateId={candidateId}
                currentRoleId={activeScore.score.roleId}
                allRoles={allRoles}
              />
            )}
          </div>
          <ScoreChart score={activeScore.score} />
          {activeScore.score.aiSummary && (
            <div className="mt-5 pt-5 border-t border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">AI Summary</h3>
              <p className="text-sm text-zinc-400">{activeScore.score.aiSummary}</p>
            </div>
          )}
        </div>
      ) : activeScore?.score.scoreStatus === 'failed' ? (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400 mb-6 flex items-center justify-between">
          <span>Scoring failed: {activeScore.score.errorMessage ?? 'Unknown error'}</span>
          {canEdit && (
            <RescoreButton
              candidateId={candidateId}
              currentRoleId={activeScore.score.roleId}
              allRoles={allRoles}
            />
          )}
        </div>
      ) : null}

      {/* Matching roles — AI-powered suggestions for active roles not yet scored */}
      <MatchingRolesPanel candidateId={candidateId} />

      {/* Role history */}
      <RoleHistoryPanel roleHistory={roleHistory} />

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

      {/* Interview Transcripts */}
      <TranscriptSection
        candidateId={candidateId}
        defaultRoleId={roleId ?? activeScore?.score.roleId}
      />

      {/* Interview Schedule */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
        <h2 className="font-semibold text-zinc-100 mb-4">Interview Schedule</h2>
        {canEdit && (
          <div className="mb-4">
            <IcsImportButton candidateId={candidateId} roleId={roleId ?? null} />
          </div>
        )}
        <InterviewCalendar
          candidateId={candidateId}
          candidateName={`${candidate.firstName} ${candidate.lastName}`}
          roleId={roleId}
          initialSlots={initialSlots}
          canSchedule={canEdit}
          allRoles={allRoles}
          hasGoogleCalendar={hasGoogleCalendar}
          hasMicrosoftCalendar={hasMicrosoftCalendar}
        />
      </div>

      {/* CV Profile */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
        <h2 className="font-semibold text-zinc-100 mb-4">CV Profile</h2>
        <CandidateCvProfile
          candidateId={candidateId}
          cvText={candidate.cvText}
          cvTextFormatted={candidate.cvTextFormatted}
          profile={cvProfileRow ? {
            experienceLevel: cvProfileRow.experienceLevel,
            summary: cvProfileRow.summary,
            technicalSkills: cvProfileRow.technicalSkills ?? [],
            companies: cvProfileRow.companies ?? [],
            personalizableMoments: cvProfileRow.personalizableMoments ?? [],
            extractionStatus: cvProfileRow.extractionStatus,
            errorMessage: cvProfileRow.errorMessage,
            extractedAt: cvProfileRow.extractedAt ? cvProfileRow.extractedAt.toISOString() : null,
          } : null}
          canEdit={canEdit}
        />
      </div>

      {/* Notes */}
      <NotesPanel
        candidateId={candidateId}
        currentUserId={session?.user?.id ?? ''}
        canEdit={canEdit}
        initialNotes={candidateNotes.map((n) => ({
          id: n.id,
          body: n.body,
          authorId: n.authorId,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt?.toISOString() ?? null,
          isEdited: n.isEdited,
        }))}
      />
    </div>
  )
}
