import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { ArrowLeftIcon, UsersIcon, PencilIcon, ArchiveIcon, UploadCloudIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, scores, candidates, customers } from '@/db/schema'
import { DownloadPdfButton } from '@/components/export/download-pdf-button'
import { archiveRole, regenerateRoleTags } from '@/actions/roles'
import { removeCandidateFromRole } from '@/actions/scores'
import { hasRole } from '@/lib/auth/require-role'
import { RoleTagsPanel } from '@/components/roles/role-tags-panel'
import { RoleCandidateCard } from '@/components/roles/role-candidate-card'
import { SuggestCandidatesPanel } from '@/components/roles/suggest-candidates-panel'
import { AddCandidatePanel } from '@/components/roles/add-candidate-panel'
import { ShortlistSummaryPanel } from '@/components/roles/shortlist-summary-panel'

type Props = { params: Promise<{ roleId: string }> }

export default async function RoleDetailPage({ params }: Props) {
  const { roleId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const userRole = (session?.user as { role?: string }).role as string | undefined
  const canEdit = hasRole((userRole ?? 'viewer') as 'admin' | 'recruiter' | 'viewer', 'recruiter')

  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId))).limit(1)
  )
  if (!role) notFound()

  // Fetch customer name if linked
  const [customer] = role.customerId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, role.customerId!))
          .limit(1)
      )
    : [null]

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
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        filePath: candidates.filePath,
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
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        All roles
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{role.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500 flex-wrap">
            <span>Created {new Date(role.createdAt).toLocaleDateString()}</span>
            {customer && (
              <span className="text-zinc-400">
                &middot; <span className="font-medium text-zinc-300">{customer.name}</span>
              </span>
            )}
            {role.frameworkLevelLabel && (
              <span className="inline-flex items-center rounded-full bg-violet-950 border border-violet-700
                               text-violet-300 text-xs font-medium px-2.5 py-0.5">
                {role.frameworkLevelLabel}
              </span>
            )}
            {!role.isActive && (
              <span className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-600 px-2 py-0.5 rounded-full">
                Archived
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DownloadPdfButton
            href={`/api/export/role/${roleId}`}
            label="Export role PDF"
          />
          <DownloadPdfButton
            href={`/api/export/shortlist/${roleId}`}
            label="Export shortlist PDF"
          />
          {canEdit && (
            <Link
              href={`/dashboard/roles/${roleId}/edit`}
              className="flex items-center gap-2 rounded-md bg-zinc-700 text-zinc-100 text-sm
                         font-medium px-4 py-2 hover:bg-zinc-600 transition-colors"
            >
              <PencilIcon className="h-4 w-4" />
              Edit role
            </Link>
          )}
          <Link
            href={`/dashboard/roles/${roleId}/bulk-upload`}
            className="flex items-center gap-2 rounded-md bg-zinc-700 text-zinc-100 text-sm
                       font-medium px-4 py-2 hover:bg-zinc-600 transition-colors"
          >
            <UploadCloudIcon className="h-4 w-4" />
            Bulk Upload
          </Link>
          <Link
            href={`/dashboard/roles/${roleId}/upload`}
            className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                       font-medium px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            <UsersIcon className="h-4 w-4" />
            Upload CV
          </Link>
          {canEdit && role.isActive && (
            <form action={archiveRole.bind(null, roleId)}>
              <button
                type="submit"
                formAction={archiveRole.bind(null, roleId)}
                className="flex items-center gap-2 rounded-md bg-zinc-800 text-zinc-400 text-sm
                           font-medium px-4 py-2 hover:bg-red-950 hover:text-red-400
                           border border-zinc-700 hover:border-red-800 transition-colors"
              >
                <ArchiveIcon className="h-4 w-4" />
                Archive role
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Tags panel */}
      <RoleTagsPanel
        roleId={roleId}
        keySkills={role.keySkills ?? []}
        topRequirements={role.topRequirements ?? []}
        canEdit={canEdit}
        regenerateAction={regenerateRoleTags.bind(null, roleId)}
      />

      {/* Role description */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
        <h2 className="font-semibold text-zinc-100 mb-3">Description</h2>
        <p className="text-zinc-400 whitespace-pre-wrap text-sm">{role.description}</p>
        <h2 className="font-semibold text-zinc-100 mt-5 mb-3">Requirements</h2>
        <p className="text-zinc-400 whitespace-pre-wrap text-sm">{role.requirements}</p>
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
        <h2 className="font-semibold text-zinc-100 mb-3">
          Candidates ({scoredCandidates.length})
        </h2>
        {scoredCandidates.length === 0 ? (
          <p className="text-zinc-500 text-sm">No candidates scored for this role yet.</p>
        ) : (
          <div className="grid gap-2">
            {scoredCandidates.map((c) => (
              <RoleCandidateCard
                key={c.scoreId}
                scoreId={c.scoreId}
                roleId={roleId}
                candidateId={c.candidateId}
                firstName={c.firstName}
                lastName={c.lastName}
                email={c.email}
                scoreStatus={c.scoreStatus}
                overallScore={c.overallScore}
                technicalScore={c.technicalScore}
                experienceScore={c.experienceScore}
                culturalFitScore={c.culturalFitScore}
                communicationScore={c.communicationScore}
                filePath={c.filePath ?? null}
                canEdit={canEdit}
                removeAction={removeCandidateFromRole}
              />
            ))}
          </div>
        )}
      </div>

      {/* AI Shortlist Hiring Recommendation — only when ≥2 candidates scored */}
      {scoredCandidates.length >= 2 && <ShortlistSummaryPanel roleId={roleId} />}
    </div>
  )
}
