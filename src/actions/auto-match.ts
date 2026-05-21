'use server'

import {
  prefilterCandidatesForRole,
  triggerAutoMatchScoring,
} from '@/lib/auto-match'
import { writeAuditLog } from '@/lib/audit'

/**
 * Auto-match orchestrator (epic #267).
 *
 * Called from the createRole after() hook (issue #270). Runs the pre-filter
 * pipeline, scores the top 3 survivors with Claude/Gemini, and audits the
 * lifecycle. Designed to NEVER throw — failures are captured as
 * `role.auto_match_failed` audit rows so the caller's main response path is
 * never affected.
 *
 * Cost protection: triggerAutoMatchScoring checks the per-tenant daily cap
 * (default $50, tunable via tenant_settings) before spending Claude tokens.
 * When the cap is exceeded the candidateIds are still surfaced in the
 * failed-audit metadata so the UI can render survivors without scores.
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

    const scoringResult = await triggerAutoMatchScoring(
      roleId,
      tenantId,
      topCandidateIds,
    )

    if (scoringResult.skipped) {
      await writeAuditLog(tenantId, {
        action: 'role.auto_match_failed',
        entityType: 'role',
        entityId: roleId,
        metadata: {
          reason: scoringResult.reason,
          candidateIds: topCandidateIds,
          survivorCount: survivors.length,
          spentTodayUsd: scoringResult.spentTodayUsd,
          capUsd: scoringResult.capUsd,
          durationMs: Date.now() - startedAt,
        },
      })
      return
    }

    await writeAuditLog(tenantId, {
      action: 'role.auto_match_completed',
      entityType: 'role',
      entityId: roleId,
      metadata: {
        candidateIds: topCandidateIds,
        survivorCount: survivors.length,
        scoredCandidateIds: scoringResult.scoredCandidateIds,
        failedCandidateIds: scoringResult.failedCandidateIds,
        reusedExistingScores: scoringResult.reusedExistingScores,
        durationMs: Date.now() - startedAt,
        scoringPending: false,
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
