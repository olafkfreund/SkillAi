import { NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import fs from 'fs/promises'
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
  customers,
} from '@/db/schema'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'
import { CandidatePDF } from '@/lib/pdf'
import { getLogoAbsolutePath } from '@/lib/branding/store'

type Audience = 'internal' | 'customer'

type TranscriptAnalysisEntry = {
  overallScore: number | null
  communicationScore: number | null
  technicalDepthScore: number | null
  problemSolvingScore: number | null
  socialFitScore: number | null
  communicationReasoning: string | null
  technicalDepthReasoning: string | null
  problemSolvingReasoning: string | null
  socialFitReasoning: string | null
  summary: string | null
  strengths: string[] | null
  redFlags: string[] | null
  recommendedDecision: 'proceed' | 'consider' | 'decline' | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  questionResponses: any
  createdAt: Date
}

/**
 * Produce customer-safe copies of transcript analyses by:
 * - dropping redFlags and recommendedDecision
 * - blanking reasoning text for dimension scores below 60
 * - filtering out question responses with quality === 'weak'
 * Does not mutate the input.
 */
function sanitizeAnalysesForCustomer(analyses: TranscriptAnalysisEntry[]): TranscriptAnalysisEntry[] {
  return analyses.map((a) => {
    const blankIfLow = (reasoning: string | null, score: number | null) =>
      score !== null && score < 60 ? null : reasoning

    const safeQR = Array.isArray(a.questionResponses)
      ? (a.questionResponses as Array<{ quality?: string }>).filter(
          (q) => q.quality !== 'weak'
        )
      : a.questionResponses

    return {
      ...a,
      redFlags: null,
      recommendedDecision: null,
      communicationReasoning: blankIfLow(a.communicationReasoning, a.communicationScore),
      technicalDepthReasoning: blankIfLow(a.technicalDepthReasoning, a.technicalDepthScore),
      problemSolvingReasoning: blankIfLow(a.problemSolvingReasoning, a.problemSolvingScore),
      socialFitReasoning: blankIfLow(a.socialFitReasoning, a.socialFitScore),
      questionResponses: safeQR,
    }
  })
}

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
  const audience: Audience = searchParams.get('audience') === 'customer' ? 'customer' : 'internal'

  console.log(`[pdf-export] candidateId=${candidateId} audience=${audience} roleId=${roleId ?? 'none'}`)

  try {

  // Single withTenant call — one RLS context setup for all queries
  const data = await withTenant(tenantId, async (tx) => {
    const [candidate] = await tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)

    if (!candidate) return null

    const [agencyResult, allScores, analyses, candidateNotes, enrichmentResult] =
      await Promise.all([
        candidate.agencyId
          ? tx.select().from(agencies).where(eq(agencies.id, candidate.agencyId!)).limit(1)
          : Promise.resolve([null]),
        tx
          .select({ score: scores, role: roles })
          .from(scores)
          .innerJoin(roles, eq(scores.roleId, roles.id))
          .where(eq(scores.candidateId, candidateId))
          .orderBy(desc(scores.updatedAt)),
        tx
          .select({ transcript_analyses: transcriptAnalyses, interview_transcripts: interviewTranscripts })
          .from(transcriptAnalyses)
          .innerJoin(interviewTranscripts, eq(transcriptAnalyses.transcriptId, interviewTranscripts.id))
          .where(eq(interviewTranscripts.candidateId, candidateId))
          .orderBy(desc(transcriptAnalyses.createdAt)),
        tx
          .select()
          .from(notes)
          .where(eq(notes.candidateId, candidateId))
          .orderBy(desc(notes.createdAt)),
        tx
          .select()
          .from(candidateEnrichments)
          .where(eq(candidateEnrichments.candidateId, candidateId))
          .limit(1),
      ])

    return { candidate, agencyResult, allScores, analyses, candidateNotes, enrichmentResult }
  })

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { candidate, agencyResult, allScores, analyses, candidateNotes, enrichmentResult } = data

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

  // Fetch the per-customer "role ID" label for the active role's customer, so
  // the PDF can render e.g. "Requisition #" instead of the generic fallback.
  let activeRoleCustomerRoleIdLabel: string | null = null
  if (activeRole?.customerId) {
    const [customer] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ roleIdLabel: customers.roleIdLabel })
        .from(customers)
        .where(eq(customers.id, activeRole!.customerId!))
        .limit(1)
    )
    activeRoleCustomerRoleIdLabel = customer?.roleIdLabel ?? null
  }

  const rawAnalyses: TranscriptAnalysisEntry[] = analyses.map((a) => ({
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
  }))

  const finalAnalyses = audience === 'customer' ? sanitizeAnalysesForCustomer(rawAnalyses) : rawAnalyses
  const finalNotes = audience === 'customer' ? [] : candidateNotes.map((n) => ({
    body: n.body,
    createdAt: n.createdAt,
    isEdited: n.isEdited,
  }))

  // Best-effort: read agency logo from disk and encode as base64 data URI.
  // Only for internal PDFs — customer PDFs hide agency info entirely.
  let agencyLogoBase64: string | undefined
  if (audience === 'internal' && agency?.logoPath) {
    try {
      const absPath = getLogoAbsolutePath(agency.logoPath)
      const logoBuffer = await fs.readFile(absPath)
      const ext = agency.logoPath.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : ext === 'svg' ? 'image/svg+xml'
        : 'image/png'
      agencyLogoBase64 = `data:${mime};base64,${logoBuffer.toString('base64')}`
    } catch {
      // File unreadable — proceed without logo
    }
  }

  const buffer = await renderToBuffer(
    React.createElement(CandidatePDF, {
      candidate,
      agencyName: agency?.name ?? null,
      agencyLogoBase64,
      audience,
      activeScore,
      activeRole,
      activeRoleCustomerRoleIdLabel,
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
      transcriptAnalyses: finalAnalyses,
      notes: finalNotes,
      enrichment: enrichmentRow
        ? {
            webHits: (enrichmentRow.webHits ?? []) as WebHit[],
            githubProfile: (enrichmentRow.githubProfile ?? null) as GitHubProfile | null,
          }
        : null,
      generatedAt: new Date(),
    }) as any
  )

  const filename = audience === 'customer'
    ? `customer-profile-${candidate.firstName}-${candidate.lastName}.pdf`
    : `${candidate.firstName}-${candidate.lastName}-profile.pdf`

  console.log(`[pdf-export] ✓ rendered ${filename} (${buffer.length} bytes)`)

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // `inline` lets the browser display the PDF in a new tab (via the
      // button's target="_blank"). The filename is still honoured when
      // the user hits "Save" in the PDF viewer.
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
  } catch (err) {
    console.error('[pdf-export] FAILED:', err instanceof Error ? err.stack : err)
    return NextResponse.json(
      { error: 'PDF generation failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
