/**
 * Export MCP tools — produce binary attachments (PDFs and the raw CV) so an
 * LLM client can attach them to an email/draft in a single tool call.
 *
 * Implementation rule from the wave 3b brief: do NOT call the REST export
 * routes from here. We import the canonical react-pdf renderers
 * (`CandidatePDF`, `RolePDF`, `ShortlistPDF`, `InterviewPackPDF`) directly and
 * render to a Buffer with `@react-pdf/renderer`'s `renderToBuffer`. The data
 * gathering mirrors the shape used by the REST routes (see
 * `src/app/api/export/...`).
 *
 * The killer workflow tool — `compose_candidate_email_attachments` —
 * delegates to the per-PDF helpers and the score/pack lookup so the LLM can
 * say "fetch everything for the email" once instead of orchestrating 3-4
 * tool calls.
 */

import { z } from 'zod'
import React from 'react'
import { join } from 'path'
import fs from 'fs/promises'
import { eq, and, desc, asc } from 'drizzle-orm'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import {
  candidates,
  scores,
  roles,
  agencies,
  customers,
  notes,
  interviewTranscripts,
  transcriptAnalyses,
  candidateEnrichments,
  interviewPacks,
  interviewQuestions,
  codeChallenges,
} from '@/db/schema'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'
import type { QuestionResponse } from '@/db/schema/transcript-analyses'
import {
  CandidatePDF,
  RolePDF,
  ShortlistPDF,
  InterviewPackPDF,
} from '@/lib/pdf'
import { getLogoAbsolutePath } from '@/lib/branding/store'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import { bufferToAttachment, fileToAttachment, type Attachment } from '../attachment'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// ─── Input schemas ────────────────────────────────────────────────────────────

export const ExportCandidateCvInput = {
  candidateId: z.string().uuid(),
}

export const ExportCandidatePdfInput = {
  candidateId: z.string().uuid(),
  roleId: z
    .string()
    .uuid()
    .optional()
    .describe('If supplied, the active score/role used in the PDF is the score for this role'),
}

export const ExportRolePdfInput = {
  roleId: z.string().uuid(),
}

export const ExportShortlistPdfInput = {
  roleId: z.string().uuid(),
  audience: z.enum(['recruiter', 'customer']).default('recruiter'),
}

export const ExportInterviewPackPdfInput = {
  packId: z.string().uuid(),
}

export const ComposeEmailInput = {
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
}

// ─── PDF MIME ─────────────────────────────────────────────────────────────────

const PDF_MIME = 'application/pdf'

// ─── Internal helpers (used by both per-PDF tools and compose) ───────────────

/**
 * Resolve a CV file's on-disk absolute path from the DB-stored relative path.
 * Mirrors the helper inside `deleteCvFile` in src/lib/cv/store.ts — no public
 * `getCvAbsolutePath` exists at the moment, so this is the same one-line rule.
 */
function resolveCvAbsolutePath(filePath: string): string {
  const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath
  return join(process.cwd(), relative)
}

/**
 * Render the candidate CV file to an Attachment. If the candidate has no
 * stored file path or the file is missing, returns null. We always declare
 * the MIME via the fileType column (already canonicalised at upload time).
 */
async function fetchCandidateCvAttachment(
  tenantId: string,
  candidateId: string
): Promise<Attachment | null> {
  const [cand] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        filePath: candidates.filePath,
        fileType: candidates.fileType,
      })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!cand || !cand.filePath || !cand.fileType) return null
  const abs = resolveCvAbsolutePath(cand.filePath)
  // Map fileType to MIME for the attachment header.
  const mime: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    rtf: 'application/rtf',
    txt: 'text/plain',
    md: 'text/markdown',
  }
  const filename = `${cand.firstName}-${cand.lastName}-cv.${cand.fileType}`
  try {
    return await fileToAttachment(abs, filename, mime[cand.fileType] ?? 'application/octet-stream')
  } catch {
    return null
  }
}

/**
 * Build the full data bundle the CandidatePDF needs and render it. Audience
 * gates which fields are visible inside the PDF; sanitisation of the DB-side
 * data happens in the REST export route for customer audiences. We keep the
 * same data set on the MCP path because the prop itself controls visibility.
 */
