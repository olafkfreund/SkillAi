import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { ArrowLeftIcon, ArchiveIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db, withTenant } from '@/db'
import { candidates, scores, roles, notes, agencies, candidateEnrichments, cvProfiles, interviewSlots, calendarConnections, tenants } from '@/db/schema'
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
import { getDefaultPackLanguage } from '@/actions/settings'
import { hasRole } from '@/lib/auth/require-role'
import { StaleScorePill } from '@/components/roles/priority-keywords-panel'
import { isScoreOutdatedAgainstPriorities } from '@/lib/scores/staleness'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'
import { ApprovalControls } from '@/components/manager/approval-controls'
import { getMyAssignedRoles } from '@/actions/role-managers'
import { getApprovalsForRole } from '@/actions/approvals'
import { SendEmailButton } from '@/components/candidates/send-email-button'
import { EmailHistory } from '@/components/candidates/email-history'
import { listEmailTemplates } from '@/actions/email-templates'
import { listSentEmailsForCandidate } from '@/actions/emails'
import { GdprActionsPanel } from '@/components/candidates/gdpr-actions-panel'
import { WelcomeLetterButton } from '@/components/candidates/welcome-letter-button'
import { ManagerMobileActions } from '@/components/candidates/manager-mobile-actions'
import { MobilePanel } from '@/components/candidates/mobile-panel'

type Props = { params: Promise<{ candidateId: string }>; searchParams: Promise<{ roleId?: string }> }

