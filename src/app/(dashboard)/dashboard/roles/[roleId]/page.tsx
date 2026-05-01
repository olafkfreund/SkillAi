import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { ArrowLeftIcon, UsersIcon, PencilIcon, ArchiveIcon, UploadCloudIcon, AlertTriangleIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, scores, candidates, customers, agencies, users } from '@/db/schema'
import { DownloadPdfButton } from '@/components/export/download-pdf-button'
import { archiveRole, regenerateRoleTags } from '@/actions/roles'
import { hasRole } from '@/lib/auth/require-role'
import { RoleTagsPanel } from '@/components/roles/role-tags-panel'
import { RoleMetaBar } from '@/components/roles/role-meta-bar'
import { RoleContent } from '@/components/roles/role-content'
import { SelectableRoleCandidateList } from '@/components/roles/selectable-role-candidate-list'
import type { RoleCandidateRow } from '@/components/roles/selectable-role-candidate-list'
import { SuggestCandidatesPanel } from '@/components/roles/suggest-candidates-panel'
import { AddCandidatePanel } from '@/components/roles/add-candidate-panel'
import { ShortlistSummaryPanel } from '@/components/roles/shortlist-summary-panel'
import { SentToCustomerPanel } from '@/components/roles/sent-to-customer-panel'
import { DownloadCvsButton } from '@/components/roles/download-cvs-button'
import { PriorityKeywordsPanel } from '@/components/roles/priority-keywords-panel'
import { isScoreOutdatedAgainstPriorities } from '@/lib/scores/staleness'
import { ManagerAssignmentDialog } from '@/components/roles/manager-assignment-dialog'
import { SendForApprovalButton } from '@/components/roles/send-for-approval-button'
import { ShortlistStatusPill } from '@/components/manager/shortlist-status-pill'
import { ApproveAllRemainingButton } from '@/components/manager/approval-controls'
import { getRoleManagers } from '@/actions/role-managers'
import { getApprovalsForRole } from '@/actions/approvals'
import { getSubmissionsForRole } from '@/actions/role-submissions'

type Props = { params: Promise<{ roleId: string }> }

