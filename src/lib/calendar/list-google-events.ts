import { refreshGoogleToken } from './google'

export type CalendarEventSnapshot = {
  eventId: string
  start: Date | null
  end: Date | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  updated: Date
  summary: string | null
}

type GoogleEventItem = {
  id: string
  status?: string
  updated?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

type GoogleEventsResponse = {
  items?: GoogleEventItem[]
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function mapStatus(raw: string | undefined): 'confirmed' | 'tentative' | 'cancelled' {
  if (raw === 'cancelled') return 'cancelled'
  if (raw === 'tentative') return 'tentative'
  return 'confirmed'
}

async function fetchEvents(
  url: string,
  accessToken: string
): Promise<{ response: Response; body: GoogleEventsResponse }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return { response, body: {} }
  const body = (await response.json()) as GoogleEventsResponse
  return { response, body }
}

/**
 * List Google Calendar events in the given time window.
 * Mirrors the auto-refresh-on-401 pattern from createGoogleEvent.
 * Returns up to 250 events (no pagination in v1).
 */
export async function listGoogleEvents(opts: {
  accessToken: string
  refreshToken: string | null
  calendarId: string
  timeMin: Date
  timeMax: Date
}): Promise<{
  events: CalendarEventSnapshot[]
  refreshedToken: { accessToken: string; expiresAt: Date } | null
}> {
  const { calendarId, timeMin, timeMax } = opts
  let { accessToken } = opts

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${timeMin.toISOString()}` +
    `&timeMax=${timeMax.toISOString()}` +
    `&singleEvents=true` +
    `&showDeleted=true` +
    `&maxResults=250`

  let refreshedToken: { accessToken: string; expiresAt: Date } | null = null

  let { response, body } = await fetchEvents(url, accessToken)

  // On 401, attempt token refresh and retry once
  if (response.status === 401 && opts.refreshToken) {
    const refreshed = await refreshGoogleToken(opts.refreshToken)
    if (!refreshed) {
      return { events: [], refreshedToken: null }
    }
    accessToken = refreshed.accessToken
    refreshedToken = refreshed;
    ({ response, body } = await fetchEvents(url, accessToken))
  }

  // Calendar not found — treat as empty
  if (response.status === 404) {
    return { events: [], refreshedToken }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable)')
    throw new Error(`Google Calendar API error ${response.status}: ${text}`)
  }

  const items = body.items ?? []
  const events: CalendarEventSnapshot[] = items.map((item) => ({
    eventId: item.id,
    start: parseDate(item.start?.dateTime ?? item.start?.date),
    end: parseDate(item.end?.dateTime ?? item.end?.date),
    status: mapStatus(item.status),
    updated: parseDate(item.updated) ?? new Date(0),
    summary: item.summary ?? null,
  }))

  return { events, refreshedToken }
}
