'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { withTenant } from '@/db'
import { auditLogs, candidates, agencies, scores, roles } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'

export type AutoMatchStatus = 'idle' | 'pending' | 'complete' | 'failed'

export type AutoMatchRateMatch = 'within' | 'over' | 'currency_mismatch' | 'unknown'

export type AutoMatchCandidate = {
  id: string
  firstName: string
  lastName: string
  agencyName: string | null
  agencyLogoPath: string | null
  overallScore: number | null
  rateMatch: AutoMatchRateMatch
  rateOveragePercent: number | null
  availabilityStatus: 'available' | 'on_project' | 'unavailable'
  availableFrom: string | null
  scoreStatus: 'pending' | 'processing' | 'complete' | 'failed' | null
}

export type AutoMatchStatusResult = {
  status: AutoMatchStatus
  reason: string | null
  candidates: AutoMatchCandidate[]
}

const AUTO_MATCH_ACTIONS = [
  'role.auto_match_started',
  'role.auto_match_completed',
  'role.auto_match_failed',
] as const

const BUDGET_OVERAGE_MAX = 1.25

type AutoMatchMetadata = {
  candidateIds?: string[]
  scoredCandidateIds?: string[]
  reason?: string
}

/**
 * Resolves the live auto-match status for a role by reading its most-recent
 * audit row and joining to candidate / score / agency data. Used by the
 * ArchiveMatchesPanel on the role detail page (epic #267, issue #271).
 *
 * Returns:
 *   - status='idle'     when no auto-match has been started (e.g. role created
 *                       pre-feature)
 *   - status='pending'  when only role.auto_match_started has been written
 *   - status='complete' when role.auto_match_completed is the most-recent row
 *   - status='failed'   when role.auto_match_failed is the most-recent row;
 *                       candidates may still be present in the cap-exceeded path
 *
 * rateMatch is re-derived at query time from the candidate's current rate vs
 * the role's customerDayRate — keeps the audit metadata small and the panel
 * always reflects the latest rate edits.
 */
export async function getAutoMatchStatus(
  roleId: string,
): Promise<AutoMatchStatusResult> {
  const ctx = await getActionContext()
  if (!ctx) {
    return { status: 'idle', reason: null, candidates: [] }
  }
  const { tenantId } = ctx

  const [latest] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        action: auditLogs.action,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, 'role'),
          eq(auditLogs.entityId, roleId),
          inArray(auditLogs.action, AUTO_MATCH_ACTIONS as unknown as string[]),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1),
  )

  if (!latest) {
    return { status: 'idle', reason: null, candidates: [] }
  }

  if (latest.action === 'role.auto_match_started') {
    return { status: 'pending', reason: null, candidates: [] }
  }

  const metadata = (latest.metadata ?? {}) as AutoMatchMetadata
  const isFailed = latest.action === 'role.auto_match_failed'

  // Pull whichever candidate-id list is present. Completed rows publish
  // scoredCandidateIds (the survivors that got scored), candidateIds (top 3
  // prefilter), or both. Failed rows on the cap-exceeded path carry
  // candidateIds; failed rows from internal errors may carry nothing.
  const candidateIds =
    metadata.scoredCandidateIds && metadata.scoredCandidateIds.length > 0
      ? metadata.scoredCandidateIds
      : metadata.candidateIds ?? []

  if (candidateIds.length === 0) {
    return {
      status: isFailed ? 'failed' : 'complete',
      reason: isFailed ? metadata.reason ?? null : null,
      candidates: [],
    }
  }

  // Fetch role budget context for rate-match derivation
  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        customerDayRate: roles.customerDayRate,
        rateCurrency: roles.rateCurrency,
      })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1),
  )
  const budget =
    role && role.customerDayRate !== null && role.customerDayRate !== undefined
      ? Number(role.customerDayRate)
      : null
  const budgetCurrency = role?.rateCurrency ?? null

  const candidateRows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        candidateRate: candidates.candidateRate,
        rateCurrency: candidates.rateCurrency,
        availabilityStatus: candidates.availabilityStatus,
        availableFrom: candidates.availableFrom,
        agencyName: agencies.name,
        agencyLogoPath: agencies.logoPath,
      })
      .from(candidates)
      .leftJoin(agencies, eq(agencies.id, candidates.agencyId))
      .where(
        and(
          eq(candidates.tenantId, tenantId),
          inArray(candidates.id, candidateIds),
        ),
      ),
  )

  const scoreRows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        candidateId: scores.candidateId,
        overallScore: scores.overallScore,
        scoreStatus: scores.scoreStatus,
      })
      .from(scores)
      .where(
        and(eq(scores.roleId, roleId), inArray(scores.candidateId, candidateIds)),
      ),
  )
  const scoreMap = new Map(scoreRows.map((s) => [s.candidateId, s]))

  // Preserve the order from candidateIds (sorted by similarity → score by the
  // orchestrator) rather than the unordered DB result.
  const rowMap = new Map(candidateRows.map((c) => [c.id, c]))
  const orderedCandidates: AutoMatchCandidate[] = []
  for (const cid of candidateIds) {
    const c = rowMap.get(cid)
    if (!c) continue

    const candidateRate =
      c.candidateRate !== null && c.candidateRate !== undefined
        ? Number(c.candidateRate)
        : null

    let rateMatch: AutoMatchRateMatch
    let rateOveragePercent: number | null = null
    if (budget === null || candidateRate === null) {
      rateMatch = 'unknown'
    } else if (
      !budgetCurrency ||
      !c.rateCurrency ||
      budgetCurrency !== c.rateCurrency
    ) {
      rateMatch = 'currency_mismatch'
    } else if (candidateRate > budget * BUDGET_OVERAGE_MAX) {
      // Should have been filtered out by prefilter, but render defensively
      rateMatch = 'over'
      rateOveragePercent = Math.round(((candidateRate - budget) / budget) * 100)
    } else if (candidateRate > budget) {
      rateMatch = 'over'
      rateOveragePercent = Math.round(((candidateRate - budget) / budget) * 100)
    } else {
      rateMatch = 'within'
    }

    const score = scoreMap.get(cid)

    orderedCandidates.push({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      agencyName: c.agencyName,
      agencyLogoPath: c.agencyLogoPath,
      overallScore: score?.overallScore ?? null,
      rateMatch,
      rateOveragePercent,
      availabilityStatus: c.availabilityStatus,
      availableFrom: c.availableFrom,
      scoreStatus: score?.scoreStatus ?? null,
    })
  }

  return {
    status: isFailed ? 'failed' : 'complete',
    reason: isFailed ? metadata.reason ?? null : null,
    candidates: orderedCandidates,
  }
}