async function renderCandidatePdf(
  tenantId: string,
  candidateId: string,
  audience: 'internal' | 'customer',
  roleIdHint?: string
): Promise<Attachment | null> {
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
          .select({
            transcript_analyses: transcriptAnalyses,
            interview_transcripts: interviewTranscripts,
          })
          .from(transcriptAnalyses)
          .innerJoin(
            interviewTranscripts,
            eq(transcriptAnalyses.transcriptId, interviewTranscripts.id)
          )
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

  if (!data) return null
  const { candidate, agencyResult, allScores, analyses, candidateNotes, enrichmentResult } = data
  const agency = agencyResult[0] ?? null
  const enrichmentRow = enrichmentResult[0] ?? null

  // Pick active score: prefer the hinted role, then any complete score, then
  // any score at all. Mirrors the REST route fallback logic.
  let activeScore = null
  let activeRole = null
  if (roleIdHint) {
    const match = allScores.find((s) => s.score.roleId === roleIdHint)
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

  const rawAnalyses = analyses.map((a) => ({
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

  // For customer PDFs we mirror the REST route's redaction: drop notes,
  // suppress redFlags / recommendedDecision, blank low-score reasoning.
  const finalAnalyses =
    audience === 'customer'
      ? rawAnalyses.map((a) => {
          const blank = (r: string | null, s: number | null) =>
            s !== null && s < 60 ? null : r
          const safeQR: QuestionResponse[] | null = Array.isArray(a.questionResponses)
            ? (a.questionResponses as QuestionResponse[]).filter(
                (q) => q.quality !== 'weak'
              )
            : (a.questionResponses as QuestionResponse[] | null)
          return {
            ...a,
            redFlags: null,
            recommendedDecision: null,
            communicationReasoning: blank(a.communicationReasoning, a.communicationScore),
            technicalDepthReasoning: blank(a.technicalDepthReasoning, a.technicalDepthScore),
            problemSolvingReasoning: blank(a.problemSolvingReasoning, a.problemSolvingScore),
            socialFitReasoning: blank(a.socialFitReasoning, a.socialFitScore),
            questionResponses: safeQR,
          }
        })
      : rawAnalyses
  const finalNotes =
    audience === 'customer'
      ? []
      : candidateNotes.map((n) => ({ body: n.body, createdAt: n.createdAt, isEdited: n.isEdited }))

  // Inline the agency logo (internal PDFs only) — tolerant of missing file.
  let agencyLogoBase64: string | undefined
  if (audience === 'internal' && agency?.logoPath) {
    try {
      const absPath = getLogoAbsolutePath(agency.logoPath)
      const logoBuffer = await fs.readFile(absPath)
      const ext = agency.logoPath.split('.').pop()?.toLowerCase() ?? 'png'
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'svg'
              ? 'image/svg+xml'
              : 'image/png'
      agencyLogoBase64 = `data:${mime};base64,${logoBuffer.toString('base64')}`
    } catch {
      // swallow — logo is best-effort
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
    // @react-pdf JSX typing wrinkle — same `as any` used by the REST routes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )

  const filename =
    audience === 'customer'
      ? `customer-profile-${candidate.firstName}-${candidate.lastName}.pdf`
      : `${candidate.firstName}-${candidate.lastName}-profile.pdf`
  return bufferToAttachment(buffer, filename, PDF_MIME)
}

/**
 * Render the role brief PDF.
 */
async function renderRolePdf(tenantId: string, roleId: string): Promise<Attachment | null> {
  const result = await withTenant(tenantId, async (tx) => {
    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
    if (!role) return null
    let customerName: string | null = null
    if (role.customerId) {
      const [customer] = await tx
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, role.customerId!))
        .limit(1)
      customerName = customer?.name ?? null
    }
    return { role, customerName }
  })
  if (!result) return null
  const { role, customerName } = result
  const buffer = await renderToBuffer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React.createElement(RolePDF, { role, customerName }) as any
  )
  return bufferToAttachment(
    buffer,
    `role-${role.title.replace(/\s+/g, '-')}.pdf`,
    PDF_MIME
  )
}

/**
 * Render the shortlist PDF for a role. `audience` here is the same shape as
 * the REST route — recruiter (internal) keeps notes/rates/margin, customer
 * has them suppressed by upstream logic. Since ShortlistPDF itself accepts
 * the entries verbatim, the audience flag mainly drives margin omission for
 * customer (when role.customerDayRate is masked we skip the margin calc).
 */
async function renderShortlistPdf(
  tenantId: string,
  roleId: string,
  audience: 'recruiter' | 'customer'
): Promise<Attachment | null> {
  const result = await withTenant(tenantId, async (tx) => {
    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
    if (!role) return null
    const candidateScores = await tx
      .select({ candidate: candidates, score: scores })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(and(eq(scores.roleId, roleId), eq(scores.scoreStatus, 'complete')))
      .orderBy(desc(scores.overallScore))
      .limit(100)
    const agencyRows = await tx.select({ id: agencies.id, name: agencies.name }).from(agencies)
    const agencyMap = new Map(agencyRows.map((a) => [a.id, a.name]))
    let customerName: string | null = null
    if (role.customerId) {
      const [customer] = await tx
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, role.customerId!))
        .limit(1)
      customerName = customer?.name ?? null
    }
    return { role, candidateScores, agencyMap, customerName }
  })
  if (!result) return null
  const { role, candidateScores, agencyMap, customerName } = result
  const entries = candidateScores.map(({ candidate, score }) => {
    let margin: { amount: number; currency: string; mismatch: boolean } | null = null
    // For customer audience, hide the recruiter-side margin calculation.
    if (audience === 'recruiter' && role.customerDayRate && candidate.candidateRate) {
      const mismatch = Boolean(
        role.rateCurrency && candidate.rateCurrency && role.rateCurrency !== candidate.rateCurrency
      )
      margin = {
        amount: Number(role.customerDayRate) - Number(candidate.candidateRate),
        currency: role.rateCurrency ?? candidate.rateCurrency ?? '',
        mismatch,
      }
    }
    return {
      candidate,
      score,
      agencyName: candidate.agencyId ? (agencyMap.get(candidate.agencyId) ?? null) : null,
      margin,
    }
  })
  const buffer = await renderToBuffer(
    React.createElement(ShortlistPDF, {
      entries,
      roleTitle: role.title,
      role,
      customerName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )
  const stem = audience === 'customer' ? 'shortlist-customer' : 'shortlist'
  return bufferToAttachment(
    buffer,
    `${stem}-${role.title.replace(/\s+/g, '-')}.pdf`,
    PDF_MIME
  )
}

/**
 * Render an interview pack PDF. Returns null if the pack is missing or not
 * yet complete.
 */
async function renderInterviewPackPdf(
  tenantId: string,
  packId: string
): Promise<Attachment | null> {
  const result = await withTenant(tenantId, async (tx) => {
    const [pack] = await tx
      .select()
      .from(interviewPacks)
      .where(and(eq(interviewPacks.id, packId), eq(interviewPacks.tenantId, tenantId)))
      .limit(1)
    if (!pack) return null
    if (pack.generationStatus !== 'complete') return null
    const [candidate] = await tx
      .select()
      .from(candidates)
      .where(eq(candidates.id, pack.candidateId))
      .limit(1)
    const [role] = await tx.select().from(roles).where(eq(roles.id, pack.roleId)).limit(1)
    const questions = await tx
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.packId, packId))
      .orderBy(asc(interviewQuestions.orderIndex))
    const [codeChallenge] = await tx
      .select()
      .from(codeChallenges)
      .where(eq(codeChallenges.packId, packId))
      .limit(1)
    return { pack, candidate, role, questions, codeChallenge: codeChallenge ?? null }
  })
  if (!result) return null
  const { pack, candidate, role, questions, codeChallenge } = result
  const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Candidate'
  const roleTitle = role?.title ?? 'Unknown Role'
  const buffer = await renderToBuffer(
    React.createElement(InterviewPackPDF, {
      pack,
      questions,
      codeChallenge,
      candidateName,
      roleTitle,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )
  return bufferToAttachment(
    buffer,
    `interview-pack-${candidateName.replace(/\s+/g, '-')}.pdf`,
    PDF_MIME
  )
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerExportTools(server: McpServer, ctx: McpContext): void {
  // -- export_candidate_cv_pdf -------------------------------------------------
  server.registerTool(
    'export_candidate_cv_pdf',
    {
      title: 'Export candidate CV (raw file)',
      description:
        'Return the candidate\'s stored CV file as a base64 attachment. The file is whatever ' +
        'format was uploaded (PDF/DOCX/ODT/RTF/TXT/MD) — not necessarily PDF. Returns null ' +
        'attachment if the candidate has no stored file.',
      inputSchema: ExportCandidateCvInput,
    },
    async (args) =>
      runTool(ctx, 'export_candidate_cv_pdf', 'read', false, args, async () => {
        const att = await fetchCandidateCvAttachment(ctx.tenantId, args.candidateId)
        return jsonResult({ attachment: att })
      })
  )

  // -- export_candidate_internal_pdf -------------------------------------------
  server.registerTool(
    'export_candidate_internal_pdf',
    {
      title: 'Export candidate profile PDF (internal)',
      description:
        'Render the full internal candidate profile PDF — includes scores, agency, rates, ' +
        'recruiter notes, transcript red flags, and recommended decision. If roleId is supplied ' +
        'the PDF\'s "active role" section uses that role\'s score; otherwise the most recent ' +
        'complete score is used.',
      inputSchema: ExportCandidatePdfInput,
    },
    async (args) =>
      runTool(ctx, 'export_candidate_internal_pdf', 'read', false, args, async () => {
        const att = await renderCandidatePdf(
          ctx.tenantId,
          args.candidateId,
          'internal',
          args.roleId
        )
        return jsonResult({ attachment: att })
      })
  )

  // -- export_candidate_customer_pdf -------------------------------------------
  server.registerTool(
    'export_candidate_customer_pdf',
    {
      title: 'Export candidate profile PDF (customer-safe)',
      description:
        'Render the customer-facing candidate profile PDF — strips recruiter notes, candidate ' +
        'rate, margin, red flags, recommended decision, and blanks low-confidence transcript ' +
        'reasoning. Safe to forward outside the company.',
      inputSchema: ExportCandidatePdfInput,
    },
    async (args) =>
      runTool(ctx, 'export_candidate_customer_pdf', 'read', false, args, async () => {
        const att = await renderCandidatePdf(
          ctx.tenantId,
          args.candidateId,
          'customer',
          args.roleId
        )
        return jsonResult({ attachment: att })
      })
  )

  // -- export_role_brief_pdf ---------------------------------------------------
  server.registerTool(
    'export_role_brief_pdf',
    {
      title: 'Export role brief PDF',
      description:
        'Render a one-role-brief PDF with title, customer, location, work mode, language ' +
        'requirements, key skills, top requirements, budget, and the full description + requirements.',
      inputSchema: ExportRolePdfInput,
    },
    async (args) =>
      runTool(ctx, 'export_role_brief_pdf', 'read', false, args, async () => {
        const att = await renderRolePdf(ctx.tenantId, args.roleId)
        return jsonResult({ attachment: att })
      })
  )

  // -- export_shortlist_pdf ----------------------------------------------------
  server.registerTool(
    'export_shortlist_pdf',
    {
      title: 'Export shortlist PDF',
      description:
        'Render the ranked shortlist for a role as a single PDF. audience="recruiter" includes ' +
        'agency + margin per candidate; audience="customer" suppresses the margin column.',
      inputSchema: ExportShortlistPdfInput,
    },
    async (args) =>
      runTool(ctx, 'export_shortlist_pdf', 'read', false, args, async () => {
        const audience = args.audience ?? 'recruiter'
        const att = await renderShortlistPdf(ctx.tenantId, args.roleId, audience)
        return jsonResult({ attachment: att })
      })
  )

  // -- export_interview_pack_pdf -----------------------------------------------
  server.registerTool(
    'export_interview_pack_pdf',
    {
      title: 'Export interview pack PDF',
      description:
        'Render a fully-generated interview pack (questions + optional code challenge) as a PDF. ' +
        'Returns null attachment if the pack does not exist or has not finished generating ' +
        '(generationStatus must be "complete").',
      inputSchema: ExportInterviewPackPdfInput,
    },
    async (args) =>
      runTool(ctx, 'export_interview_pack_pdf', 'read', false, args, async () => {
        const att = await renderInterviewPackPdf(ctx.tenantId, args.packId)
        return jsonResult({ attachment: att })
      })
  )

  // -- compose_candidate_email_attachments -------------------------------------
  server.registerTool(
    'compose_candidate_email_attachments',
    {
      title: 'Compose candidate email attachments',
      description:
        'Killer-workflow tool. Returns everything an LLM needs to draft an email about a ' +
        'candidate-on-a-role in a single call: { candidate, role, attachments: { cv, ' +
        'interviewPack?, scoreSummary } }. Sub-fetches: (1) the raw CV file from disk, (2) the ' +
        'most recent interview pack for this candidate × role pair (omitted if none exists or ' +
        'the latest is not yet complete), (3) the structured score record (overall, dimensions, ' +
        'reasoning, summary). Read-only; no confirm.',
      inputSchema: ComposeEmailInput,
    },
    async (args) =>
      runTool(ctx, 'compose_candidate_email_attachments', 'read', false, args, async () => {
        const { tenantId } = ctx
        // Fetch all three sub-pieces in parallel within one withTenant for the
        // metadata reads; the CV read is filesystem so it sits outside.
        const meta = await withTenant(tenantId, async (tx) => {
          const [cand] = await tx
            .select({
              id: candidates.id,
              firstName: candidates.firstName,
              lastName: candidates.lastName,
            })
            .from(candidates)
            .where(and(eq(candidates.id, args.candidateId), eq(candidates.tenantId, tenantId)))
            .limit(1)
          const [role] = await tx
            .select({ id: roles.id, title: roles.title })
            .from(roles)
            .where(and(eq(roles.id, args.roleId), eq(roles.tenantId, tenantId)))
            .limit(1)
          const [scoreRow] = await tx
            .select()
            .from(scores)
            .where(
              and(eq(scores.candidateId, args.candidateId), eq(scores.roleId, args.roleId))
            )
            .limit(1)
          // Most recent interview pack (any status) for this pair — we'll
          // only attempt to render the PDF if it's complete.
          const [latestPack] = await tx
            .select()
            .from(interviewPacks)
            .where(
              and(
                eq(interviewPacks.candidateId, args.candidateId),
                eq(interviewPacks.roleId, args.roleId)
              )
            )
            .orderBy(desc(interviewPacks.createdAt))
            .limit(1)
          return { cand, role, scoreRow, latestPack }
        })

        if (!meta.cand) throw new Error('Candidate not found')
        if (!meta.role) throw new Error('Role not found')

        const cv = await fetchCandidateCvAttachment(tenantId, args.candidateId)
        let interviewPack: Attachment | null = null
        if (meta.latestPack && meta.latestPack.generationStatus === 'complete') {
          interviewPack = await renderInterviewPackPdf(tenantId, meta.latestPack.id)
        }

        const scoreSummary = meta.scoreRow
          ? {
              status: meta.scoreRow.scoreStatus,
              overall: meta.scoreRow.overallScore,
              dimensions: {
                technical: meta.scoreRow.technicalScore,
                experience: meta.scoreRow.experienceScore,
                culturalFit: meta.scoreRow.culturalFitScore,
                communication: meta.scoreRow.communicationScore,
              },
              summary: meta.scoreRow.aiSummary,
              reasoning: {
                technical: meta.scoreRow.technicalReasoning,
                experience: meta.scoreRow.experienceReasoning,
                culturalFit: meta.scoreRow.culturalFitReasoning,
                communication: meta.scoreRow.communicationReasoning,
              },
            }
          : null

        return jsonResult({
          candidate: {
            id: meta.cand.id,
            name: `${meta.cand.firstName} ${meta.cand.lastName}`,
          },
          role: { id: meta.role.id, title: meta.role.title },
          attachments: {
            cv,
            interviewPack,
            scoreSummary,
          },
        })
      })
  )
}
