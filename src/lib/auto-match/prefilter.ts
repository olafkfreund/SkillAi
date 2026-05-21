import { and, eq, sql } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { hasBeenRejectedByCustomer } from './rejection'
import type { AvailabilityResult, PrefilterResult, RateMatch } from './types'

const VECTOR_TOP_N = 30
const PREFILTER_CAP = 20
const BUDGET_OVERAGE_MAX = 1.25 // candidates >25% over budget are excluded

type VectorRow = {
  id: string
  availability_status: 'available' | 'on_project' | 'unavailable'
  available_from: string | null
  candidate_rate: string | null
  rate_currency: string | null
  similarity: number
}

/**
 * Pre-filters the candidate archive for auto-match. Returns up to 20 candidates
 * ordered by pgvector cosine similarity to the role's text, after excluding:
 *
 *   - candidates with availabilityStatus = 'unavailable'
 *   - candidates previously rejected by this role's customer (any prior role)
 *   - candidates whose day rate exceeds 125% of role.customerDayRate when
 *     currencies match (mismatched currencies pass through, flagged in result)
 *
 * Returns [] when the role isn't found, the embedding can't be generated, or
 * no candidate survives. The orchestrator (triggerAutoMatch) treats [] as a
 * normal "no matches" outcome, not an error.
 */
export async function prefilterCandidatesForRole(args: {
  roleId: string
  tenantId: string
}): Promise<PrefilterResult[]> {
  const { roleId, tenantId } = args

  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roles.id,
        title: roles.title,
        description: roles.description,
        requirements: roles.requirements,
        customerId: roles.customerId,
        customerDayRate: roles.customerDayRate,
        rateCurrency: roles.rateCurrency,
      })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1),
  )
  if (!role) return []

  const roleText = `${role.title}\n\n${role.description}\n\n${role.requirements}`
  const roleEmbedding = await generateEmbedding(roleText, tenantId)
  if (!roleEmbedding) return []
  const embeddingStr = JSON.stringify(roleEmbedding)

  // pgvector cosine top-N. Unlike getSuggestedCandidates we do NOT exclude
  // already-scored candidates — auto-match reconsiders the archive regardless
  // of prior scoring on other roles. Availability filter pushed into SQL.
  const rawRows = await withTenant(tenantId, async (tx) =>
    tx.execute(sql`
      SELECT
        id,
        availability_status,
        available_from,
        candidate_rate,
        rate_currency,
        ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 3) AS similarity
      FROM candidates
      WHERE
        tenant_id = current_setting('app.tenant_id', true)::uuid
        AND is_active = true
        AND embedding IS NOT NULL
        AND availability_status != 'unavailable'
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${VECTOR_TOP_N}
    `),
  )

  const rows = Array.from(rawRows) as VectorRow[]
  if (rows.length === 0) return []

  // Customer-rejection filter — only meaningful when the role has a customer.
  // Run all checks in parallel: at N=30 candidates we issue 30 small queries,
  // bounded by the postgres pool (max=10 connections, see src/db/index.ts).
  let rejectedIds = new Set<string>()
  if (role.customerId) {
    const customerId = role.customerId
    const checks = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        rejected: await hasBeenRejectedByCustomer(r.id, customerId, tenantId),
      })),
    )
    rejectedIds = new Set(checks.filter((c) => c.rejected).map((c) => c.id))
  }

  const budget =
    role.customerDayRate !== null && role.customerDayRate !== undefined
      ? Number(role.customerDayRate)
      : null
  const budgetCurrency = role.rateCurrency

  const results: PrefilterResult[] = []
  for (const r of rows) {
    if (rejectedIds.has(r.id)) continue

    const candidateRate =
      r.candidate_rate !== null && r.candidate_rate !== undefined
        ? Number(r.candidate_rate)
        : null
    const candidateCurrency = r.rate_currency

    let rateMatch: RateMatch
    let rateOveragePercent: number | null = null

    if (budget === null || candidateRate === null) {
      rateMatch = 'unknown'
    } else if (
      !budgetCurrency ||
      !candidateCurrency ||
      budgetCurrency !== candidateCurrency
    ) {
      rateMatch = 'currency_mismatch'
    } else if (candidateRate > budget * BUDGET_OVERAGE_MAX) {
      // >25% over budget — exclude entirely (hard cap)
      continue
    } else if (candidateRate > budget) {
      rateMatch = 'over'
      rateOveragePercent = Math.round(((candidateRate - budget) / budget) * 100)
    } else {
      rateMatch = 'within'
    }

    const availability: AvailabilityResult =
      r.availability_status === 'on_project'
        ? { status: 'on_project', availableFrom: r.available_from ?? null }
        : { status: 'available' }

    results.push({
      candidateId: r.id,
      similarity: Math.round(Number(r.similarity) * 100),
      rateMatch,
      rateOveragePercent,
      availability,
    })

    if (results.length >= PREFILTER_CAP) break
  }

  return results
}
