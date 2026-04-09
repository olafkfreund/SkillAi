// Required env vars:
// MICROSOFT_CLIENT_ID=
// MICROSOFT_CLIENT_SECRET=
// MICROSOFT_TENANT_ID=common   (or specific tenant GUID)
// NEXT_PUBLIC_APP_URL=http://localhost:3000

import type { CalendarEvent } from './google'

interface MicrosoftTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  token_type: string
}

// Refresh the Microsoft access token using the stored refresh token.
// Returns new access token and expiry, or null on failure.
export async function refreshMicrosoftToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common'
  if (!clientId || !clientSecret) return null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/auth/calendar/microsoft/callback`

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        redirect_uri: redirectUri,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      }),
    }
  )

  if (!res.ok) return null

  const data = (await res.json()) as MicrosoftTokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  return { accessToken: data.access_token, expiresAt }
}

// Create a Microsoft Graph Calendar event.
// Attempts token refresh on 401. Returns event ID and web link, or null.
export async function createMicrosoftEvent(
  accessToken: string,
  refreshToken: string | null,
  event: CalendarEvent
): Promise<{ eventId: string; webLink: string } | null> {
  const endAt = new Date(event.startAt.getTime() + event.durationMinutes * 60_000)

  const makeBodyContent = () => {
    const parts: string[] = []
    if (event.description) parts.push(event.description)
    if (event.meetingUrl) parts.push(`Meeting URL: <a href="${event.meetingUrl}">${event.meetingUrl}</a>`)
    return parts.join('<br/><br/>')
  }

  const buildBody = () => ({
    subject: event.title,
    body: {
      contentType: 'HTML',
      content: makeBodyContent(),
    },
    start: { dateTime: event.startAt.toISOString(), timeZone: 'UTC' },
    end: { dateTime: endAt.toISOString(), timeZone: 'UTC' },
    ...(event.location ? { location: { displayName: event.location } } : {}),
    ...(event.attendeeEmails?.length
      ? {
          attendees: event.attendeeEmails.map((email) => ({
            emailAddress: { address: email },
            type: 'required',
          })),
        }
      : {}),
  })

  const postEvent = async (token: string) =>
    fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBody()),
    })

  let res = await postEvent(accessToken)

  // Token expired — try refresh
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshMicrosoftToken(refreshToken)
    if (!refreshed) return null
    res = await postEvent(refreshed.accessToken)
  }

  if (!res.ok) return null

  const data = (await res.json()) as { id: string; webLink: string }
  return { eventId: data.id, webLink: data.webLink }
}

// Delete a Microsoft Graph Calendar event by event ID.
export async function deleteMicrosoftEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
