'use server'

import { prefilterCandidatesForRole } from '@/lib/auto-match'
import { writeAuditLog } from '@/lib/audit'

/**
 * Auto-match orchestrator (epic #267).
 *
 * Called from the createRole after() hook (issue #270). Runs the pre-filter
 * pipeline and audits the lifecycle. Designed to NEVER throw — failures are
 * captured as `role.auto_match_failed` audit rows so the caller's main
 * response path is never affected.
 *
 * Scoring of the top survivors is owned by issue #269; this function currently
 * audits the candidate IDs that WOULD be scored (`scoringPending: true` in
 * metadata) and leaves the Claude-scoring step as a follow-up.
 */
export async function triggerAutoMatch(
  roleId: string,
  tenantId: string,
): Promise<void> {
  const startedAt = Date.now()

  await writeAuditLog(tenantId, {
    action: 'role.auto_match_started',
    entityType: 'role',
    entityId: roleId,
  })

  try {
    const survivors = await prefilterCandidatesForRole({ roleId, tenantId })
    const topCandidateIds = survivors.slice(0, 3).map((s) => s.candidateId)

    await writeAuditLog(tenantId, {
      action: 'role.auto_match_completed',
      entityType: 'role',
      entityId: roleId,
      metadata: {
        candidateIds: topCandidateIds,
        survivorCount: survivors.length,
        durationMs: Date.now() - startedAt,
        // Flipped to false by #269 once Claude scoring is integrated.
        scoringPending: true,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await writeAuditLog(tenantId, {
      action: 'role.auto_match_failed',
      entityType: 'role',
      entityId: roleId,
      metadata: {
        error: message,
        durationMs: Date.now() - startedAt,
      },
    })
  }
}