export default async function RoleDetailPage({ params }: Props) {
  const { roleId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const userRole = (session?.user as { role?: string }).role as string | undefined
  const canEdit = hasRole((userRole ?? 'viewer') as 'admin' | 'recruiter' | 'hiring_manager' | 'viewer', 'recruiter')
  const isHiringManager = userRole === 'hiring_manager'
  const audience = isHiringManager ? 'manager' : 'recruiter' as const

  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId))).limit(1)
  )
  if (!role) notFound()

  // Fetch hiring manager users for the assignment dialog (recruiter view only)
  // We fetch directly in the server component — no admin-only gate needed here.
  const [hiringManagerUsers, currentManagers, approvals, submissions] = await Promise.all([
    !isHiringManager
      ? withTenant(tenantId, async (tx) =>
          tx
            .select({ id: users.id, name: users.name, email: users.email, role: users.role })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.role, 'hiring_manager'), eq(users.isActive, true)))
            .orderBy(users.name)
        )
      : Promise.resolve([] as { id: string; name: string | null; email: string; role: 'admin' | 'recruiter' | 'hiring_manager' | 'viewer' }[]),
    getRoleManagers(roleId),
    getApprovalsForRole(roleId),
    getSubmissionsForRole(roleId),
  ])

  // Derive shortlist pill stats from approvals
  const approvalTotal = approvals.length
  const approvalApproved = approvals.filter((a) => a.decision === 'approved').length
  const approvalRejected = approvals.filter((a) => a.decision === 'rejected').length
  const approvalReviewed = approvalApproved + approvalRejected

  // For manager view: count pending approvals belonging to the current user
  const myPendingCount = isHiringManager
    ? approvals.filter(
        (a) => a.managerId === session.user.id && a.decision === 'pending'
      ).length
    : 0

  // Derive set of candidate IDs that already have a submission for this role
  const submittedCandidateIds = new Set(submissions.map((s) => s.candidateId))

  // Fetch customer info if linked
  const [customer] = role.customerId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({ id: customers.id, name: customers.name, portalBaseUrl: customers.portalBaseUrl, roleIdLabel: customers.roleIdLabel })
          .from(customers)
          .where(eq(customers.id, role.customerId!))
          .limit(1)
      )
    : [null]

  const customerRoleIdLabel = customer?.roleIdLabel ?? 'Customer Role ID'

  // Assemble customer portal URL
  const portalUrl = customer?.portalBaseUrl && role.customerPortalPath
    ? customer.portalBaseUrl.replace(/\/$/, '') + (role.customerPortalPath.startsWith('/') ? '' : '/') + role.customerPortalPath
    : customer?.portalBaseUrl || null

  // Compute expired state for banner
  const isExpired = role.isActive && role.cutoffDate && new Date(role.cutoffDate) < new Date(new Date().setHours(0, 0, 0, 0))

  // Fetch scored candidates for this role
  const scoredCandidates = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        scoreId: scores.id,
        overallScore: scores.overallScore,
        scoreStatus: scores.scoreStatus,
        technicalScore: scores.technicalScore,
        experienceScore: scores.experienceScore,
        culturalFitScore: scores.culturalFitScore,
        communicationScore: scores.communicationScore,
        scoreUpdatedAt: scores.updatedAt,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        filePath: candidates.filePath,
        candidateId: candidates.id,
        candidateRate: candidates.candidateRate,
        candidateCurrency: candidates.rateCurrency,
        agencyId: candidates.agencyId,
        agencyName: agencies.name,
        agencyLogoPath: agencies.logoPath,
        agencyIsInternal: agencies.isInternal,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
      .where(eq(scores.roleId, roleId))
      .orderBy(desc(scores.overallScore))
  )

  return (
    <div>
      <Link
        href="/dashboard/roles"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        All roles
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">{role.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-fg-subtle)] flex-wrap">
            <span>Created {new Date(role.createdAt).toLocaleDateString('en-GB')}</span>
            {customer && (
              <span className="text-[var(--color-fg-muted)]">
                &middot; <span className="font-medium text-[var(--color-fg)]">{customer.name}</span>
              </span>
            )}
            {role.frameworkLevelLabel && (
              <span className="inline-flex items-center rounded-full bg-violet-950 border border-violet-700
                               text-violet-300 text-xs font-medium px-2.5 py-0.5">
                {role.frameworkLevelLabel}
              </span>
            )}
            {!role.isActive && (
              <span className="text-xs bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">
                Archived
              </span>
            )}
            {/* Shortlist approval status pill — visible for both audiences */}
            <ShortlistStatusPill
              sentAt={role.shortlistSentAt ?? null}
              total={approvalTotal}
              reviewed={approvalReviewed}
              approved={approvalApproved}
              rejected={approvalRejected}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Recruiter: assign hiring managers to this role */}
          {canEdit && !isHiringManager && (
            <ManagerAssignmentDialog
              roleId={roleId}
              tenantUsers={hiringManagerUsers}
              currentManagers={currentManagers.map((m) => ({
                userId: m.userId,
                isPrimary: m.isPrimary,
              }))}
            />
          )}
          <DownloadPdfButton
            href={`/api/export/role/${roleId}`}
            label="Export role PDF"
          />
          <DownloadPdfButton
            href={`/api/export/shortlist/${roleId}`}
            label="Export shortlist PDF"
          />
          {!isHiringManager && <DownloadCvsButton roleId={roleId} />}
          {canEdit && (
            <Link
              href={`/dashboard/roles/${roleId}/edit`}
              className="flex items-center gap-2 rounded-md bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm
                         font-medium px-4 py-2 hover:bg-[var(--color-border)] transition-colors"
            >
              <PencilIcon className="h-4 w-4" />
              Edit role
            </Link>
          )}
          {!isHiringManager && (
            <Link
              href={`/dashboard/roles/${roleId}/bulk-upload`}
              className="flex items-center gap-2 rounded-md bg-[var(--color-bg-input)] text-[var(--color-fg)] text-sm
                         font-medium px-4 py-2 hover:bg-[var(--color-border)] transition-colors"
            >
              <UploadCloudIcon className="h-4 w-4" />
              Bulk Upload
            </Link>
          )}
          {!isHiringManager && (
            <Link
              href={`/dashboard/roles/${roleId}/upload`}
              className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                         font-medium px-4 py-2 hover:bg-blue-700 transition-colors"
            >
              <UsersIcon className="h-4 w-4" />
              Upload CV
            </Link>
          )}
          {canEdit && role.isActive && (
            <form action={archiveRole.bind(null, roleId)}>
              <button
                type="submit"
                formAction={archiveRole.bind(null, roleId)}
                className="flex items-center gap-2 rounded-md bg-[var(--color-bg-input)] text-[var(--color-fg-muted)] text-sm
                           font-medium px-4 py-2 hover:bg-red-950 hover:text-red-400
                           border border-[var(--color-border)] hover:border-red-800 transition-colors"
              >
                <ArchiveIcon className="h-4 w-4" />
                Archive role
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Meta bar — work mode, location, languages, customer, framework level */}
      {/* Expired banner — when cut-off date has passed but role is still active */}
      {isExpired && (
        <div className="rounded-xl bg-red-950 border border-red-800 px-5 py-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">Cut-off date passed</p>
                <p className="text-xs text-red-500 mt-0.5">
                  The cut-off date for this role passed on {role.cutoffDate ? new Date(role.cutoffDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}.
                  Decide whether to extend the cut-off or archive the role.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEdit && (
                <Link
                  href={`/dashboard/roles/${roleId}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-bg-input)] border border-[var(--color-border)] text-[var(--color-fg)] text-xs font-medium px-2.5 py-1.5 hover:bg-[var(--color-border)] transition-colors"
                >
                  <PencilIcon className="h-3 w-3" />
                  Edit
                </Link>
              )}
              {canEdit && (
                <form action={archiveRole.bind(null, roleId)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-900 border border-red-700 text-red-200 text-xs font-medium px-2.5 py-1.5 hover:bg-red-800 transition-colors"
                  >
                    <ArchiveIcon className="h-3 w-3" />
                    Archive role
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <RoleMetaBar
        role={role}
        customer={customer}
        portalUrl={portalUrl}
        customerRoleId={role.customerRoleId}
        customerRoleIdLabel={customerRoleIdLabel}
      />

      {/* Manager priority keywords — soft signal surfaced in AI scoring */}
      <PriorityKeywordsPanel
        keywords={role.priorityKeywords}
        canEdit={canEdit}
        audience={audience}
        roleEditHref={`/dashboard/roles/${roleId}/edit`}
      />

      {/* Tags panel */}
      <RoleTagsPanel
        roleId={roleId}
        keySkills={role.keySkills ?? []}
        topRequirements={role.topRequirements ?? []}
        canEdit={canEdit}
        audience={audience}
        regenerateAction={regenerateRoleTags.bind(null, roleId)}
      />

      {/* Role description */}
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-4">
          Role Description
        </h2>
        <RoleContent text={role.description} />
      </div>

      {/* Requirements */}
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-4">
          Requirements
        </h2>
        <RoleContent text={role.requirements} />
      </div>

      {/* Auto-suggest matching candidates from archive */}
      <SuggestCandidatesPanel
        roleId={roleId}
        roleText={[role.title, role.description, role.requirements].filter(Boolean).join('\n')}
      />

      {/* Manually add an existing candidate from the archive */}
      <AddCandidatePanel roleId={roleId} canEdit={canEdit} />

      {/* Candidates shortlist */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-semibold text-[var(--color-fg)]">
            Candidates ({scoredCandidates.length})
          </h2>
          {/* Recruiter: send shortlist to managers for approval */}
          {canEdit && !isHiringManager && scoredCandidates.length > 0 && (
            <SendForApprovalButton
              roleId={roleId}
              alreadySent={!!role.shortlistSentAt}
            />
          )}
          {/* Manager: bulk-approve all pending candidates */}
          {isHiringManager && myPendingCount > 0 && (
            <ApproveAllRemainingButton
              roleId={roleId}
              pendingCount={myPendingCount}
            />
          )}
        </div>
        {scoredCandidates.length === 0 ? (
          <p className="text-[var(--color-fg-subtle)] text-sm">No candidates scored for this role yet.</p>
        ) : (
          <SelectableRoleCandidateList
            roleId={roleId}
            roleDayRate={role.customerDayRate}
            roleCurrency={role.rateCurrency}
            canEdit={canEdit}
            isHiringManager={isHiringManager}
            audience={audience}
            candidates={scoredCandidates.map((c): RoleCandidateRow => {
              const isStale = isScoreOutdatedAgainstPriorities(
                { updatedAt: c.scoreUpdatedAt },
                { priorityKeywordsUpdatedAt: role.priorityKeywordsUpdatedAt },
              )
              const myApproval = isHiringManager
                ? approvals.find(
                    (a) =>
                      a.candidateId === c.candidateId &&
                      a.managerId === session.user.id
                  )
                : undefined
              return {
                scoreId: c.scoreId,
                candidateId: c.candidateId,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email,
                filePath: c.filePath ?? null,
                scoreStatus: c.scoreStatus,
                overallScore: c.overallScore,
                technicalScore: c.technicalScore,
                experienceScore: c.experienceScore,
                culturalFitScore: c.culturalFitScore,
                communicationScore: c.communicationScore,
                candidateRate: c.candidateRate,
                candidateCurrency: c.candidateCurrency,
                agencyId: c.agencyId ?? null,
                agencyName: c.agencyName ?? null,
                agencyLogoPath: c.agencyLogoPath ?? null,
                agencyIsInternal: c.agencyIsInternal,
                isStale,
                isSubmitted: submittedCandidateIds.has(c.candidateId),
                approval: myApproval
                  ? { decision: myApproval.decision, comment: myApproval.comment ?? null }
                  : null,
              }
            })}
          />
        )}
      </div>

      {/* Sent to Customer — recruiter-only panel listing all submitted candidates */}
      <SentToCustomerPanel submissions={submissions} audience={audience} />

      {/* AI Shortlist Hiring Recommendation — only when ≥2 candidates scored */}
      {scoredCandidates.length >= 2 && <ShortlistSummaryPanel roleId={roleId} />}
    </div>
  )
}
