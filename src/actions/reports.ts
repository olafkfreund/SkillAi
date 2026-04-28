'use server'

import { sql, gte, eq, and, isNotNull, lt, inArray } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  candidates,
  roles,
  scores,
  agencies,
  customers,
  auditLogs,
  aiUsage,
} from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'

// ── Public types ───────────────────────────────────────────────────────────────

export type ReportRange = '7d' | '30d' | '90d' | '12mo'

export type ReportsFeed = {
  rangeDays: number
  generatedAt: Date

  // KPI cards
  kpis: {
    activeRoles: number
    candidatesAddedInRange: number
    candidatesScoredInRange: number
    candidatesHiredInRange: number
    aiSpendInRangeUsd: number
  }

  // Time-to-fill (last `days`, by customer)
  timeToFill: {
    series: { customerName: string; avgDaysToFill: number; rolesFilled: number }[]
    totalRolesFilled: number
    averageDaysOverall: number | null
    hasLimitedHistoricalData: boolean   // true if matched-event count < 5
  }

  // Agency hit-rate
  agencyHitRate: {
    series: {
      agencyId: string
      agencyName: string
      candidatesSubmitted: number
      candidatesShortlisted: number
      candidatesHired: number
      submissionToHirePct: number      // 0..100
      shortlistToHirePct: number       // 0..100, null-safe (0 if no shortlists)
    }[]
  }

  // AI cost trend (LineChart)
  aiCostTrend: {
    series: { date: string; costUsd: number; calls: number }[]   // YYYY-MM-DD daily
    totalUsd: number
    monthOverMonthPct: number | null   // null if cannot compute
  }

  // Cycle health (3 KPI tiles)
  cycleHealth: {
    rolesOpenOver30Days: number
    expiredRoles: number
    candidatesStuckInterviewing: number
  }

  // Top performers (two small tables)
  topPerformers: {
    fastestFilledRoles: { roleId: string; roleTitle: string; daysToFill: number; customerName: string | null }[]   // top 5
    topAgenciesByHitRate: { agencyId: string; agencyName: string; submissionToHirePct: number; candidatesHired: number }[]   // top 5, must have >= 3 candidates submitted
  }
}

// ── Main action ────────────────────────────────────────────────────────────────

