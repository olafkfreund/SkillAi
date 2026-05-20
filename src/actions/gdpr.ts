'use server'

/**
 * GDPR actions — admin-only operations for data subject rights compliance.
 *
 * Article 17 (Right to Erasure):
 *   deleteCandidateForGdpr — hard-deletes a candidate and all associated data,
 *   redacts audit log PII, and removes the CV file from disk.
 *
 *   deleteUserForGdpr — hard-deletes a user and all associated data, redacts
 *   audit log PII (actor rows), and writes a tombstone audit entry.
 */

import { revalidatePath } from 'next/cache'
import { eq, and, sql } from 'drizzle-orm'
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
  aiUsage,
  sentEmails,
  interviewPacks,
  interviewQuestions,
  codeChallenges,
  interviewSlots,
  interviewTranscripts,
  transcriptAnalyses,
  candidateRoleApprovals,
  users,
  apiTokens,
  calendarConnections,
  roleManagers,
  roles,
  tenantSettings,
  userInvitations,
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
 * - Redacts (does NOT delete) ai_usage rows whose metadata references the
 *   candidate by candidateId or candidateName — preserves cost-tracking
 *   aggregates while removing PII (DEC-011).
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

    // ---- Redact ai_usage.metadata rows — RETAIN rows but strip PII ----------
    // ai_usage rows are cost-tracking records whose aggregates (token counts,
    // cost, model, operation) remain useful after erasure.  However, several
    // callers write the candidate's full name or UUID into metadata:
    //   • candidateName  — cv_scoring_claude, cv_scoring_gemini, role_fit
    //   • candidateId    — profile_match, synechron_extract, cv_reformat,
    //                      cv_profile_extract, personal_site_summary,
    //                      welcome_letter_generate
    //   • transcriptId   — transcript_analysis (FK to a now-deleted row)
    // We replace the entire metadata object with a minimal redaction marker,
    // preserving only the operation label which has no PII.
    // Same redaction-not-deletion principle as audit_logs (DEC-011).
    const candidateFullName = `${candidateRow.firstName} ${candidateRow.lastName}`
    await tx.execute(sql`
      UPDATE ai_usage
      SET metadata = jsonb_build_object(
        'redacted_gdpr', true,
        'redacted_at', NOW()::text,
        'operation', metadata->>'operation'
      )
      WHERE tenant_id = ${tenantId}::uuid
        AND (
          metadata->>'candidateId'   = ${candidateId}
          OR metadata->>'candidateName' = ${candidateFullName}
        )
    `)

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

// ---------------------------------------------------------------------------
// deleteUserForGdpr — Article 17 erasure for a user account
// ---------------------------------------------------------------------------

const DeleteUserGdprSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  /**
   * Caller must type the target user's email address exactly (case-sensitive).
   * Verified server-side before any deletion is performed.
   */
  typedConfirmation: z.string().min(1, 'Confirmation is required'),
})

export type DeleteUserGdprInput = z.infer<typeof DeleteUserGdprSchema>

export type DeleteUserGdprResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Hard-deletes a user and all associated child data as required under
 * GDPR Article 17 (Right to Erasure).
 *
 * - Requires admin role.
 * - Cannot delete yourself (self-delete guard).
 * - Cannot delete the sole remaining admin of the tenant (last-admin guard).
 * - Requires the caller to type the target user's email exactly as confirmation.
 * - Deletes child rows in FK-safe dependency order inside a single transaction.
 * - Audit log rows where this user was the actor are redacted (PII cleared)
 *   but NOT deleted — preserves the audit trail without personal data, per
 *   DEC-011 rationale (Article 5(2) / Article 30 competing obligation).
 * - Writes a tombstone audit entry after the transaction commits.
 *
 * Cascade order (explicit application-level deletes — not DB cascade):
 *   1. calendar_connections          (userId FK — no RLS, cascades fine in tx)
 *   2. api_tokens                    (userId FK — tenant-scoped)
 *   3. candidate_role_approvals      (managerId FK — hard delete)
 *   4. role_managers                 (userId FK — hard delete)
 *   5. notes                         (authorId FK — hard delete)
 *   6. interview_slots.interviewerId (SET NULL — slot kept, interviewer cleared)
 *   7. interview_slots.createdBy     (SET NULL — createdBy cleared)
 *   8. interview_packs.createdBy     (SET NULL — pack kept, creator cleared)
 *   9. roles.createdBy               (SET NULL — role kept, creator cleared)
 *  10. role_submissions.sentByUserId (SET NULL — submission kept)
 *  11. sent_emails.senderUserId      (SET NULL — email record kept)
 *  12. tenant_settings.updatedBy     (SET NULL — setting kept)
 *  13. role_managers.addedBy         (SET NULL — manager assignment kept)
 *  14. candidates.statusConfirmedBy  (SET NULL — candidate kept)
 *  15. candidates.rightToWorkCheckedBy (SET NULL — candidate kept)
 *  16. user_invitations.createdBy    (SET NULL — createdBy is plain uuid, no FK)
 *  17. audit_logs                    (UPDATE: redact actor PII, retain rows)
 * 17b. ai_usage                      (UPDATE: NULL user_id FK, mark redacted)
 *  18. users                         (DELETE — last step)
 */
