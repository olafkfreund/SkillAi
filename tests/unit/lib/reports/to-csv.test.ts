import { describe, it, expect } from 'vitest'
import { escapeCsvField, toCsv } from '@/lib/reports/to-csv'

describe('escapeCsvField', () => {
  it('returns plain string unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello')
  })

  it('wraps a string containing a comma in double-quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
  })

  it('wraps and doubles internal double-quotes', () => {
    expect(escapeCsvField('she said "hi"')).toBe('"she said ""hi"""')
  })

  it('wraps a string containing a newline in double-quotes', () => {
    const result = escapeCsvField('multi\nline')
    expect(result.startsWith('"')).toBe(true)
    expect(result.endsWith('"')).toBe(true)
    expect(result).toContain('multi\nline')
  })

  it('returns empty string for null', () => {
    expect(escapeCsvField(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('coerces numbers to string', () => {
    expect(escapeCsvField(42)).toBe('42')
  })

  it('coerces a Date to ISO string', () => {
    expect(escapeCsvField(new Date('2026-04-28T12:00:00Z'))).toBe(
      '2026-04-28T12:00:00.000Z',
    )
  })
})

describe('toCsv', () => {
  it('produces only the header row + CRLF for empty data', () => {
    const result = toCsv([], [{ key: 'a', label: 'A' }])
    expect(result).toBe('A\r\n')
  })

  it('produces header + data row correctly', () => {
    const result = toCsv(
      [{ a: 'x', b: 'y' }],
      [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    )
    expect(result).toBe('A,B\r\nx,y\r\n')
  })

  it('round-trips a field with a comma and preserves the value', () => {
    const rows = [{ name: "O'Reilly, Inc." }]
    const csv = toCsv(rows, [{ key: 'name', label: 'Name' }])
    // Split on CRLF and take the data row; naive unquote
    const dataRow = csv.split('\r\n')[1]
    // The value is wrapped in quotes; stripping them recovers the original
    const unquoted = dataRow.replace(/^"|"$/g, '').replace(/""/g, '"')
    expect(unquoted).toBe("O'Reilly, Inc.")
  })

  it('escapes header labels that contain special chars', () => {
    const result = toCsv([], [{ key: 'x', label: 'Col,"A"' }])
    expect(result).toBe('"Col,""A"""\r\n')
  })
})
