import type { CalendarEventSnapshot } from './list-google-events'
import { refreshMicrosoftToken } from './microsoft'

export type { CalendarEventSnapshot }

type MicrosoftEventItem = {
  id: string
  subject?: string
  isCancelled?: boolean
  lastModifiedDateTime?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
}

type MicrosoftEventsResponse = {
  value?: MicrosoftEventItem[]
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

async function fetchEvents(
  url: string,
  accessToken: string
): Promise<{ response: Response; body: MicrosoftEventsResponse }> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) return { response, body: {} }
  const body = (await response.json()) as MicrosoftEventsResponse
  return { response, body }
}

/**
 * List Microsoft Graph Calendar events in the given time window.
 * calendarId is accepted for API symmetry but ignored — Graph uses /me/events.
 * Mirrors the auto-refresh-on-401 pattern from createMicrosoftEvent.
 * Returns up to 250 events (no pagination in v1).
 */
export async function listMicrosoftEvents(opts: {
  accessToken: string
  refreshToken: string | null
  calendarId: string
  timeMin: Date
  timeMax: Date
}): Promise<{
  events: CalendarEventSnapshot[]
  refreshedToken: { accessToken: string; expiresAt: Date } | null
}> {
  const { timeMin, timeMax } = opts
  let { accessToken } = opts

  // Graph OData filter — use ISO strings without the trailing Z to avoid encoding issues
  const filter =
    `start/dateTime ge '${timeMin.toISOString()}' and start/dateTime le '${timeMax.toISOString()}'`
  const select = 'id,subject,start,end,isCancelled,lastModifiedDateTime'
  const url =
    `https://graph.microsoft.com/v1.0/me/events` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$top=250` +
    `&$select=${select}`

  let refreshedToken: { accessToken: string; expiresAt: Date } | null = null

  let { response, body } = await fetchEvents(url, accessToken)

  // On 401, attempt token refresh and retry once
  if (response.status === 401 && opts.refreshToken) {
    const refreshed = await refreshMicrosoftToken(opts.refreshToken)
    if (!refreshed) {
      return { events: [], refreshedToken: null }
    }
    accessToken = refreshed.accessToken
    refreshedToken = refreshed;
    ({ response, body } = await fetchEvents(url, accessToken))
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable)')
    throw new Error(`Microsoft Graph API error ${response.status}: ${text}`)
  }

  const items = body.value ?? []
  const events: CalendarEventSnapshot[] = items.map((item) => ({
    eventId: item.id,
    start: parseDate(item.start?.dateTime),
    end: parseDate(item.end?.dateTime),
    status: item.isCancelled ? 'cancelled' : 'confirmed',
    updated: parseDate(item.lastModifiedDateTime) ?? new Date(0),
    summary: item.subject ?? null,
  }))

  return { events, refreshedToken }
}
