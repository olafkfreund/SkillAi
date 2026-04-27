'use server'

import { sql, gte } from 'drizzle-orm'
import { withTenant } from '@/db'
import { aiUsage } from '@/db/schema/ai-usage'
import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'

export interface AiUsageSummary {
  totalCostUsd: number
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  byOperation: Array<{
    operation: string
    model: string
    calls: number
    inputTokens: number
    outputTokens: number
    costUsd: number
  }>
  byDayLast30: Array<{ date: string; costUsd: number; calls: number }>
}

/**
 * Aggregate AI usage statistics for the current tenant over the last `days` days.
 * Admin-only — returns `{ ok: false }` for non-admins or unauthenticated requests.
 */
export async function getAiUsageSummary(
  days = 30
): Promise<
  | { ok: true; summary: AiUsageSummary }
  | { ok: false; error: string }
> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  try {
    requireRole(ctx.userRole, 'admin')
  } catch {
    return { ok: false, error: 'Forbidden' }
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const summary = await withTenant(ctx.tenantId, async (tx) => {
    // Aggregate totals
    const totalsRes = await tx
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
        totalInput: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        totalOutput: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
        totalCacheRead: sql<number>`coalesce(sum(${aiUsage.cacheReadTokens}), 0)::int`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, cutoff))

    const totals = totalsRes[0]

    // Aggregate by operation+model
    const byOpRes = await tx
      .select({
        operation: aiUsage.operation,
        model: aiUsage.model,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
        costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, cutoff))
      .groupBy(aiUsage.operation, aiUsage.model)

    // Aggregate by day for chart (UTC bucketing)
    const byDayRes = await tx
      .select({
        date: sql<string>`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        calls: sql<number>`count(*)::int`,
        costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, cutoff))
      .groupBy(sql`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)

    return {
      totalCostUsd: parseFloat(totals.totalCost),
      totalCalls: totals.totalCalls,
      totalInputTokens: totals.totalInput,
      totalOutputTokens: totals.totalOutput,
      totalCacheReadTokens: totals.totalCacheRead,
      byOperation: byOpRes
        .map((r) => ({
          operation: r.operation,
          model: r.model,
          calls: r.calls,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: parseFloat(r.costUsd),
        }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byDayLast30: byDayRes.map((r) => ({
        date: r.date,
        calls: r.calls,
        costUsd: parseFloat(r.costUsd),
      })),
    }
  })

  return { ok: true, summary }
}
