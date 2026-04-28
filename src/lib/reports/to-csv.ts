/**
 * RFC 4180 CSV serialisation helpers.
 *
 * Pure utility — no I/O, no side effects.
 */

const NEEDS_QUOTING = /[,"\r\n]/

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  const str = String(value)
  if (!NEEDS_QUOTING.test(str)) return str

  // Wrap in double-quotes and double any internal double-quotes
  return `"${str.replace(/"/g, '""')}"`
}

export function toCsv(
  rows: Record<string, unknown>[],
  headers: { key: string; label: string }[],
): string {
  const lines: string[] = []

  // Header row
  lines.push(headers.map((h) => escapeCsvField(h.label)).join(','))

  // Data rows
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h.key])).join(','))
  }

  // RFC 4180: CRLF line endings, trailing CRLF after final row
  return lines.join('\r\n') + '\r\n'
}