export default async function CandidateProfilePage({ params, searchParams }: Props) {
  const { candidateId } = await params
  const { roleId } = await searchParams
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const userRole = (session?.user as { role?: string }).role as string | undefined
  const canEdit = hasRole((userRole ?? 'viewer') as 'admin' | 'recruiter' | 'hiring_manager' | 'viewer', 'recruiter')
  const isHiringManager = userRole === 'hiring_manager'
  const audience = isHiringManager ? 'manager' : 'recruiter' as const

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
    tenantDefaultLanguage,
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
        .select({
          id: notes.id,
          candidateId: notes.candidateId,
          authorId: notes.authorId,
          body: notes.body,
          isShareable: notes.isShareable,
          isEdited: notes.isEdited,
          createdAt: notes.createdAt,
          updatedAt: notes.updatedAt,
        })
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
    // Tenant-wide default pack language (3-tier fallback: candidate → tenant → 'en')
    getDefaultPackLanguage(tenantId),
  ])

  // Email data — only fetched for recruiter+ sessions; managers skip this entirely
  const [emailTemplates, sentEmailRows, tenantRow] = !isHiringManager
    ? await Promise.all([
        listEmailTemplates(),
        listSentEmailsForCandidate(candidateId),
        withTenant(tenantId, async (tx) =>
          tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
        ).then((rows) => rows[0] ?? null),
      ])
    : [[], [], null]

  const tenantName = tenantRow?.name ?? ''
  const recruiterName = session.user.name ?? 'The Recruitment Team'

  // Manager-specific data: which roles am I assigned to, and what are my
  // approval decisions for those roles that also include this candidate?
  // We only pay this cost for hiring_manager sessions.
  const myAssignedRoles = isHiringManager ? await getMyAssignedRoles() : []

  // For each assigned role that this candidate has been scored on, fetch approvals.
  // candidateScores already contains the full role list — we intersect.
  const assignedRoleIds = new Set(myAssignedRoles.map((r) => r.roleId))
  const rolesWithThisCandidate = candidateScores
    .map((s) => s.role.id)
    .filter((id) => assignedRoleIds.has(id))

  // Fetch approval rows for each relevant role in parallel (usually 0-3 roles)
  const approvalsByRole = isHiringManager && rolesWithThisCandidate.length > 0
    ? await Promise.all(
        rolesWithThisCandidate.map((rid) => getApprovalsForRole(rid))
      )
    : []

  // Build a map: roleId → my approval row for this candidate
  const myApprovalByRole = new Map<string, { decision: 'pending' | 'approved' | 'rejected'; comment: string | null }>(
    rolesWithThisCandidate.map((rid, idx) => {
      const row = (approvalsByRole[idx] ?? []).find(
        (a) => a.candidateId === candidateId && a.managerId === session.user.id
      )
      return [rid, row ? { decision: row.decision, comment: row.comment } : { decision: 'pending', comment: null }]
    })
  )

  const activeScore = roleId
    ? candidateScores.find((s) => s.score.roleId === roleId)
    : candidateScores[0]

  // Deduplicated list of roles this candidate has scores for — used by WelcomeLetterButton
  const candidateRolesForLetter = Array.from(
    new Map(candidateScores.map((s) => [s.role.id, { id: s.role.id, title: s.role.title }])).values()
  )

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
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {roleId ? 'Back to role' : 'All candidates'}
      </Link>

      {/* Quick approve/reject for hiring managers on mobile — full ApprovalControls remains further down */}
      <ManagerMobileActions
        audience={audience}
        roleId={roleId ?? null}
        candidateId={candidateId}
        currentDecision={roleId ? (myApprovalByRole.get(roleId)?.decision ?? null) : null}
      />

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[var(--color-fg)] break-words min-w-0">
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
          <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-fg-subtle)]">
            {candidate.email && <span>{candidate.email}</span>}
            {candidate.phone && <span>{candidate.phone}</span>}
            {agency && audience !== 'manager' && (
              <span className="inline-flex items-center gap-1.5">
                {agency.logoPath ? (
                  <img
                    src={`/api/agencies/${agency.id}/logo`}
                    alt=""
                    width={24}
                    height={24}
                    style={{ width: 24, height: 24 }}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] object-contain shrink-0"
                  />
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full bg-[var(--color-bg-input)]
                               text-[var(--color-fg-muted)] text-xs font-semibold shrink-0"
                    style={{ width: 24, height: 24 }}
                    aria-hidden="true"
                  >
                    {agency.name.charAt(0).toUpperCase()}
                  </div>
                )}
                via {agency.name}
              </span>
            )}
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
            <WelcomeLetterButton
              candidateId={candidateId}
              candidateLanguagesSpoken={candidate.languagesSpoken ?? null}
              defaultPackLanguage={tenantDefaultLanguage}
              currentRoleId={roleId ?? null}
              candidateRoles={candidateRolesForLetter}
              audience={audience}
            />
            {canEdit && !isHiringManager && candidate.isActive && (
              <form action={archiveCandidate.bind(null, candidateId)}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)]
                             text-[var(--color-fg-muted)] text-xs font-medium px-3 py-1.5
                             hover:bg-red-950 hover:text-red-400 hover:border-red-800 transition-colors"
                >
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  Archive
                </button>
              </form>
            )}
            {/* Send email — hidden for hiring managers */}
            {!isHiringManager && (
              <SendEmailButton
                candidateId={candidateId}
                candidateFirstName={candidate.firstName}
                candidateLastName={candidate.lastName}
                candidateEmail={candidate.email ?? null}
                roleTitle={activeScore?.role.title}
                recruiterName={recruiterName}
                tenantName={tenantName}
                templates={emailTemplates}
              />
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
          <div className="text-center bg-blue-950 border border-blue-700 rounded-xl px-6 py-3 flex-shrink-0 self-start">
            <p className="text-3xl font-bold text-blue-300">{activeScore.score.overallScore}</p>
            <p className="text-xs text-blue-400 mt-0.5">Overall score</p>
          </div>
        )}
      </div>

      {/* Edit candidate details (recruiter+ only; hidden for hiring_manager) */}
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
          audience={audience}
        />
      )}

      {/* Location & Language */}
      {(candidate.country || candidate.city || (candidate.languagesSpoken && candidate.languagesSpoken.length > 0)) && (
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <h3 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-3">Location & Language</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-2 md:gap-x-8">
            {(candidate.country || candidate.city) && (
              <div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Location</p>
                <p className="text-sm text-[var(--color-fg)]">
                  {[candidate.city, candidate.country].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
            {candidate.languagesSpoken && candidate.languagesSpoken.length > 0 && (
              <div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Languages</p>
                <p className="text-sm text-[var(--color-fg)]">{candidate.languagesSpoken.join(', ')}</p>
              </div>
            )}
            {candidate.willingToRelocate !== null && (
              <div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Willing to Relocate</p>
                <p className="text-sm text-[var(--color-fg)]">{candidate.willingToRelocate ? 'Yes' : 'No'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Commercial Details — hidden for hiring managers */}
      {!isHiringManager && (candidate.candidateRate || candidate.customerRate) && (
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <h3 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-3">Commercial Details</h3>
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-4">
            {candidate.candidateRate && (
              <div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Candidate Rate/day</p>
                <p className="text-lg font-semibold text-[var(--color-fg)]">
                  {candidate.rateCurrency ?? ''} {Number(candidate.candidateRate).toFixed(2)}
                </p>
              </div>
            )}
            {candidate.customerRate && (
              <div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Customer Rate/day</p>
                <p className="text-lg font-semibold text-[var(--color-fg)]">
                  {candidate.rateCurrency ?? ''} {Number(candidate.customerRate).toFixed(2)}
                </p>
              </div>
            )}
            {candidate.candidateRate && candidate.customerRate && (
              <div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Margin</p>
                <p className="text-lg font-semibold text-emerald-400">
                  {candidate.rateCurrency ?? ''} {(Number(candidate.customerRate) - Number(candidate.candidateRate)).toFixed(2)}
                  <span className="text-sm text-[var(--color-fg-subtle)] ml-1">
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
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-[var(--color-fg)]">Score for: {activeScore.role.title}</h2>
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
            <div className="mt-5 pt-5 border-t border-[var(--color-border)]">
              <h3 className="text-sm font-semibold text-[var(--color-fg)] mb-1">AI Summary</h3>
              <p className="text-sm text-[var(--color-fg-muted)]">{activeScore.score.aiSummary}</p>
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

      {/* Manager approval controls — shown when the manager is assigned to one or
          more roles that this candidate has been scored on */}
      {isHiringManager && rolesWithThisCandidate.length > 0 && (
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <h2 className="font-semibold text-[var(--color-fg)] mb-1">Your Approval</h2>
          <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
            Record your approval decision for each role this candidate has been shortlisted on.
          </p>
          <div className="space-y-4">
            {rolesWithThisCandidate.map((rid) => {
              const roleEntry = candidateScores.find((s) => s.role.id === rid)
              const approval = myApprovalByRole.get(rid)
              if (!roleEntry) return null
              return (
                <div key={rid}>
                  <p className="text-xs font-medium text-[var(--color-fg-muted)] mb-2 uppercase tracking-wide">
                    {roleEntry.role.title}
                  </p>
                  <ApprovalControls
                    roleId={rid}
                    candidateId={candidateId}
                    currentDecision={approval?.decision ?? 'pending'}
                    currentComment={approval?.comment ?? null}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Web intelligence */}
      <MobilePanel title="Web Intelligence">
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-[var(--color-fg)]">Web Intelligence</h2>
              <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                Search LinkedIn, GitHub, Reddit and more to build a fuller picture
              </p>
            </div>
          </div>
          <EnrichmentPanel
            candidateId={candidateId}
            initialLinkedinUrl={candidate.linkedinUrl ?? null}
            initialGithubUsername={candidate.githubUsername ?? null}
            initialEnrichment={initialEnrichment}
            canEdit={canEdit}
          />
        </div>
      </MobilePanel>

      {/* Interview packs */}
      <MobilePanel title="Interview Packs">
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[var(--color-fg)]">Interview Packs</h2>
            {allRoles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allRoles.map((role) => (
                  <PackGenerator
                    key={role.id}
                    candidateId={candidateId}
                    roleId={role.id}
                    roleName={role.title}
                    candidateLanguages={candidate.languagesSpoken ?? []}
                    tenantDefaultLanguage={tenantDefaultLanguage}
                  />
                ))}
              </div>
            )}
          </div>
          <PackList candidateId={candidateId} />
        </div>
      </MobilePanel>

      {/* Interview Transcripts */}
      <TranscriptSection
        candidateId={candidateId}
        defaultRoleId={roleId ?? activeScore?.score.roleId}
      />

      {/* Interview Schedule */}
      <MobilePanel title="Interview Schedule">
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <h2 className="font-semibold text-[var(--color-fg)] mb-4">Interview Schedule</h2>
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
      </MobilePanel>

      {/* CV Profile */}
      <MobilePanel title="CV Profile">
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-4 md:p-6 mb-6">
          <h2 className="font-semibold text-[var(--color-fg)] mb-4">CV Profile</h2>
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
      </MobilePanel>

      {/* Notes */}
      <NotesPanel
        candidateId={candidateId}
        currentUserId={session?.user?.id ?? ''}
        canEdit={canEdit}
        audience={audience}
        initialNotes={candidateNotes.map((n) => ({
          id: n.id,
          body: n.body,
          authorId: n.authorId,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt?.toISOString() ?? null,
          isEdited: n.isEdited,
          isShareable: n.isShareable,
        }))}
      />

      {/* Email history — hidden for hiring managers (EmailHistory handles null-guard internally) */}
      <EmailHistory sentEmails={sentEmailRows} audience={audience} />

      {/* GDPR actions — admin only */}
      {userRole === 'admin' && (
        <GdprActionsPanel
          candidateId={candidateId}
          candidateName={`${candidate.firstName} ${candidate.lastName}`}
        />
      )}
    </div>
  )
}
