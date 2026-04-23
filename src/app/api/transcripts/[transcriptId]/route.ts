/**
 * GET /api/transcripts/[transcriptId]
 *
 * Returns the full transcript record with joined analysis (if complete).
 */

import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewTranscripts, transcriptAnalyses } from '@/db/schema'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transcriptId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const { transcriptId } = await params

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: interviewTranscripts.id,
        candidateId: interviewTranscripts.candidateId,
        roleId: interviewTranscripts.roleId,
        packId: interviewTranscripts.packId,
        rawTranscriptText: interviewTranscripts.rawTranscriptText,
        parsedTranscript: interviewTranscripts.parsedTranscript,
        sourcePlatform: interviewTranscripts.sourcePlatform,
        sourceFormat: interviewTranscripts.sourceFormat,
        interviewDate: interviewTranscripts.interviewDate,
        analysisStatus: interviewTranscripts.analysisStatus,
        errorMessage: interviewTranscripts.errorMessage,
        createdAt: interviewTranscripts.createdAt,
        analysis: {
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
        },
      })
      .from(interviewTranscripts)
      .leftJoin(
        transcriptAnalyses,
        eq(transcriptAnalyses.transcriptId, interviewTranscripts.id)
      )
      .where(eq(interviewTranscripts.id, transcriptId))
      .limit(1)
  )

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(row)
}
