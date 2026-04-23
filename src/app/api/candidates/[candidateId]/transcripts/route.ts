/**
 * GET /api/candidates/[candidateId]/transcripts
 *
 * Returns paginated list of transcripts for a candidate,
 * including analysis summary if available.
 */

import { NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewTranscripts, transcriptAnalyses } from '@/db/schema'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const { candidateId } = await params

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? 20)), 100)
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0))

  const transcripts = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: interviewTranscripts.id,
        roleId: interviewTranscripts.roleId,
        packId: interviewTranscripts.packId,
        sourcePlatform: interviewTranscripts.sourcePlatform,
        sourceFormat: interviewTranscripts.sourceFormat,
        interviewDate: interviewTranscripts.interviewDate,
        analysisStatus: interviewTranscripts.analysisStatus,
        errorMessage: interviewTranscripts.errorMessage,
        createdAt: interviewTranscripts.createdAt,
        overallScore: transcriptAnalyses.overallScore,
        recommendedDecision: transcriptAnalyses.recommendedDecision,
        summary: transcriptAnalyses.summary,
      })
      .from(interviewTranscripts)
      .leftJoin(
        transcriptAnalyses,
        eq(transcriptAnalyses.transcriptId, interviewTranscripts.id)
      )
      .where(eq(interviewTranscripts.candidateId, candidateId))
      .orderBy(desc(interviewTranscripts.createdAt))
      .limit(limit)
      .offset(offset)
  )

  return NextResponse.json({ transcripts, limit, offset })
}
