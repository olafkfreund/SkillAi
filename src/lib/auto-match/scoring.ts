import { and, eq, inArray, sql } from 'drizzle-orm'
import { withTenant } from '@/db'
import { scores, tenantSettings } from '@/db/schema'
import { triggerScoring } from '@/lib/ai/scoring'

const DEFAULT_DAILY_COST_CAP_USD = 50
const COST_CAP_SETTING_KEY = 'auto_match_daily_cost_cap_usd'

export type AutoMatchScoringResult =
  | {
      skipped: false
      scoredCandidateIds: string[]
      failedCandidateIds: string[]
      reusedExistingScores: string[]
    }
  | {
      skipped: true
      reason: 'daily_cost_cap_exceeded'
      spentTodayUsd: number
      capUsd: number
    }

/**
 * Sum of cost_usd across today's `auto_match_scoring` rows in ai_usage for
 * the given tenant. Today is bounded by date_trunc('day', NOW()).
 */
export async function getTodayAutoMatchSpend(tenantId: string): Promise<number> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx.execute(sql`
      SELECT COALESCE(SUM(cost_usd), 0) AS total
      FROM ai_usage
      WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
        AND operation = 'auto_match_scoring'
        AND created_at >= date_trunc('day', NOW())
    `),
  )
  const [first] = Array.from(rows) as Array<{ total: string | number }>
  if (!first) return 0
  const n = Number(first.total)
  return Number.isFinite(n) ? n : 0
}

/**
 * Per-tenant daily cap on auto-match Claude spend. Reads from `tenant_settings`
 * key 'auto_match_daily_cost_cap_usd'; defaults to $50 USD when unset or
 * malformed. Tenants tune via a settings row, no schema change required.
 */
export async function getAutoMatchDailyCostCapUsd(tenantId: string): Promise<number> {
  const [setting] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.key, COST_CAP_SETTING_KEY),
        ),
      )
      .limit(1),
  )
  if (!setting) return DEFAULT_DAILY_COST_CAP_USD
  const parsed = Number(setting.value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAILY_COST_CAP_USD
  return parsed
}

/**
 * Score the supplied candidates against the role using Claude/Gemini (per
 * tenant model preference). Tagged with operation='auto_match_scoring' so
 * the daily cap and cost reporting can attribute spend correctly.
 *
 * Behaviour:
 *   - candidateIds empty → no-op, returns empty result
 *   - daily cap already met → skip ALL scoring, return skipped=true
 *   - candidates already with scoreStatus='complete' → not re-scored,
 *     reported in reusedExistingScores (avoids stomping on manual rescores)
 *   - remaining candidates → pending scores row upserted, then triggerScoring
 *     fired in parallel; final scoreStatus drives scored/failed buckets
 *
 * Never throws — failures land as `scoreStatus='failed'` rows inside
 * triggerScoring, which we surface in failedCandidateIds.
 */
export async function triggerAutoMatchScoring(
  roleId: string,
  tenantId: string,
  candidateIds: string[],
): Promise<AutoMatchScoringResult> {
  if (candidateIds.length === 0) {
    return {
      skipped: false,
      scoredCandidateIds: [],
      failedCandidateIds: [],
      reusedExistingScores: [],
    }
  }

  const [spentTodayUsd, capUsd] = await Promise.all([
    getTodayAutoMatchSpend(tenantId),
    getAutoMatchDailyCostCapUsd(tenantId),
  ])
  if (spentTodayUsd >= capUsd) {
    return {
      skipped: true,
      reason: 'daily_cost_cap_exceeded',
      spentTodayUsd,
      capUsd,
    }
  }

  // Don't re-score candidates that already have a complete score for this
  // role — preserves any manual rescore the recruiter did before auto-match
  // happened to run.
  const existingScores = await withTenant(tenantId, async (tx) =>
    tx
      .select({ candidateId: scores.candidateId, status: scores.scoreStatus })
      .from(scores)
      .where(and(eq(scores.roleId, roleId), inArray(scores.candidateId, candidateIds))),
  )
  const reusedExistingScores = existingScores
    .filter((s) => s.status === 'complete')
    .map((s) => s.candidateId)
  const reusedSet = new Set(reusedExistingScores)
  const toScoreIds = candidateIds.filter((id) => !reusedSet.has(id))

  if (toScoreIds.length > 0) {
    await withTenant(tenantId, async (tx) => {
      for (const candidateId of toScoreIds) {
        await tx
          .insert(scores)
          .values({ tenantId, candidateId, roleId, scoreStatus: 'pending' })
          .onConflictDoNothing()
      }
    })
  }

  // Concurrency cap is implicit at 3 — the orchestrator only ever passes the
  // top-3 prefilter survivors. No external p-limit dep needed.
  await Promise.all(
    toScoreIds.map((cid) =>
      triggerScoring(cid, roleId, tenantId, 'auto_match_scoring'),
    ),
  )

  // Re-query to classify success vs failure. triggerScoring writes
  // scoreStatus='complete' or 'failed' internally and never throws, so we
  // can't use Promise.allSettled rejections — the scores table is the
  // ground truth.
  const finalStatuses =
    toScoreIds.length > 0
      ? await withTenant(tenantId, async (tx) =>
          tx
            .select({ candidateId: scores.candidateId, status: scores.scoreStatus })
            .from(scores)
            .where(
              and(eq(scores.roleId, roleId), inArray(scores.candidateId, toScoreIds)),
            ),
        )
      : []

  const scoredCandidateIds = [
    ...reusedExistingScores,
    ...finalStatuses.filter((s) => s.status === 'complete').map((s) => s.candidateId),
  ]
  const failedCandidateIds = finalStatuses
    .filter((s) => s.status === 'failed')
    .map((s) => s.candidateId)

  return {
    skipped: false,
    scoredCandidateIds,
    failedCandidateIds,
    reusedExistingScores,
  }
}
