import { NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import {
  candidates,
  scores,
  roles,
  agencies,
  notes,
  interviewTranscripts,
  transcriptAnalyses,
  candidateEnrichments,
} from '@/db/schema'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'
import { CandidatePDF } from '@/lib/pdf'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { candidateId } = await params
  const { searchParams } = new URL(req.url)
  const roleId = searchParams.get('roleId')

  // Fetch the candidate first — all subsequent queries depend on it existing
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Agency fetch depends on candidate.agencyId, so it runs after candidate resolves
  // All other queries are independent of each other and run in parallel
  const [agencyResult, allScores, analyses, candidateNotes, enrichmentResult] =
    await Promise.all([
      candidate.agencyId
        ? withTenant(tenantId, async (tx) =>
            tx.select().from(agencies).where(eq(agencies.id, candidate.agencyId!)).limit(1)
          )
        : Promise.resolve([null]),

      // ALL scores for this candidate joined with role titles, newest first
      withTenant(tenantId, async (tx) =>
        tx
          .select({ score: scores, role: roles })
          .from(scores)
          .innerJoin(roles, eq(scores.roleId, roles.id))
          .where(eq(scores.candidateId, candidateId))
          .orderBy(desc(scores.updatedAt))
      ),

      // Transcript analyses joined with transcripts to filter by candidateId
      withTenant(tenantId, async (tx) =>
        tx
          .select({ transcript_analyses: transcriptAnalyses, interview_transcripts: interviewTranscripts })
          .from(transcriptAnalyses)
          .innerJoin(
            interviewTranscripts,
            eq(transcriptAnalyses.transcriptId, interviewTranscripts.id)
          )
          .where(eq(interviewTranscripts.candidateId, candidateId))
          .orderBy(desc(transcriptAnalyses.createdAt))
      ),

      // Candidate notes, newest first
      withTenant(tenantId, async (tx) =>
        tx
          .select()
          .from(notes)
          .where(eq(notes.candidateId, candidateId))
          .orderBy(desc(notes.createdAt))
      ),

      // Enrichment — at most one row per candidate
      withTenant(tenantId, async (tx) =>
        tx
          .select()
          .from(candidateEnrichments)
          .where(eq(candidateEnrichments.candidateId, candidateId))
          .limit(1)
      ),
    ])

  const agency = agencyResult[0] ?? null
  const enrichmentRow = enrichmentResult[0] ?? null

  // Determine the active score/role: prefer the ?roleId param, fall back to the
  // first completed score in the history, then any score.
  let activeScore = null
  let activeRole = null

  if (roleId) {
    const match = allScores.find((s) => s.score.roleId === roleId)
    if (match) {
      activeScore = match.score
      activeRole = match.role
    }
  }

  if (!activeScore) {
    const firstComplete = allScores.find((s) => s.score.scoreStatus === 'complete')
    const fallback = firstComplete ?? allScores[0]
    if (fallback) {
      activeScore = fallback.score
      activeRole = fallback.role
    }
  }

  const buffer = await renderToBuffer(
    React.createElement(CandidatePDF, {
      candidate,
      agencyName: agency?.name ?? null,
      activeScore,
      activeRole,
      roleHistory: allScores
        .filter((s) => s.score.scoreStatus === 'complete')
        .map((s) => ({
          roleTitle: s.role.title,
          overallScore: s.score.overallScore,
          technicalScore: s.score.technicalScore,
          experienceScore: s.score.experienceScore,
          culturalFitScore: s.score.culturalFitScore,
          communicationScore: s.score.communicationScore,
          scoredAt: s.score.updatedAt,
        })),
      transcriptAnalyses: analyses.map((a) => ({
        overallScore: a.transcript_analyses.overallScore,
        communicationScore: a.transcript_analyses.communicationScore,
        technicalDepthScore: a.transcript_analyses.technicalDepthScore,
        problemSolvingScore: a.transcript_analyses.problemSolvingScore,
        socialFitScore: a.transcript_analyses.socialFitScore,
        communicationReasoning: a.transcript_analyses.communicationReasoning,
        technicalDepthReasoning: a.transcript_analyses.technicalDepthReasoning,
        problemSolvingReasoning: a.transcript_analyses.problemSolvingReasoning,
        socialFitReasoning: a.transcript_analyses.socialFitReasoning,
        summary: a.transcript_analyses.summary,
        strengths: a.transcript_analyses.strengths,
        redFlags: a.transcript_analyses.redFlags,
        recommendedDecision: a.transcript_analyses.recommendedDecision,
        questionResponses: a.transcript_analyses.questionResponses,
        createdAt: a.transcript_analyses.createdAt,
      })),
      notes: candidateNotes.map((n) => ({
        body: n.body,
        createdAt: n.createdAt,
        isEdited: n.isEdited,
      })),
      enrichment: enrichmentRow
        ? {
            webHits: (enrichmentRow.webHits ?? []) as WebHit[],
            githubProfile: (enrichmentRow.githubProfile ?? null) as GitHubProfile | null,
          }
        : null,
      generatedAt: new Date(),
    }) as any
  )

  const filename = `${candidate.firstName}-${candidate.lastName}-profile.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
