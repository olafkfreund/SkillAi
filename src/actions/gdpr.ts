'use server'

/**
 * GDPR actions — admin-only operations for data subject rights compliance.
 *
 * Article 17 (Right to Erasure):
 *   deleteCandidateForGdpr — hard-deletes a candidate and all associated data,
 *   redacts audit log PII, and removes the CV file from disk.
 */

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import {
  candidates,
  scores,
  notes,
  roleSubmissions,
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
import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'
import { emitAudit } from '@/lib/audit-middleware'
import { deleteCvFile } from '@/lib/cv/store'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const DeleteCandidateGdprSchema = z.object({
  candidateId: z.string().uuid('candidateId must be a valid UUID'),
  typedConfirmation: z.string().min(1, 'Confirmation name is required'),
})

export type DeleteCandidateGdprInput = z.infer<typeof DeleteCandidateGdprSchema>

export type DeleteCandidateGdprResult =
  | { ok: true }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// deleteCandidateForGdpr
// ---------------------------------------------------------------------------

/**
 * Hard-deletes a candidate and all associated child data as required under
 * GDPR Article 17 (Right to Erasure).
 *
 * - Requires admin role.
 * - Requires the caller to type the candidate's full name as confirmation.
 * - Deletes child rows in FK-safe dependency order inside a transaction.
 * - Redacts (does NOT delete) existing audit_logs rows for this candidate so
 *   the audit trail is preserved without PII.
 * - Removes the CV file from disk after the transaction commits.
 * - Writes a tombstone audit entry.
 */
export async function deleteCandidateForGdpr(
  input: DeleteCandidateGdprInput
): Promise<DeleteCandidateGdprResult> {
  // 1. Validate input
  const parsed = DeleteCandidateGdprSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }
  const { candidateId, typedConfirmation } = parsed.data

  // 2. Get action context (tenant + user)
  const ctx = await getActionContext()
  if (!ctx) {
    return { ok: false, error: 'Unauthorized' }
  }
  const { tenantId, userRole } = ctx

  // 3. Admin-only
  try {
    requireRole(userRole, 'admin')
  } catch {
    return { ok: false, error: 'Forbidden: admin role required' }
  }

  // 4. Load candidate to verify existence and get confirmation name + file paths
  const candidateRow = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        filePath: candidates.filePath,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.tenantId, tenantId)
        )
      )
      .limit(1)
    return row ?? null
  })

  if (!candidateRow) {
    return { ok: false, error: 'Candidate not found' }
  }

  // 5. Verify typed confirmation — must match "<firstName> <lastName>" exactly (case-sensitive)
  const expectedName = `${candidateRow.firstName} ${candidateRow.lastName}`
  if (typedConfirmation !== expectedName) {
    return { ok: false, error: 'Confirmation name does not match' }
  }

  // 6. Capture file path before deletion (used after tx commits)
  const cvFilePath = candidateRow.filePath ?? null

  // 7. Delete in dependency order inside a single transaction
  await withTenant(tenantId, async (tx) => {
    // ---- Grand-children of interview_packs ---------------------------------
    // Collect pack IDs for this candidate first so we can cascade manually.
    const packRows = await tx
      .select({ id: interviewPacks.id })
      .from(interviewPacks)
      .where(eq(interviewPacks.candidateId, candidateId))

    const packIds = packRows.map((p) => p.id)

    if (packIds.length > 0) {
      // interview_questions (FK → pack_id)
      for (const pid of packIds) {
        await tx
          .delete(interviewQuestions)
          .where(eq(interviewQuestions.packId, pid))
      }
      // code_challenges (FK → pack_id)
      for (const pid of packIds) {
        await tx
          .delete(codeChallenges)
          .where(eq(codeChallenges.packId, pid))
      }
    }

    // ---- Grand-children of interview_transcripts ---------------------------
    const transcriptRows = await tx
      .select({ id: interviewTranscripts.id })
      .from(interviewTranscripts)
      .where(eq(interviewTranscripts.candidateId, candidateId))

    const transcriptIds = transcriptRows.map((t) => t.id)

    if (transcriptIds.length > 0) {
      // transcript_analyses (FK → transcript_id)
      for (const tid of transcriptIds) {
        await tx
          .delete(transcriptAnalyses)
          .where(eq(transcriptAnalyses.transcriptId, tid))
      }
    }

    // ---- Direct children of candidates (FK → candidate_id) -----------------

    // sent_emails
    await tx
      .delete(sentEmails)
      .where(eq(sentEmails.candidateId, candidateId))

    // interview_transcripts (after their analyses are gone)
    await tx
      .delete(interviewTranscripts)
      .where(eq(interviewTranscripts.candidateId, candidateId))

    // interview_packs (after questions + challenges are gone)
    await tx
      .delete(interviewPacks)
      .where(eq(interviewPacks.candidateId, candidateId))

    // interview_slots
    await tx
      .delete(interviewSlots)
      .where(eq(interviewSlots.candidateId, candidateId))

    // candidate_role_approvals
    await tx
      .delete(candidateRoleApprovals)
      .where(eq(candidateRoleApprovals.candidateId, candidateId))

    // notes (only where candidate_id matches — notes may reference other entities)
    await tx
      .delete(notes)
      .where(eq(notes.candidateId, candidateId))

    // role_submissions
    await tx
      .delete(roleSubmissions)
      .where(eq(roleSubmissions.candidateId, candidateId))

    // cv_profiles
    await tx
      .delete(cvProfiles)
      .where(eq(cvProfiles.candidateId, candidateId))

    // candidate_enrichments
    await tx
      .delete(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))

    // scores
    await tx
      .delete(scores)
      .where(eq(scores.candidateId, candidateId))

    // ---- Redact audit_log rows — RETAIN rows but strip PII -----------------
    await tx
      .update(auditLogs)
      .set({
        entityLabel: '[redacted-gdpr]',
        metadata: {
          redacted_gdpr: true,
          redacted_at: new Date().toISOString(),
        },
      })
      .where(
        and(
          eq(auditLogs.entityType, 'candidate'),
          eq(auditLogs.entityId, candidateId)
        )
      )

    // ---- Delete the candidate row itself (last) ----------------------------
    await tx
      .delete(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.tenantId, tenantId)
        )
      )
  })

  // 8. Delete CV file from disk after transaction commits (best-effort)
  if (cvFilePath) {
    try {
      await deleteCvFile(cvFilePath)
    } catch (err) {
      // File deletion failure is non-fatal — the DB record is already gone.
      // Log for ops visibility but do not fail the action.
      console.error('[gdpr] Failed to delete CV file:', cvFilePath, err)
    }
  }

  // TODO: if synechronCvData was stored as a separate file path, delete it here.
  // Currently synechronCvData is stored as JSONB on the candidate row (which is
  // now deleted), so no additional file deletion is needed.

  // 9. Write tombstone audit entry
  emitAudit(tenantId, {
    action: 'candidate.deleted_gdpr',
    entityType: 'candidate',
    entityId: candidateId,
    entityLabel: '[deleted-gdpr]',
    metadata: {
      deletedAt: new Date().toISOString(),
      deletedBy: ctx.userId,
    },
  })

  // 10. Invalidate candidate list cache
  revalidatePath('/dashboard/candidates')

  return { ok: true }
}
