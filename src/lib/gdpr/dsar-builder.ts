/**
 * GDPR Article 15 DSAR ZIP builder.
 *
 * Gathers all data held for a candidate and streams it as a ZIP archive.
 * The caller (API route) receives the archiver stream and pipes it to the
 * Response body.
 *
 * No PII is modified here — this is a read-only export.
 */

import path from 'path'
import fs from 'fs'
import archiver from 'archiver'
import type { Archiver } from 'archiver'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  candidates,
  scores,
  notes,
  candidateEnrichments,
  cvProfiles,
  auditLogs,
  sentEmails,
  interviewPacks,
  interviewQuestions,
  codeChallenges,
  interviewSlots,
  interviewTranscripts,
  transcriptAnalyses,
  candidateRoleApprovals,
} from '@/db/schema'
import { getDsarCoverLetter } from './cover-letter'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve a DB-stored `/uploads/...` path to an absolute filesystem path. */
function resolveUploadPath(filePath: string): string {
  const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath
  return path.join(process.cwd(), relative)
}

/** Extract the file extension from a DB filePath, e.g. ".pdf". */
function extensionOf(filePath: string): string {
  return path.extname(filePath).toLowerCase() || '.bin'
}

// ---------------------------------------------------------------------------
// buildDsarZip
// ---------------------------------------------------------------------------

/**
 * Assembles a ZIP containing all data held for a candidate.
 *
 * Returns the archiver stream. The caller MUST consume the stream promptly;
 * `archive.finalize()` is called internally before this function returns.
 */
