import { eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewTranscripts, transcriptAnalyses, roles, interviewPacks } from '@/db/schema'
import { hasRole } from '@/lib/auth/require-role'
import { TranscriptUploadForm } from './transcript-upload-form'
import { TranscriptAnalysisView } from './transcript-analysis-view'
import { FileTextIcon, ClockIcon } from 'lucide-react'
import type { QuestionResponse } from '@/db/schema/transcript-analyses'

type Props = {
  candidateId: string
  defaultRoleId?: string
}

const PLATFORM_LABELS: Record<string, string> = {
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  meet: 'Google Meet',
  other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  analyzing: 'Analysing…',
  complete: 'Complete',
  failed: 'Failed',
}

export async function TranscriptSection({ candidateId, defaultRoleId }: Props) {
  const session = await auth()
  const tenantId = session?.user?.tenantId
  if (!tenantId) return null

  const userRole = ((session?.user as { role?: string }).role ?? 'viewer') as
    | 'admin'
    | 'recruiter'
    | 'viewer'
  const canUpload = hasRole(userRole, 'recruiter')

  const [transcriptRows, allRoles, allPacks] = await Promise.all([
    withTenant(tenantId, async (tx) =>
      tx
        .select({
          id: interviewTranscripts.id,
          roleId: interviewTranscripts.roleId,
          packId: interviewTranscripts.packId,
          sourcePlatform: interviewTranscripts.sourcePlatform,
          interviewDate: interviewTranscripts.interviewDate,
          analysisStatus: interviewTranscripts.analysisStatus,
          errorMessage: interviewTranscripts.errorMessage,
          createdAt: interviewTranscripts.createdAt,
          overallScore: transcriptAnalyses.overallScore,
          communicationScore: transcriptAnalyses.communicationScore,
          technicalDepthScore: transcriptAnalyses.technicalDepthScore,
          problemSolvingScore: transcriptAnalyses.problemSolvingScore,
          socialFitScore: transcriptAnalyses.socialFitScore,
          communicationReasoning: transcriptAnalyses.communicationReasoning,
          technicalDepthReasoning: transcriptAnalyses.technicalDepthReasoning,
          problemSolvingReasoning: transcriptAnalyses.problemSolvingReasoning,
          socialFitReasoning: transcriptAnalyses.socialFitReasoning,
          summary: transcriptAnalyses.summary,
          strengths: transcriptAnalyses.strengths,
          redFlags: transcriptAnalyses.redFlags,
          recommendedDecision: transcriptAnalyses.recommendedDecision,
          questionResponses: transcriptAnalyses.questionResponses,
        })
        .from(interviewTranscripts)
        .leftJoin(transcriptAnalyses, eq(transcriptAnalyses.transcriptId, interviewTranscripts.id))
        .where(eq(interviewTranscripts.candidateId, candidateId))
        .orderBy(desc(interviewTranscripts.createdAt))
        .limit(20)
    ),
    withTenant(tenantId, async (tx) =>
      tx.select({ id: roles.id, title: roles.title }).from(roles).where(eq(roles.isActive, true))
    ),
    withTenant(tenantId, async (tx) =>
      tx
        .select({ id: interviewPacks.id, title: roles.title })
        .from(interviewPacks)
        .innerJoin(roles, eq(roles.id, interviewPacks.roleId))
        .where(eq(interviewPacks.candidateId, candidateId))
        .orderBy(desc(interviewPacks.createdAt))
        .limit(10)
    ),
  ])

  const activeRoleId = defaultRoleId ?? allRoles[0]?.id ?? ''

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
      <h2 className="font-semibold text-zinc-100 mb-4">Interview Transcripts</h2>

      {/* Upload form — recruiter+ only */}
      {canUpload && activeRoleId && (
        <div className="mb-6">
          <TranscriptUploadForm
            candidateId={candidateId}
            roleId={activeRoleId}
            packs={allPacks}
            userRole={userRole}
          />
        </div>
      )}

      {/* No transcripts yet */}
      {transcriptRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileTextIcon className="h-8 w-8 text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-500">No transcripts uploaded yet</p>
          {!canUpload && (
            <p className="text-xs text-zinc-600 mt-1">
              Transcripts will appear here once a recruiter uploads them
            </p>
          )}
        </div>
      )}

      {/* Transcript list */}
      {transcriptRows.length > 0 && (
        <div className="space-y-5">
          {transcriptRows.map((t) => {
            const platform = PLATFORM_LABELS[t.sourcePlatform ?? 'other'] ?? 'Other'
            const statusLabel = STATUS_LABELS[t.analysisStatus ?? 'pending'] ?? t.analysisStatus
            const isComplete = t.analysisStatus === 'complete'
            const isFailed = t.analysisStatus === 'failed'
            const isPending = !isComplete && !isFailed

            const interviewDateStr = t.interviewDate
              ? new Date(t.interviewDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : null

            return (
              <div key={t.id} className="rounded-lg border border-zinc-700 overflow-hidden">
                {/* Transcript header */}
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-800">
                  <div className="flex items-center gap-3">
                    <FileTextIcon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-zinc-200">{platform}</span>
                      {interviewDateStr && (
                        <span className="ml-2 text-xs text-zinc-500">{interviewDateStr}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      isComplete
                        ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                        : isFailed
                          ? 'bg-red-950 border-red-800 text-red-400'
                          : 'bg-amber-950 border-amber-800 text-amber-400'
                    }`}
                  >
                    {isPending && (
                      <ClockIcon className="inline h-3 w-3 mr-1 -mt-0.5" />
                    )}
                    {statusLabel}
                  </span>
                </div>

                {/* Analysis results */}
                {isComplete && t.overallScore !== null && (
                  <div className="p-4">
                    <TranscriptAnalysisView
                      analysis={{
                        overallScore: t.overallScore,
                        communicationScore: t.communicationScore ?? null,
                        communicationReasoning: t.communicationReasoning ?? null,
                        technicalDepthScore: t.technicalDepthScore ?? null,
                        technicalDepthReasoning: t.technicalDepthReasoning ?? null,
                        problemSolvingScore: t.problemSolvingScore ?? null,
                        problemSolvingReasoning: t.problemSolvingReasoning ?? null,
                        socialFitScore: t.socialFitScore ?? null,
                        socialFitReasoning: t.socialFitReasoning ?? null,
                        summary: t.summary ?? null,
                        strengths: t.strengths ?? null,
                        redFlags: t.redFlags ?? null,
                        recommendedDecision: t.recommendedDecision ?? null,
                        questionResponses: (t.questionResponses as QuestionResponse[]) ?? null,
                      }}
                    />
                  </div>
                )}

                {/* Failed state */}
                {isFailed && (
                  <div className="px-4 py-3 text-sm text-red-400">
                    Analysis failed
                    {t.errorMessage && (
                      <span className="text-red-500 ml-1">— {t.errorMessage}</span>
                    )}
                  </div>
                )}

                {/* Pending/analyzing state */}
                {isPending && (
                  <div className="px-4 py-3 text-sm text-zinc-500">
                    Analysis in progress — refresh the page to see results
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
