// Calendar sync loop — pull side.
//
// Reads calendar connections, fetches event snapshots from Google / Microsoft,
// and applies reschedule + cancellation changes back to interview_slots.
//
// RLS strategy:
//   - calendarConnections: no RLS — query with bare db.
//   - users: has a permissive auth_lookup policy (allows select when
//     app.tenant_id is null/empty), so a bare db.select() works to resolve
//     the user's tenantId without setting tenant context.
//   - interviewSlots: RLS enabled — all reads and writes must be wrapped in
//     withTenant(tenantId, ...).

import { eq, and, isNotNull } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { calendarConnections, interviewSlots, users } from '@/db/schema'
import { decrypt, encrypt } from '@/lib/crypto'
import { writeAuditLog } from '@/lib/audit'
import { listGoogleEvents } from './list-google-events'
import { listMicrosoftEvents } from './list-microsoft-events'
import type { CalendarEventSnapshot } from './list-google-events'

export type SyncSummary = {
  totalConnections: number
  processedConnections: number
  syncedSlots: number
  rescheduledCount: number
  cancelledCount: number
  errors: { connectionId: string; provider: string; error: string }[]
}

/**
 * Compute durationMinutes from two Date objects.
 * Returns 0 if either is null or if end is before start.
 */
function computeDuration(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0
  const diff = end.getTime() - start.getTime()
  return Math.max(0, Math.round(diff / 60_000))
}

/**
 * Fetch the tenantId for a userId using a bare db select.
 * Works because users.users_auth_lookup policy permits select
 * when app.tenant_id is null / empty (i.e., no tenant context set).
 */
async function resolveTenantId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0]?.tenantId ?? null
}

/**
 * Process a single calendar connection: list events, diff against slots,
 * and apply updates.
 *
 * Returns per-connection counters for the summary.
 */
