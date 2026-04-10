/**
 * Lightweight ICS (iCalendar) file parser.
 *
 * Handles RFC 5545 line folding, DTSTART/DTEND with TZID parameters,
 * date-only values, UTC and local datetime formats, and meeting URL
 * extraction from URL, LOCATION, and DESCRIPTION fields.
 *
 * No external dependencies required — ICS is plain text.
 */

export type ParsedIcsEvent = {
  uid: string
  summary: string
  start: Date
  end: Date
  durationMinutes: number
  location: string | null
  meetingUrl: string | null
  description: string | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Unfold RFC 5545 line folding: any line whose continuation starts with
 * a SPACE or TAB is joined to the previous line (the whitespace character
 * itself is consumed).
 */
function unfoldLines(content: string): string[] {
  // Normalise CRLF → LF
  const normalised = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const folded = normalised.split('\n')
  const result: string[] = []

  for (const line of folded) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && result.length > 0) {
      result[result.length - 1] += line.slice(1)
    } else {
      result.push(line)
    }
  }

  return result
}

/**
 * Parse a single ICS datetime string into a Date.
 *
 * Supported formats:
 *   - `20240415T140000Z`   → UTC
 *   - `20240415T140000`    → local (parsed as-is via new Date)
 *   - `20240415`           → date-only → midnight UTC
 */
function parseIcsDateTime(value: string): Date | null {
  const v = value.trim()

  // Date-only: exactly 8 numeric chars
  if (/^\d{8}$/.test(v)) {
    const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d
  }

  // DateTime with or without trailing Z
  if (/^\d{8}T\d{6}(Z?)$/.test(v)) {
    const year = v.slice(0, 4)
    const month = v.slice(4, 6)
    const day = v.slice(6, 8)
    const hour = v.slice(9, 11)
    const min = v.slice(11, 13)
    const sec = v.slice(13, 15)
    const utc = v.endsWith('Z') ? 'Z' : ''
    const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}${utc}`
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d
  }

  return null
}

/**
 * Extract the raw value from an ICS property line, stripping any parameters.
 *
 * Examples:
 *   `DTSTART;TZID=Europe/London:20240415T140000`  → `20240415T140000`
 *   `DTSTART:20240415T140000Z`                     → `20240415T140000Z`
 */
function extractValue(line: string): string {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return ''
  return line.slice(colonIdx + 1)
}

/**
 * Strip the property name and any parameters, return only the value portion.
 * Also decodes ICS text escaping: `\n` → newline, `\\` → `\`, `\,` → `,`.
 */
function decodeText(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\\\/g, '\\')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
}

/**
 * Try to extract a meeting URL from a string (LOCATION or DESCRIPTION).
 * Checks for Teams, Zoom, and Google Meet patterns first; falls back to any
 * https:// URL.
 */
function extractUrlFromText(text: string): string | null {
  if (!text) return null

  // Meeting-specific patterns (in priority order)
  const meetingPatterns = [
    /https:\/\/[^\s"<>]*teams\.microsoft\.com\/l\/meetup-join[^\s"<>]*/i,
    /https:\/\/[^\s"<>]*zoom\.us\/j\/[^\s"<>]*/i,
    /https:\/\/meet\.google\.com\/[^\s"<>]*/i,
  ]

  for (const pattern of meetingPatterns) {
    const match = text.match(pattern)
    if (match) return match[0]
  }

  // Fall back to first https:// URL found
  const genericMatch = text.match(/https:\/\/[^\s"<>]+/i)
  return genericMatch ? genericMatch[0] : null
}

/**
 * Check whether a string value looks like a URL (used for the LOCATION field).
 */
function isHttpsUrl(value: string): boolean {
  return value.trimStart().startsWith('https://')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an ICS file's text content and return an array of calendar events.
 *
 * Events missing a SUMMARY or DTSTART are silently skipped.
 * Malformed datetime values cause the event to be skipped rather than thrown.
 */
export function parseIcsFile(content: string): ParsedIcsEvent[] {
  const lines = unfoldLines(content)
  const events: ParsedIcsEvent[] = []

  let inEvent = false
  // Raw field accumulator for the current VEVENT
  let fields: Record<string, string> = {}

  for (const line of lines) {
    const upper = line.toUpperCase()

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      fields = {}
      continue
    }

    if (upper === 'END:VEVENT') {
      inEvent = false

      // Extract field values
      const summary = fields['SUMMARY'] ? decodeText(fields['SUMMARY']) : null
      const dtStartRaw = fields['DTSTART'] ?? null
      const dtEndRaw = fields['DTEND'] ?? null
      const uid = fields['UID'] ? decodeText(fields['UID']) : `generated-${Math.random()}`
      const locationRaw = fields['LOCATION'] ? decodeText(fields['LOCATION']) : null
      const descriptionRaw = fields['DESCRIPTION'] ? decodeText(fields['DESCRIPTION']) : null
      const urlRaw = fields['URL'] ? fields['URL'].trim() : null

      // Required fields — skip event if missing
      if (!summary || !dtStartRaw) continue

      const start = parseIcsDateTime(dtStartRaw)
      if (!start) continue

      // END is optional; default to start + 60 min if absent
      const end = dtEndRaw ? (parseIcsDateTime(dtEndRaw) ?? new Date(start.getTime() + 60 * 60_000)) : new Date(start.getTime() + 60 * 60_000)

      const rawDuration = (end.getTime() - start.getTime()) / 60_000
      const durationMinutes = Math.max(15, Math.min(480, Math.round(rawDuration)))

      // Meeting URL resolution (priority: URL field → LOCATION URL → DESCRIPTION URL)
      let meetingUrl: string | null = null
      if (urlRaw && isHttpsUrl(urlRaw)) {
        meetingUrl = urlRaw
      } else if (locationRaw && isHttpsUrl(locationRaw)) {
        meetingUrl = extractUrlFromText(locationRaw)
      }
      if (!meetingUrl && descriptionRaw) {
        meetingUrl = extractUrlFromText(descriptionRaw)
      }

      // LOCATION: use the raw value only if it is not a bare URL (that goes into meetingUrl)
      const location = locationRaw && !isHttpsUrl(locationRaw) ? locationRaw : null

      events.push({
        uid,
        summary,
        start,
        end,
        durationMinutes,
        location,
        meetingUrl,
        description: descriptionRaw,
      })

      continue
    }

    if (!inEvent) continue

    // Parse property name (strip parameters after semicolon) and value
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const propFull = line.slice(0, colonIdx).toUpperCase()
    // Strip TZID= and other parameters — take only the base property name
    const propName = propFull.split(';')[0]
    const value = extractValue(line)

    // Store the first occurrence of each property (later duplicates like
    // DTSTART with multiple TZID params are rare in practice and skipped)
    if (propName && !(propName in fields)) {
      fields[propName] = value
    }
  }

  return events
}