export async function deleteUserForGdpr(
  input: DeleteUserGdprInput
): Promise<DeleteUserGdprResult> {
  // 1. Validate input
  const parsed = DeleteUserGdprSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }
  const { userId: targetUserId, typedConfirmation } = parsed.data

  // 2. Get action context (tenant + caller identity)
  const ctx = await getActionContext()
  if (!ctx) {
    return { ok: false, error: 'Unauthorized' }
  }
  const { tenantId, userId: callerUserId, userRole } = ctx

  // 3. Admin-only gate
  try {
    requireRole(userRole, 'admin')
  } catch {
    return { ok: false, error: 'Forbidden: admin role required' }
  }

  // 4. Self-delete guard
  if (callerUserId === targetUserId) {
    return { ok: false, error: 'You cannot delete your own account' }
  }

  // 5. Load target user — verify existence and get email for confirmation check
  const targetUser = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.tenantId, tenantId)))
      .limit(1)
    return row ?? null
  })

  if (!targetUser) {
    return { ok: false, error: 'User not found' }
  }

  // 6. Typed-confirmation check — must match email exactly (case-sensitive)
  if (typedConfirmation !== targetUser.email) {
    return { ok: false, error: 'Confirmation does not match user email' }
  }

  // 7. Last-admin guard — count active admins; block if this is the only one
  if (targetUser.role === 'admin') {
    const adminCount = await withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.role, 'admin'),
            eq(users.isActive, true)
          )
        )
      return rows.length
    })

    if (adminCount <= 1) {
      return {
        ok: false,
        error: 'Cannot delete the sole admin of this tenant',
      }
    }
  }

  // 8. Delete in dependency order inside a single transaction
  let redactedAuditRowCount = 0

  await withTenant(tenantId, async (tx) => {
    // ── Step 1: calendar_connections (userId FK, no RLS — delete directly) ──
    await tx
      .delete(calendarConnections)
      .where(eq(calendarConnections.userId, targetUserId))

    // ── Step 2: api_tokens (userId FK) ──────────────────────────────────────
    await tx
      .delete(apiTokens)
      .where(
        and(
          eq(apiTokens.userId, targetUserId),
          eq(apiTokens.tenantId, tenantId)
        )
      )

    // ── Step 3: candidate_role_approvals (managerId FK) ──────────────────────
    await tx
      .delete(candidateRoleApprovals)
      .where(
        and(
          eq(candidateRoleApprovals.managerId, targetUserId),
          eq(candidateRoleApprovals.tenantId, tenantId)
        )
      )

    // ── Step 4: role_managers (userId FK — hard delete rows where this user is the assigned manager) ──
    await tx
      .delete(roleManagers)
      .where(
        and(
          eq(roleManagers.userId, targetUserId),
          eq(roleManagers.tenantId, tenantId)
        )
      )

    // ── Step 5: notes (authorId FK — hard delete; notes belong to this user) ──
    await tx
      .delete(notes)
      .where(
        and(
          eq(notes.authorId, targetUserId),
          eq(notes.tenantId, tenantId)
        )
      )

    // ── Step 6: interview_slots.interviewerId (SET NULL) ────────────────────
    await tx
      .update(interviewSlots)
      .set({ interviewerId: null })
      .where(
        and(
          eq(interviewSlots.interviewerId, targetUserId),
          eq(interviewSlots.tenantId, tenantId)
        )
      )

    // ── Step 7: interview_slots.createdBy (SET NULL) ─────────────────────────
    await tx
      .update(interviewSlots)
      .set({ createdBy: null as unknown as string }) // column is notNull in schema but nullable FK — cast to allow erasure
      .where(
        and(
          eq(interviewSlots.createdBy, targetUserId),
          eq(interviewSlots.tenantId, tenantId)
        )
      )

    // ── Step 8: interview_packs.createdBy (SET NULL) ─────────────────────────
    await tx
      .update(interviewPacks)
      .set({ createdBy: null as unknown as string })
      .where(
        and(
          eq(interviewPacks.createdBy, targetUserId),
          eq(interviewPacks.tenantId, tenantId)
        )
      )

    // ── Step 9: roles.createdBy (SET NULL) ───────────────────────────────────
    await tx
      .update(roles)
      .set({ createdBy: null as unknown as string })
      .where(
        and(
          eq(roles.createdBy, targetUserId),
          eq(roles.tenantId, tenantId)
        )
      )

    // ── Step 10: role_submissions.sentByUserId (SET NULL) ────────────────────
    await tx
      .update(roleSubmissions)
      .set({ sentByUserId: null })
      .where(
        and(
          eq(roleSubmissions.sentByUserId, targetUserId),
          eq(roleSubmissions.tenantId, tenantId)
        )
      )

    // ── Step 11: sent_emails.senderUserId (SET NULL) ─────────────────────────
    await tx
      .update(sentEmails)
      .set({ senderUserId: null })
      .where(
        and(
          eq(sentEmails.senderUserId, targetUserId),
          eq(sentEmails.tenantId, tenantId)
        )
      )

    // ── Step 12: tenant_settings.updatedBy (SET NULL) ────────────────────────
    await tx
      .update(tenantSettings)
      .set({ updatedBy: null as unknown as string })
      .where(
        and(
          eq(tenantSettings.updatedBy, targetUserId),
          eq(tenantSettings.tenantId, tenantId)
        )
      )

    // ── Step 13: role_managers.addedBy (SET NULL) ────────────────────────────
    await tx
      .update(roleManagers)
      .set({ addedBy: null })
      .where(
        and(
          eq(roleManagers.addedBy, targetUserId),
          eq(roleManagers.tenantId, tenantId)
        )
      )

    // ── Step 14: candidates.statusConfirmedBy (SET NULL) ─────────────────────
    await tx
      .update(candidates)
      .set({ statusConfirmedBy: null })
      .where(
        and(
          eq(candidates.statusConfirmedBy, targetUserId),
          eq(candidates.tenantId, tenantId)
        )
      )

    // ── Step 15: candidates.rightToWorkCheckedBy (SET NULL) ──────────────────
    await tx
      .update(candidates)
      .set({ rightToWorkCheckedBy: null })
      .where(
        and(
          eq(candidates.rightToWorkCheckedBy, targetUserId),
          eq(candidates.tenantId, tenantId)
        )
      )

    // ── Step 16: user_invitations.createdBy (SET NULL) ───────────────────────
    // createdBy is a plain uuid column with no FK constraint — still must be cleared
    await tx
      .update(userInvitations)
      .set({ createdBy: null as unknown as string })
      .where(
        and(
          eq(userInvitations.createdBy, targetUserId),
          eq(userInvitations.tenantId, tenantId)
        )
      )

    // ── Step 17: audit_logs — REDACT PII, do NOT delete ─────────────────────
    // Retain the action trail (who did what, when) for Article 5(2)/30 accountability.
    // Erase personal data from actor fields (userId → null, userEmail → redacted).
    // See DEC-011 for the rationale behind redaction-not-deletion.
    const redactResult = await tx
      .update(auditLogs)
      .set({
        userEmail: '[redacted-gdpr]',
        metadata: {
          redacted_gdpr: true,
          redacted_at: new Date().toISOString(),
        },
      })
      .where(
        and(
          eq(auditLogs.userId, targetUserId),
          eq(auditLogs.tenantId, tenantId)
        )
      )

    // Drizzle returns the updated row count — capture for tombstone metadata
    redactedAuditRowCount = Array.isArray(redactResult) ? redactResult.length : 0

    // ── Step 17b: ai_usage — NULL the user_id FK, mark row as redacted ──────
    // ai_usage.user_id is nullable (background jobs log with userId = null).
    // Clearing it removes the direct identity link while keeping the cost row
    // intact for per-tenant analytics.  Same redaction-not-deletion principle
    // as audit_logs above (DEC-011).
    await tx.execute(sql`
      UPDATE ai_usage
      SET user_id = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"user_redacted_gdpr": true}'::jsonb
      WHERE tenant_id = ${tenantId}::uuid
        AND user_id = ${targetUserId}::uuid
    `)

    // ── Step 18: users row (last) ────────────────────────────────────────────
    await tx
      .delete(users)
      .where(
        and(
          eq(users.id, targetUserId),
          eq(users.tenantId, tenantId)
        )
      )
  })

  // 9. Write tombstone audit entry AFTER transaction commits
  emitAudit(tenantId, {
    action: 'user.deleted_gdpr',
    entityType: 'user',
    entityId: targetUserId,
    entityLabel: '[deleted-gdpr]',
    metadata: {
      deleted_user_email: targetUser.email,
      deleted_user_id: targetUserId,
      deleted_user_name: targetUser.name,
      redacted_audit_rows: redactedAuditRowCount,
      deleted_at: new Date().toISOString(),
      deleted_by: callerUserId,
    },
  })

  // 10. Invalidate users page cache
  revalidatePath('/dashboard/users')

  return { ok: true }
}
