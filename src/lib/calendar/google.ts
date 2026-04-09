// Required env vars:
// GOOGLE_CLIENT_ID=
// GOOGLE_CLIENT_SECRET=
// NEXT_PUBLIC_APP_URL=http://localhost:3000

export interface CalendarEvent {
  title: string
  description?: string
  startAt: Date
  durationMinutes: number
  location?: string
  meetingUrl?: string
  attendeeEmails?: string[]
}

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// Refresh the Google access token using the stored refresh token.
// Returns new access token and expiry, or null on failure.
export async function refreshGoogleToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null

  const data = (await res.json()) as GoogleTokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  return { accessToken: data.access_token, expiresAt }
}

// Create a Google Calendar event. Attempts a token refresh if the initial
// request returns 401. Returns the created event ID and HTML link, or null.
export async function createGoogleEvent(
  accessToken: string,
  refreshToken: string | null,
  calendarId: string,
  event: CalendarEvent
): Promise<{ eventId: string; htmlLink: string } | null> {
  const endAt = new Date(event.startAt.getTime() + event.durationMinutes * 60_000)

  const buildBody = (description: string | undefined) => ({
    summary: event.title,
    description: description ?? '',
    start: { dateTime: event.startAt.toISOString(), timeZone: 'UTC' },
    end: { dateTime: endAt.toISOString(), timeZone: 'UTC' },
    ...(event.location ? { location: event.location } : {}),
    ...(event.attendeeEmails?.length
      ? { attendees: event.attendeeEmails.map((email) => ({ email })) }
      : {}),
  })

  const makeDescription = () => {
    const parts: string[] = []
    if (event.description) parts.push(event.description)
    if (event.meetingUrl) parts.push(`Meeting URL: ${event.meetingUrl}`)
    return parts.join('\n\n')
  }

  const postEvent = async (token: string) =>
    fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildBody(makeDescription())),
      }
    )

  let res = await postEvent(accessToken)

  // Token expired — try refresh
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshGoogleToken(refreshToken)
    if (!refreshed) return null
    res = await postEvent(refreshed.accessToken)
  }

  if (!res.ok) return null

  const data = (await res.json()) as { id: string; htmlLink: string }
  return { eventId: data.id, htmlLink: data.htmlLink }
}

// Delete a Google Calendar event by event ID.
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
}
