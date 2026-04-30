/**
 * getForYouFeed — personalised action-stream data for the "For You" dashboard
 * section (GitHub Issue #84).
 *
 * Returns five independent streams, each capped at 5 items:
 *  1. pendingInterviews  — today & tomorrow (non-cancelled)
 *  2. candidatesAwaitingScore — pending/processing scores created < 7 days ago
 *  3. stalePriorities   — roles where at least one candidate score pre-dates the
 *                          most recent priorityKeywords edit
 *  4. expiredRoles      — cutoffDate < today AND isActive = true
 *  5. pendingApprovals  — only for hiring_manager; pending decisions per assigned role
 */

import { and, count, eq, gte, lt, isNotNull, inArray, sql } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  interviewSlots,
  candidates,
  scores,
  roles,
  customers,
  roleManagers,
  candidateRoleApprovals,
} from '@/db/schema'
import {
  getRecentSubmissionsForTenant,
  type SubmissionForDashboard,
} from '@/actions/role-submissions'

// ── Public types ───────────────────────────────────────────────────────────────

export type ForYouFeed = {
  pendingInterviews: {
    slotId: string
    candidateId: string
    candidateName: string
    roleId: string | null
    roleTitle: string | null
    scheduledAt: Date
    isToday: boolean
  }[]
  candidatesAwaitingScore: {
    candidateId: string
    candidateName: string
    roleId: string
    roleTitle: string
    scoreStatus: 'pending' | 'processing'
    uploadedAt: Date
  }[]
  stalePriorities: {
    roleId: string
    roleTitle: string
    staleCandidateCount: number
    prioritiesUpdatedAt: Date
  }[]
  expiredRoles: {
    roleId: string
    roleTitle: string
    cutoffDate: Date
    daysExpired: number
    customerName: string | null
  }[]
  pendingApprovals: {
    roleId: string
    roleTitle: string
    pendingCount: number
    sentAt: Date | null
  }[]
  staleSubmissions: SubmissionForDashboard[]
}

