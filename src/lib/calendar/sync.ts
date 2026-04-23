// Calendar sync helper — reads the user's connected calendars from DB and
// pushes a slot event to each connected provider.
// calendar_connections has no RLS — query directly with db.

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { calendarConnections } from '@/db/schema'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  refreshGoogleToken,
  type CalendarEvent,
} from './google'
import {
  createMicrosoftEvent,
  deleteMicrosoftEvent,
  refreshMicrosoftToken,
} from './microsoft'

export type { CalendarEvent }

export async function syncSlotToCalendars(
  userId: string,
  event: CalendarEvent,
  attendeeEmail?: string
): Promise<{ googleEventId?: string; microsoftEventId?: string }> {
  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))

  const result: { googleEventId?: string; microsoftEventId?: string } = {}

  const eventWithAttendee: CalendarEvent = {
    ...event,
    attendeeEmails: attendeeEmail ? [attendeeEmail] : event.attendeeEmails,
  }

  for (const conn of connections) {
    // Decrypt stored tokens
    const decryptedAccess = decrypt(conn.accessToken)
    const decryptedRefresh = conn.refreshToken ? decrypt(conn.refreshToken) : null

    if (conn.provider === 'google') {
      // Refresh token if expired
      let accessToken = decryptedAccess
      if (conn.tokenExpiry && conn.tokenExpiry < new Date() && decryptedRefresh) {
        const refreshed = await refreshGoogleToken(decryptedRefresh)
        if (refreshed) {
          accessToken = refreshed.accessToken
          // Update stored token (re-encrypt)
          await db
            .update(calendarConnections)
            .set({
              accessToken: encrypt(refreshed.accessToken),
              tokenExpiry: refreshed.expiresAt,
              updatedAt: new Date(),
            })
            .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, 'google')))
        }
      }

      const googleResult = await createGoogleEvent(
        accessToken,
        decryptedRefresh,
        conn.calendarId ?? 'primary',
        eventWithAttendee
      )
      if (googleResult) result.googleEventId = googleResult.eventId
    }

    if (conn.provider === 'microsoft') {
      // Refresh token if expired
      let accessToken = decryptedAccess
      if (conn.tokenExpiry && conn.tokenExpiry < new Date() && decryptedRefresh) {
        const refreshed = await refreshMicrosoftToken(decryptedRefresh)
        if (refreshed) {
          accessToken = refreshed.accessToken
          await db
            .update(calendarConnections)
            .set({
              accessToken: encrypt(refreshed.accessToken),
              tokenExpiry: refreshed.expiresAt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(calendarConnections.userId, userId),
                eq(calendarConnections.provider, 'microsoft')
              )
            )
        }
      }

      const msResult = await createMicrosoftEvent(
        accessToken,
        decryptedRefresh,
        eventWithAttendee
      )
      if (msResult) result.microsoftEventId = msResult.eventId
    }
  }

  return result
}

// Remove a slot's calendar events from all connected providers.
export async function deleteSlotFromCalendars(
  userId: string,
  googleEventId: string | null | undefined,
  microsoftEventId: string | null | undefined
): Promise<void> {
  if (!googleEventId && !microsoftEventId) return

  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))

  for (const conn of connections) {
    const decryptedAccess = decrypt(conn.accessToken)
    if (conn.provider === 'google' && googleEventId) {
      await deleteGoogleEvent(decryptedAccess, conn.calendarId ?? 'primary', googleEventId)
    }
    if (conn.provider === 'microsoft' && microsoftEventId) {
      await deleteMicrosoftEvent(decryptedAccess, microsoftEventId)
    }
  }
}