export async function getReportsFeed(opts: { days: 7 | 30 | 90 | 365 }): Promise<ReportsFeed> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  requireRole(ctx.userRole, 'admin')

  const { days } = opts
  const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

  // Shortlisted / interviewing / offered / hired statuses for agency hit-rate
  const SHORTLISTED_STATUSES = ['shortlisted', 'interviewing', 'offered', 'hired'] as const

  // Stuck-interviewing threshold: 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const todayStr = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'

  return withTenant(ctx.tenantId, async (tx) => {
    // ── KPI queries (independent — run in parallel) ────────────────────────

    const activeRolesPromise = tx
      .select({ count: sql<number>`count(*)::int` })
      .from(roles)
      .where(eq(roles.isActive, true))

    const candidatesAddedPromise = tx
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(gte(candidates.createdAt, rangeStart))

    const candidatesScoredPromise = tx
      .select({ count: sql<number>`count(distinct ${scores.candidateId})::int` })
      .from(scores)
      .where(
        and(
          gte(scores.createdAt, rangeStart),
          eq(scores.scoreStatus, 'complete'),
        )
      )

    const candidatesHiredPromise = tx
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          eq(candidates.status, 'hired'),
          gte(candidates.createdAt, rangeStart),
        )
      )

    const aiSpendPromise = tx
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, rangeStart))

    // ── AI cost trend queries ──────────────────────────────────────────────

    const aiCostTrendPromise = tx
      .select({
        date: sql<string>`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        calls: sql<number>`count(*)::int`,
        costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, rangeStart))
      .groupBy(sql`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)

    // Month-over-month: last 30 days vs prior 30 days
    const aiCostLast30Promise = tx
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, thirtyDaysAgo))

    const aiCostPrior30Promise = tx
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(
        and(
          gte(aiUsage.createdAt, sixtyDaysAgo),
          lt(aiUsage.createdAt, thirtyDaysAgo),
        )
      )

    // ── Cycle health queries ───────────────────────────────────────────────

    const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const rolesOpenOver30Promise = tx
      .select({ count: sql<number>`count(*)::int` })
      .from(roles)
      .where(
        and(
          eq(roles.isActive, true),
          lt(roles.createdAt, thirtyDaysAgoDate),
        )
      )

    const expiredRolesPromise = tx
      .select({ count: sql<number>`count(*)::int` })
      .from(roles)
      .where(
        and(
          eq(roles.isActive, true),
          isNotNull(roles.cutoffDate),
          sql`${roles.cutoffDate} < ${todayStr}::date`,
        )
      )

    const stuckInterviewingPromise = tx
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          eq(candidates.status, 'interviewing'),
          isNotNull(candidates.statusConfirmedAt),
          lt(candidates.statusConfirmedAt, fourteenDaysAgo),
        )
      )

    // ── Agency hit-rate query ──────────────────────────────────────────────
    // Fetch all candidates in range with agencyId, join agencies for name
    const agencyCandidatesPromise = tx
      .select({
        agencyId: candidates.agencyId,
        agencyName: agencies.name,
        status: candidates.status,
      })
      .from(candidates)
      .innerJoin(agencies, eq(candidates.agencyId, agencies.id))
      .where(
        and(
          gte(candidates.createdAt, rangeStart),
          isNotNull(candidates.agencyId),
        )
      )

    // ── Audit log: hired events for time-to-fill ───────────────────────────
    const hiredAuditPromise = tx
      .select({
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'candidate.status_changed'),
          sql`${auditLogs.metadata}->>'newStatus' = 'hired'`,
          gte(auditLogs.createdAt, rangeStart),
        )
      )

    // ── Run all parallel queries ───────────────────────────────────────────
    const [
      activeRolesRes,
      candidatesAddedRes,
      candidatesScoredRes,
      candidatesHiredRes,
      aiSpendRes,
      aiCostTrendRes,
      aiCostLast30Res,
      aiCostPrior30Res,
      rolesOpenOver30Res,
      expiredRolesRes,
      stuckInterviewingRes,
      agencyCandidatesRes,
      hiredAuditRes,
    ] = await Promise.all([
      activeRolesPromise,
      candidatesAddedPromise,
      candidatesScoredPromise,
      candidatesHiredPromise,
      aiSpendPromise,
      aiCostTrendPromise,
      aiCostLast30Promise,
      aiCostPrior30Promise,
      rolesOpenOver30Promise,
      expiredRolesPromise,
      stuckInterviewingPromise,
      agencyCandidatesPromise,
      hiredAuditPromise,
    ])

    // ── Build KPIs ─────────────────────────────────────────────────────────
    const kpis = {
      activeRoles: activeRolesRes[0]?.count ?? 0,
      candidatesAddedInRange: candidatesAddedRes[0]?.count ?? 0,
      candidatesScoredInRange: candidatesScoredRes[0]?.count ?? 0,
      candidatesHiredInRange: candidatesHiredRes[0]?.count ?? 0,
      aiSpendInRangeUsd: parseFloat(aiSpendRes[0]?.total ?? '0'),
    }

    // ── Build AI cost trend ────────────────────────────────────────────────
    const aiCostSeries = aiCostTrendRes.map((r) => ({
      date: r.date,
      costUsd: parseFloat(r.costUsd),
      calls: r.calls,
    }))

    const totalAiUsd = aiCostSeries.reduce((acc, r) => acc + r.costUsd, 0)

    const last30 = parseFloat(aiCostLast30Res[0]?.total ?? '0')
    const prior30 = parseFloat(aiCostPrior30Res[0]?.total ?? '0')
    let monthOverMonthPct: number | null = null
    if (prior30 > 0 && last30 > 0) {
      monthOverMonthPct = ((last30 - prior30) / prior30) * 100
    }

    const aiCostTrend = {
      series: aiCostSeries,
      totalUsd: totalAiUsd,
      monthOverMonthPct,
    }

    // ── Build cycle health ─────────────────────────────────────────────────
    const cycleHealth = {
      rolesOpenOver30Days: rolesOpenOver30Res[0]?.count ?? 0,
      expiredRoles: expiredRolesRes[0]?.count ?? 0,
      candidatesStuckInterviewing: stuckInterviewingRes[0]?.count ?? 0,
    }

    // ── Build agency hit-rate ──────────────────────────────────────────────
    // Group by agencyId in JS — avoids complex SQL groupBy across multiple columns
    type AgencyAcc = {
      agencyId: string
      agencyName: string
      candidatesSubmitted: number
      candidatesShortlisted: number
      candidatesHired: number
    }

    const agencyMap = new Map<string, AgencyAcc>()

    for (const row of agencyCandidatesRes) {
      if (!row.agencyId) continue
      const key = row.agencyId
      if (!agencyMap.has(key)) {
        agencyMap.set(key, {
          agencyId: key,
          agencyName: row.agencyName,
          candidatesSubmitted: 0,
          candidatesShortlisted: 0,
          candidatesHired: 0,
        })
      }
      const entry = agencyMap.get(key)!
      entry.candidatesSubmitted += 1
      if ((SHORTLISTED_STATUSES as readonly string[]).includes(row.status)) {
        entry.candidatesShortlisted += 1
      }
      if (row.status === 'hired') {
        entry.candidatesHired += 1
      }
    }

    const agencyHitRateSeries = Array.from(agencyMap.values())
      .filter((a) => a.candidatesSubmitted > 0)
      .map((a) => ({
        agencyId: a.agencyId,
        agencyName: a.agencyName,
        candidatesSubmitted: a.candidatesSubmitted,
        candidatesShortlisted: a.candidatesShortlisted,
        candidatesHired: a.candidatesHired,
        submissionToHirePct:
          a.candidatesSubmitted > 0
            ? (a.candidatesHired / a.candidatesSubmitted) * 100
            : 0,
        shortlistToHirePct:
          a.candidatesShortlisted > 0
            ? (a.candidatesHired / a.candidatesShortlisted) * 100
            : 0,
      }))

    // ── Build time-to-fill ─────────────────────────────────────────────────
    // Collect unique candidateIds from hired audit events
    const hiredCandidateIds = hiredAuditRes
      .map((r) => r.entityId)
      .filter((id): id is string => id !== null)

    // For time-to-fill we need: (hired audit createdAt) - (role createdAt)
    // Strategy:
    //  1. Prefer metadata.roleId from audit row (when present)
    //  2. Fallback: best score per candidate (highest overallScore)
    //
    // We'll fetch roles for the preferred-path candidates and scores for fallback

    type HiredEvent = {
      candidateId: string
      roleIdFromAudit: string | null
      hiredAt: Date
    }

    const hiredEvents: HiredEvent[] = hiredAuditRes
      .filter((r) => r.entityId !== null)
      .map((r) => ({
        candidateId: r.entityId!,
        // metadata is typed as Record<string, unknown> | null from Drizzle
        roleIdFromAudit:
          r.metadata &&
          typeof r.metadata === 'object' &&
          'roleId' in r.metadata &&
          typeof (r.metadata as Record<string, unknown>).roleId === 'string'
            ? (r.metadata as Record<string, unknown>).roleId as string
            : null,
        hiredAt: r.createdAt,
      }))

    // Candidate IDs that need fallback (no roleId in audit metadata)
    const needsFallbackIds = hiredEvents
      .filter((e) => e.roleIdFromAudit === null)
      .map((e) => e.candidateId)

    // Preferred path: fetch roles referenced directly in audit metadata
    const preferredRoleIds = [
      ...new Set(
        hiredEvents
          .map((e) => e.roleIdFromAudit)
          .filter((id): id is string => id !== null)
      ),
    ]

    // Fetch roles by IDs (preferred path)
    const preferredRolesMap = new Map<
      string,
      { id: string; title: string; createdAt: Date; customerId: string | null }
    >()

    if (preferredRoleIds.length > 0) {
      const preferredRoles = await tx
        .select({
          id: roles.id,
          title: roles.title,
          createdAt: roles.createdAt,
          customerId: roles.customerId,
        })
        .from(roles)
        .where(inArray(roles.id, preferredRoleIds))

      for (const r of preferredRoles) {
        preferredRolesMap.set(r.id, r)
      }
    }

    // Fallback path: fetch best score per candidate (highest overallScore)
    type FallbackScore = {
      candidateId: string
      roleId: string
      overallScore: number | null
    }
    const fallbackScoresMap = new Map<string, FallbackScore>()

    if (needsFallbackIds.length > 0) {
      const fallbackScores = await tx
        .select({
          candidateId: scores.candidateId,
          roleId: scores.roleId,
          overallScore: scores.overallScore,
        })
        .from(scores)
        .where(inArray(scores.candidateId, needsFallbackIds))

      // Keep the highest overallScore per candidate
      for (const s of fallbackScores) {
        const existing = fallbackScoresMap.get(s.candidateId)
        if (!existing || (s.overallScore ?? -1) > (existing.overallScore ?? -1)) {
          fallbackScoresMap.set(s.candidateId, s)
        }
      }
    }

    // Fetch roles for fallback (deduplicated)
    const fallbackRoleIds = [
      ...new Set(
        Array.from(fallbackScoresMap.values()).map((s) => s.roleId)
      ),
    ]

    const fallbackRolesMap = new Map<
      string,
      { id: string; title: string; createdAt: Date; customerId: string | null }
    >()

    if (fallbackRoleIds.length > 0) {
      const fallbackRoles = await tx
        .select({
          id: roles.id,
          title: roles.title,
          createdAt: roles.createdAt,
          customerId: roles.customerId,
        })
        .from(roles)
        .where(inArray(roles.id, fallbackRoleIds))

      for (const r of fallbackRoles) {
        fallbackRolesMap.set(r.id, r)
      }
    }

    // Fetch customer names for all roles we found
    const allCustomerIds = [
      ...new Set([
        ...Array.from(preferredRolesMap.values())
          .map((r) => r.customerId)
          .filter((id): id is string => id !== null),
        ...Array.from(fallbackRolesMap.values())
          .map((r) => r.customerId)
          .filter((id): id is string => id !== null),
      ]),
    ]

    const customersMap = new Map<string, string>()
    if (allCustomerIds.length > 0) {
      const customerRows = await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, allCustomerIds))

      for (const c of customerRows) {
        customersMap.set(c.id, c.name)
      }
    }

    // Build per-(candidate, role) time-to-fill entries
    type FillEntry = {
      roleId: string
      roleTitle: string
      daysToFill: number
      customerName: string | null
    }

    const fillEntries: FillEntry[] = []

    for (const event of hiredEvents) {
      const role =
        event.roleIdFromAudit !== null
          ? preferredRolesMap.get(event.roleIdFromAudit)
          : (() => {
              const fb = fallbackScoresMap.get(event.candidateId)
              return fb ? fallbackRolesMap.get(fb.roleId) : undefined
            })()

      if (!role) continue

      const daysToFill =
        (event.hiredAt.getTime() - role.createdAt.getTime()) / 86_400_000

      // Discard invalid entries (data error or orphan)
      if (daysToFill < 0 || daysToFill > 730) continue

      fillEntries.push({
        roleId: role.id,
        roleTitle: role.title,
        daysToFill,
        customerName:
          role.customerId ? (customersMap.get(role.customerId) ?? null) : null,
      })
    }

    // Group by customerName for the series
    const customerFillMap = new Map<
      string,
      { totalDays: number; count: number }
    >()

    for (const entry of fillEntries) {
      const key = entry.customerName ?? '(No Customer)'
      const acc = customerFillMap.get(key) ?? { totalDays: 0, count: 0 }
      acc.totalDays += entry.daysToFill
      acc.count += 1
      customerFillMap.set(key, acc)
    }

    const timeToFillSeries = Array.from(customerFillMap.entries()).map(
      ([customerName, acc]) => ({
        customerName,
        avgDaysToFill: acc.totalDays / acc.count,
        rolesFilled: acc.count,
      })
    )

    const totalRolesFilled = fillEntries.length
    const matchedEventCount = fillEntries.length
    const averageDaysOverall =
      matchedEventCount > 0
        ? fillEntries.reduce((sum, e) => sum + e.daysToFill, 0) / matchedEventCount
        : null
    const hasLimitedHistoricalData = matchedEventCount < 5

    const timeToFill = {
      series: timeToFillSeries,
      totalRolesFilled,
      averageDaysOverall,
      hasLimitedHistoricalData,
    }

    // ── Build top performers ───────────────────────────────────────────────

    // fastestFilledRoles: top 5 lowest daysToFill from fillEntries (per-role, not per-candidate)
    const fastestFilledRoles = [...fillEntries]
      .sort((a, b) => a.daysToFill - b.daysToFill)
      .slice(0, 5)
      .map((e) => ({
        roleId: e.roleId,
        roleTitle: e.roleTitle,
        daysToFill: e.daysToFill,
        customerName: e.customerName,
      }))

    // topAgenciesByHitRate: filter submitted >= 3, sort desc by submissionToHirePct, top 5
    const topAgenciesByHitRate = agencyHitRateSeries
      .filter((a) => a.candidatesSubmitted >= 3)
      .sort((a, b) => b.submissionToHirePct - a.submissionToHirePct)
      .slice(0, 5)
      .map((a) => ({
        agencyId: a.agencyId,
        agencyName: a.agencyName,
        submissionToHirePct: a.submissionToHirePct,
        candidatesHired: a.candidatesHired,
      }))

    return {
      rangeDays: days,
      generatedAt: new Date(),
      kpis,
      timeToFill,
      agencyHitRate: { series: agencyHitRateSeries },
      aiCostTrend,
      cycleHealth,
      topPerformers: {
        fastestFilledRoles,
        topAgenciesByHitRate,
      },
    }
  })
}