// ── Main function ──────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function getForYouFeed(
  userId: string,
  userRole: 'admin' | 'recruiter' | 'hiring_manager' | 'viewer',
  tenantId: string,
): Promise<ForYouFeed> {
  // Pre-compute UTC time bounds once
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setUTCHours(0, 0, 0, 0)

  const endOfToday = new Date(startOfToday)
  endOfToday.setUTCDate(startOfToday.getUTCDate() + 1)

  const endOfTomorrow = new Date(startOfToday)
  endOfTomorrow.setUTCDate(startOfToday.getUTCDate() + 2)

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const todayDateStr = now.toISOString().slice(0, 10) // 'YYYY-MM-DD'

  // Stale submissions run in parallel with the main withTenant block because
  // getRecentSubmissionsForTenant manages its own connection via getActionContext.
  const staleSubmissionsPromise: Promise<SubmissionForDashboard[]> =
    userRole === 'hiring_manager'
      ? Promise.resolve([])
      : getRecentSubmissionsForTenant({
          staleBefore: new Date(now.getTime() - SEVEN_DAYS_MS),
          status: ['submitted', 'interview_scheduled', 'interview_done', 'feedback_pending'],
          limit: 5,
        })

  const [feedResult, staleSubmissions] = await Promise.all([
    withTenant(tenantId, async (tx) => {
    // ── 1. Pending interviews (today & tomorrow) ────────────────────────────
    const interviewsPromise = tx
      .select({
        slotId: interviewSlots.id,
        candidateId: interviewSlots.candidateId,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        roleId: interviewSlots.roleId,
        roleTitle: roles.title,
        scheduledAt: interviewSlots.scheduledAt,
      })
      .from(interviewSlots)
      .innerJoin(candidates, eq(interviewSlots.candidateId, candidates.id))
      .leftJoin(roles, eq(interviewSlots.roleId, roles.id))
      .where(
        and(
          gte(interviewSlots.scheduledAt, startOfToday),
          lt(interviewSlots.scheduledAt, endOfTomorrow),
          sql`${interviewSlots.status} != 'cancelled'`,
        )
      )
      .orderBy(interviewSlots.scheduledAt)
      .limit(5)

    // ── 2. Candidates awaiting score (pending/processing, last 7 days) ─────
    const awaitingScorePromise = tx
      .select({
        candidateId: scores.candidateId,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        roleId: scores.roleId,
        roleTitle: roles.title,
        scoreStatus: scores.scoreStatus,
        uploadedAt: scores.createdAt,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .innerJoin(roles, eq(scores.roleId, roles.id))
      .where(
        and(
          inArray(scores.scoreStatus, ['pending', 'processing']),
          gte(scores.createdAt, sevenDaysAgo),
        )
      )
      .orderBy(sql`${scores.createdAt} desc`)
      .limit(5)

    // ── 3. Stale priorities ─────────────────────────────────────────────────
    // Count scores per active role whose updatedAt (or createdAt fallback) is
    // older than the role's priorityKeywordsUpdatedAt.
    const stalePrioritiesPromise = tx
      .select({
        roleId: roles.id,
        roleTitle: roles.title,
        prioritiesUpdatedAt: roles.priorityKeywordsUpdatedAt,
        staleCount: sql<number>`count(${scores.id})::int`,
      })
      .from(roles)
      .innerJoin(scores, eq(scores.roleId, roles.id))
      .where(
        and(
          eq(roles.isActive, true),
          isNotNull(roles.priorityKeywordsUpdatedAt),
          sql`coalesce(${scores.updatedAt}, ${scores.createdAt}) < ${roles.priorityKeywordsUpdatedAt}`,
        )
      )
      .groupBy(roles.id, roles.title, roles.priorityKeywordsUpdatedAt)
      .orderBy(sql`count(${scores.id}) desc`)
      .limit(5)

    // ── 4. Expired roles ────────────────────────────────────────────────────
    const expiredRolesPromise = tx
      .select({
        roleId: roles.id,
        roleTitle: roles.title,
        cutoffDate: roles.cutoffDate,
        customerName: customers.name,
      })
      .from(roles)
      .leftJoin(customers, eq(roles.customerId, customers.id))
      .where(
        and(
          eq(roles.isActive, true),
          isNotNull(roles.cutoffDate),
          sql`${roles.cutoffDate} < ${todayDateStr}::date`,
        )
      )
      .orderBy(sql`${roles.cutoffDate} asc`)
      .limit(5)

    // ── 5. Pending approvals (hiring_manager only) ──────────────────────────
    const pendingApprovalsPromise: Promise<
      { roleId: string; roleTitle: string; pendingCount: number; sentAt: Date | null }[]
    > =
      userRole !== 'hiring_manager'
        ? Promise.resolve([])
        : tx
            .select({
              roleId: roles.id,
              roleTitle: roles.title,
              sentAt: roles.shortlistSentAt,
              pendingCount: count(candidateRoleApprovals.id),
            })
            .from(roleManagers)
            .innerJoin(roles, eq(roleManagers.roleId, roles.id))
            .leftJoin(
              candidateRoleApprovals,
              and(
                eq(candidateRoleApprovals.roleId, roles.id),
                eq(candidateRoleApprovals.managerId, userId),
                eq(candidateRoleApprovals.decision, 'pending'),
              )
            )
            .where(
              and(
                eq(roleManagers.userId, userId),
                eq(roles.isActive, true),
              )
            )
            .groupBy(roles.id, roles.title, roles.shortlistSentAt)
            .orderBy(sql`count(${candidateRoleApprovals.id}) desc`)
            .limit(5)
            .then((rows) =>
              rows
                .filter((r) => Number(r.pendingCount) > 0)
                .map((r) => ({
                  roleId: r.roleId,
                  roleTitle: r.roleTitle,
                  pendingCount: Number(r.pendingCount),
                  sentAt: r.sentAt,
                }))
            )

    // Run all five sub-queries in parallel
    const [
      rawInterviews,
      rawAwaitingScore,
      rawStalePriorities,
      rawExpiredRoles,
      pendingApprovals,
    ] = await Promise.all([
      interviewsPromise,
      awaitingScorePromise,
      stalePrioritiesPromise,
      expiredRolesPromise,
      pendingApprovalsPromise,
    ])

    // ── Shape pendingInterviews ─────────────────────────────────────────────
    const pendingInterviews = rawInterviews.map((row) => ({
      slotId: row.slotId,
      candidateId: row.candidateId,
      candidateName: `${row.candidateFirstName} ${row.candidateLastName}`,
      roleId: row.roleId ?? null,
      roleTitle: row.roleTitle ?? null,
      scheduledAt: row.scheduledAt,
      isToday: row.scheduledAt < endOfToday,
    }))

    // ── Shape candidatesAwaitingScore ───────────────────────────────────────
    const candidatesAwaitingScore = rawAwaitingScore.map((row) => ({
      candidateId: row.candidateId,
      candidateName: `${row.candidateFirstName} ${row.candidateLastName}`,
      roleId: row.roleId,
      roleTitle: row.roleTitle,
      scoreStatus: row.scoreStatus as 'pending' | 'processing',
      uploadedAt: row.uploadedAt,
    }))

    // ── Shape stalePriorities ───────────────────────────────────────────────
    const stalePriorities = rawStalePriorities
      .filter((row) => row.prioritiesUpdatedAt !== null)
      .map((row) => ({
        roleId: row.roleId,
        roleTitle: row.roleTitle,
        staleCandidateCount: row.staleCount,
        prioritiesUpdatedAt: row.prioritiesUpdatedAt as Date,
      }))

    // ── Shape expiredRoles ──────────────────────────────────────────────────
    const expiredRoles = rawExpiredRoles
      .filter((row) => row.cutoffDate !== null)
      .map((row) => {
        const cutoffDate = new Date(row.cutoffDate as string)
        const daysExpired = Math.floor(
          (now.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        return {
          roleId: row.roleId,
          roleTitle: row.roleTitle,
          cutoffDate,
          daysExpired: Math.max(0, daysExpired),
          customerName: row.customerName ?? null,
        }
      })

    return {
      pendingInterviews,
      candidatesAwaitingScore,
      stalePriorities,
      expiredRoles,
      pendingApprovals,
    }
  }),
    staleSubmissionsPromise,
  ])

  return {
    ...feedResult,
    staleSubmissions,
  }
}