async function processConnection(
  connection: typeof calendarConnections.$inferSelect,
  timeMin: Date,
  timeMax: Date
): Promise<{ rescheduledCount: number; cancelledCount: number }> {
  const tenantId = await resolveTenantId(connection.userId)
  if (!tenantId) {
    throw new Error(`Could not resolve tenantId for user ${connection.userId}`)
  }

  // Decrypt stored tokens
  const decryptedAccess = decrypt(connection.accessToken)
  const decryptedRefresh = connection.refreshToken ? decrypt(connection.refreshToken) : null

  // Fetch events from the calendar provider
  let events: CalendarEventSnapshot[]
  let refreshedToken: { accessToken: string; expiresAt: Date } | null = null

  if (connection.provider === 'google') {
    const result = await listGoogleEvents({
      accessToken: decryptedAccess,
      refreshToken: decryptedRefresh,
      calendarId: connection.calendarId ?? 'primary',
      timeMin,
      timeMax,
    })
    events = result.events
    refreshedToken = result.refreshedToken
  } else if (connection.provider === 'microsoft') {
    const result = await listMicrosoftEvents({
      accessToken: decryptedAccess,
      refreshToken: decryptedRefresh,
      calendarId: connection.calendarId ?? 'primary',
      timeMin,
      timeMax,
    })
    events = result.events
    refreshedToken = result.refreshedToken
  } else {
    // Unknown provider — skip
    return { rescheduledCount: 0, cancelledCount: 0 }
  }

  // Persist refreshed token if the provider returned one
  if (refreshedToken) {
    await db
      .update(calendarConnections)
      .set({
        accessToken: encrypt(refreshedToken.accessToken),
        tokenExpiry: refreshedToken.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarConnections.id, connection.id))
  }

  // Build a fast lookup map: eventId → snapshot
  const eventMap = new Map<string, CalendarEventSnapshot>(
    events.map((e) => [e.eventId, e])
  )

  const now = new Date()
  const pastThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  let rescheduledCount = 0
  let cancelledCount = 0

  // Fetch all slots for this user that have an event id for the matching provider.
  // interview_slots has RLS — wrap in withTenant.
  const eventIdColumn =
    connection.provider === 'google' ? interviewSlots.googleEventId : interviewSlots.microsoftEventId

  await withTenant(tenantId, async (tx) => {
    const slots = await tx
      .select()
      .from(interviewSlots)
      .where(
        and(
          eq(interviewSlots.createdBy, connection.userId),
          isNotNull(eventIdColumn)
        )
      )

    for (const slot of slots) {
      const eventId =
        connection.provider === 'google' ? slot.googleEventId : slot.microsoftEventId
      if (!eventId) continue

      const event = eventMap.get(eventId)

      // Event missing from calendar → treat as cancelled
      if (!event || event.status === 'cancelled') {
        if (slot.status === 'cancelled') continue // already cancelled — no-op

        await tx
          .update(interviewSlots)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(interviewSlots.id, slot.id))

        await writeAuditLog(tenantId, {
          action: 'interview_slot.cancelled_external',
          entityType: 'interview_slot',
          entityId: slot.id,
          entityLabel: slot.title,
          metadata: { eventId, provider: connection.provider },
        })

        cancelledCount++
        continue
      }

      // Skip past events (start older than 1 day ago)
      if (event.start && event.start < pastThreshold) continue

      // Conflict resolution: SkillAI-side edit wins
      if (slot.updatedAt > event.updated) continue

      // Compute new values
      const newScheduledAt = event.start
      const newDurationMinutes = computeDuration(event.start, event.end)

      // Compare — skip if unchanged
      const scheduledAtChanged =
        newScheduledAt !== null &&
        newScheduledAt.getTime() !== slot.scheduledAt.getTime()
      const durationChanged =
        newDurationMinutes > 0 && newDurationMinutes !== slot.durationMinutes

      if (!scheduledAtChanged && !durationChanged) continue

      // Apply reschedule
      const updates: Partial<typeof interviewSlots.$inferInsert> = { updatedAt: new Date() }
      if (scheduledAtChanged && newScheduledAt) updates.scheduledAt = newScheduledAt
      if (durationChanged) updates.durationMinutes = newDurationMinutes

      await tx
        .update(interviewSlots)
        .set(updates)
        .where(eq(interviewSlots.id, slot.id))

      await writeAuditLog(tenantId, {
        action: 'interview_slot.rescheduled_external',
        entityType: 'interview_slot',
        entityId: slot.id,
        entityLabel: slot.title,
        metadata: {
          oldScheduledAt: slot.scheduledAt.toISOString(),
          newScheduledAt: newScheduledAt?.toISOString() ?? null,
          eventId,
          provider: connection.provider,
        },
      })

      rescheduledCount++
    }
  })

  return { rescheduledCount, cancelledCount }
}

/**
 * Run a full calendar sync across all connections.
 * Each connection is isolated — one failure does not stop others.
 */
export async function runCalendarSync(): Promise<SyncSummary> {
  const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  // calendarConnections has no RLS — query directly
  const connections = await db.select().from(calendarConnections)

  const summary: SyncSummary = {
    totalConnections: connections.length,
    processedConnections: 0,
    syncedSlots: 0,
    rescheduledCount: 0,
    cancelledCount: 0,
    errors: [],
  }

  for (const connection of connections) {
    try {
      const { rescheduledCount, cancelledCount } = await processConnection(
        connection,
        timeMin,
        timeMax
      )
      summary.rescheduledCount += rescheduledCount
      summary.cancelledCount += cancelledCount
      summary.syncedSlots += rescheduledCount + cancelledCount
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      summary.errors.push({
        connectionId: connection.id,
        provider: connection.provider,
        error: errorMessage,
      })

      // Audit the failure against the user's tenant if resolvable
      try {
        const tenantId = await resolveTenantId(connection.userId)
        if (tenantId) {
          await writeAuditLog(tenantId, {
            action: 'calendar.sync_failed',
            entityType: 'calendar_connection',
            entityId: connection.id,
            metadata: {
              connectionId: connection.id,
              provider: connection.provider,
              error: errorMessage,
            },
          })
        }
      } catch {
        // Audit failure must not propagate
        console.error('[calendar-sync] Failed to write sync_failed audit log for connection', connection.id)
      }
    }
  }

  summary.processedConnections = summary.totalConnections - summary.errors.length

  // Log summary to console (cross-tenant — no writeAuditLog here)
  console.info('[calendar-sync] Sync completed', JSON.stringify(summary))

  return summary
}