export async function buildDsarZip(
  candidateId: string,
  tenantId: string
): Promise<Archiver> {
  const archive = archiver('zip', { zlib: { level: 9 } })

  // Track errors — bubble them so the API route can return a 500
  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') console.error('[dsar] archiver warning:', err)
  })

  // Gather all data inside a single RLS-scoped transaction
  const data = await withTenant(tenantId, async (tx) => {
    // 1. Candidate row
    const [candidate] = await tx
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1)

    if (!candidate) return null

    // 2. All remaining queries in parallel — they all depend only on candidateId
    const [
      scoreRows,
      noteRows,
      enrichmentRows,
      cvProfileRows,
      auditRows,
      sentEmailRows,
      interviewSlotRows,
      approvalRows,
    ] = await Promise.all([
      tx.select().from(scores).where(eq(scores.candidateId, candidateId)),
      tx.select().from(notes).where(eq(notes.candidateId, candidateId)),
      tx.select().from(candidateEnrichments).where(eq(candidateEnrichments.candidateId, candidateId)),
      tx.select().from(cvProfiles).where(eq(cvProfiles.candidateId, candidateId)),
      tx.select().from(auditLogs).where(eq(auditLogs.entityId, candidateId)),
      tx.select().from(sentEmails).where(eq(sentEmails.candidateId, candidateId)),
      tx.select().from(interviewSlots).where(eq(interviewSlots.candidateId, candidateId)),
      tx.select().from(candidateRoleApprovals).where(eq(candidateRoleApprovals.candidateId, candidateId)),
    ])

    // 3. Interview packs + child tables (questions, challenges, transcripts)
    const packRows = await tx
      .select()
      .from(interviewPacks)
      .where(eq(interviewPacks.candidateId, candidateId))

    const packIds = packRows.map((p) => p.id)

    const [questionRows, challengeRows, transcriptRows] = await Promise.all([
      packIds.length > 0
        ? tx.select().from(interviewQuestions).where(
            // Drizzle inArray requires at least one value
            eq(interviewQuestions.packId, packIds[0]!)
          ).then(async (first) => {
            // Fetch questions for remaining packs if any
            if (packIds.length === 1) return first
            const rest = await Promise.all(
              packIds.slice(1).map((pid) =>
                tx.select().from(interviewQuestions).where(eq(interviewQuestions.packId, pid))
              )
            )
            return [...first, ...rest.flat()]
          })
        : Promise.resolve([]),
      packIds.length > 0
        ? tx.select().from(codeChallenges).where(eq(codeChallenges.packId, packIds[0]!)).then(async (first) => {
            if (packIds.length === 1) return first
            const rest = await Promise.all(
              packIds.slice(1).map((pid) =>
                tx.select().from(codeChallenges).where(eq(codeChallenges.packId, pid))
              )
            )
            return [...first, ...rest.flat()]
          })
        : Promise.resolve([]),
      tx.select().from(interviewTranscripts).where(eq(interviewTranscripts.candidateId, candidateId)),
    ])

    // 4. Transcript analyses (child of transcripts)
    const transcriptIds = transcriptRows.map((t) => t.id)
    const analysisRows = await (transcriptIds.length > 0
      ? Promise.all(
          transcriptIds.map((tid) =>
            tx.select().from(transcriptAnalyses).where(eq(transcriptAnalyses.transcriptId, tid))
          )
        ).then((nested) => nested.flat())
      : Promise.resolve([]))

    return {
      candidate,
      scoreRows,
      noteRows,
      enrichmentRows,
      cvProfileRows,
      auditRows,
      sentEmailRows,
      interviewSlotRows,
      approvalRows,
      packRows,
      questionRows,
      challengeRows,
      transcriptRows,
      analysisRows,
    }
  })

  if (!data) {
    // Return an empty archive with a note rather than throwing — the API
    // route will receive an empty ZIP which it can handle gracefully.
    archive.append('Candidate not found or access denied.', { name: 'ERROR.txt' })
    archive.finalize()
    return archive
  }

  const {
    candidate,
    scoreRows,
    noteRows,
    enrichmentRows,
    cvProfileRows,
    auditRows,
    sentEmailRows,
    interviewSlotRows,
    approvalRows,
    packRows,
    questionRows,
    challengeRows,
    transcriptRows,
    analysisRows,
  } = data

  const includedFiles: string[] = []

  // ---------------------------------------------------------------------------
  // Helper: append a JSON entry
  // ---------------------------------------------------------------------------
  function appendJson(name: string, payload: unknown) {
    archive.append(JSON.stringify(payload, null, 2), { name })
    includedFiles.push(name)
  }

  // 1. candidate.json
  appendJson('candidate.json', candidate)

  // 2. scores.json
  if (scoreRows.length > 0) {
    appendJson('scores.json', scoreRows)
  }

  // 3. notes.json
  if (noteRows.length > 0) {
    appendJson('notes.json', noteRows)
  }

  // 4. enrichment.json
  if (enrichmentRows.length > 0) {
    appendJson('enrichment.json', enrichmentRows[0])
  }

  // 5. cv-profile.json
  if (cvProfileRows.length > 0) {
    appendJson('cv-profile.json', cvProfileRows[0])
  }

  // 6. audit-log.json
  if (auditRows.length > 0) {
    appendJson('audit-log.json', auditRows)
  }

  // 7. sent-emails.json
  if (sentEmailRows.length > 0) {
    appendJson('sent-emails.json', sentEmailRows)
  }

  // 8. interview-packs.json (combined: packs + questions + challenges)
  if (packRows.length > 0) {
    const combined = packRows.map((p) => ({
      ...p,
      questions: questionRows.filter((q) => q.packId === p.id),
      codeChallenge: challengeRows.find((c) => c.packId === p.id) ?? null,
    }))
    appendJson('interview-packs.json', combined)
  }

  // 9. interview-slots.json
  if (interviewSlotRows.length > 0) {
    appendJson('interview-slots.json', interviewSlotRows)
  }

  // 10. interview-transcripts.json (combined: transcripts + analyses)
  if (transcriptRows.length > 0) {
    const combined = transcriptRows.map((t) => ({
      ...t,
      analysis: analysisRows.find((a) => a.transcriptId === t.id) ?? null,
    }))
    appendJson('interview-transcripts.json', combined)
  }

  // 11. approvals.json
  if (approvalRows.length > 0) {
    appendJson('approvals.json', approvalRows)
  }

  // 12. Synechron CV — stored as JSONB on the candidate row
  if (candidate.synechronCvData) {
    appendJson('synechron-cv.json', candidate.synechronCvData)
    includedFiles.push('synechron-cv.json')
  }

  // 13. CV file — read from disk if path is set
  if (candidate.filePath) {
    const absPath = resolveUploadPath(candidate.filePath)
    const ext = extensionOf(candidate.filePath)
    const cvFileName = `cv${ext}`

    try {
      if (fs.existsSync(absPath)) {
        archive.file(absPath, { name: cvFileName })
        includedFiles.push(cvFileName)
      }
    } catch {
      // CV file unreadable — omit from archive, do not fail the export
    }
  }

  // 14. README.txt cover letter
  const exportDate = new Date().toISOString()
  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim()
  const coverLetter = getDsarCoverLetter({
    candidateName,
    candidateId,
    exportDate,
    files: [...includedFiles, 'README.txt'],
  })
  archive.append(coverLetter, { name: 'README.txt' })

  // Finalize — must be called after all entries are queued
  archive.finalize()

  return archive
}
