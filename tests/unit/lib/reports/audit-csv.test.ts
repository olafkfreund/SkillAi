/**
 * Tests for the CSV row shape produced by the audit export route.
 *
 * We exercise the CSV serialisation layer in isolation by importing the
 * RFC 4180 helpers directly — no DB, no auth.
 */
import { describe, it, expect } from 'vitest'
import { toCsv, escapeCsvField } from '@/lib/reports/to-csv'

// ── Shared column spec (mirrors route.ts) ─────────────────────────────────────

const AUDIT_CSV_HEADERS = [
  { key: 'created_at',    label: 'created_at'    },
  { key: 'actor_email',   label: 'actor_email'   },
  { key: 'action',        label: 'action'        },
  { key: 'entity_type',   label: 'entity_type'   },
  { key: 'entity_id',     label: 'entity_id'     },
  { key: 'entity_label',  label: 'entity_label'  },
  { key: 'metadata_json', label: 'metadata_json' },
]

// ── Fixture ───────────────────────────────────────────────────────────────────

const AUDIT_ROW = {
  created_at:    new Date('2026-05-20T10:00:00.000Z'),
  actor_email:   'recruiter@acme.com',
  action:        'candidate.created',
  entity_type:   'candidate',
  entity_id:     'cand-uuid-1234',
  entity_label:  'Jane Smith',
  metadata_json: JSON.stringify({ source: 'manual', agencyId: 'ag-1' }),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('audit CSV row shape', () => {
  it('produces the expected header row', () => {
    const csv = toCsv([], AUDIT_CSV_HEADERS)
    const headerLine = csv.split('\r\n')[0]
    expect(headerLine).toBe(
      'created_at,actor_email,action,entity_type,entity_id,entity_label,metadata_json',
    )
  })

  it('serialises all seven columns in the correct order', () => {
    const csv = toCsv([AUDIT_ROW], AUDIT_CSV_HEADERS)
    const lines = csv.split('\r\n')
    // lines[0] = header, lines[1] = first data row, lines[2] = trailing CRLF
    expect(lines.length).toBe(3)
    expect(lines[2]).toBe('')

    const dataLine = lines[1]
    // created_at is a Date → ISO string
    expect(dataLine).toContain('2026-05-20T10:00:00.000Z')
    expect(dataLine).toContain('recruiter@acme.com')
    expect(dataLine).toContain('candidate.created')
    expect(dataLine).toContain('candidate')
    expect(dataLine).toContain('cand-uuid-1234')
    expect(dataLine).toContain('Jane Smith')
  })

  it('serialises metadata_json as a JSON string wrapped in quotes (contains braces)', () => {
    const csv = toCsv([AUDIT_ROW], AUDIT_CSV_HEADERS)
    const dataLine = csv.split('\r\n')[1]
    // JSON strings contain commas and double-quotes — RFC 4180 wraps in
    // outer double-quotes and escapes inner double-quotes by doubling them.
    // e.g. {"source":"manual"} → "{""source"":""manual"",...}"
    expect(dataLine).toContain('"{""source"":""manual""')
    expect(dataLine).toContain('""agencyId"":""ag-1""}"')
  })

  it('emits empty string for null entity_id', () => {
    const row = { ...AUDIT_ROW, entity_id: '' }
    const csv = toCsv([row], AUDIT_CSV_HEADERS)
    const fields = csv.split('\r\n')[1].split(',')
    // entity_id is the 5th column (index 4)
    expect(fields[4]).toBe('')
  })

  it('emits empty string for null entity_label', () => {
    const row = { ...AUDIT_ROW, entity_label: '' }
    const csv = toCsv([row], AUDIT_CSV_HEADERS)
    const fields = csv.split('\r\n')[1].split(',')
    // entity_label is the 6th column (index 5)
    expect(fields[5]).toBe('')
  })

  it('emits empty string for null metadata_json', () => {
    const row = { ...AUDIT_ROW, metadata_json: '' }
    const csv = toCsv([row], AUDIT_CSV_HEADERS)
    const fields = csv.split('\r\n')[1].split(',')
    // metadata_json is the 7th column (index 6)
    expect(fields[6]).toBe('')
  })

  it('handles entity_label containing a comma by wrapping in quotes', () => {
    const row = { ...AUDIT_ROW, entity_label: 'Smith, Jane' }
    const csv = toCsv([row], AUDIT_CSV_HEADERS)
    expect(csv).toContain('"Smith, Jane"')
  })

  it('produces only the header row when given an empty rows array', () => {
    const csv = toCsv([], AUDIT_CSV_HEADERS)
    expect(csv).toBe(
      'created_at,actor_email,action,entity_type,entity_id,entity_label,metadata_json\r\n',
    )
  })

  it('escapeCsvField coerces a Date to ISO string', () => {
    const d = new Date('2026-05-20T10:00:00.000Z')
    expect(escapeCsvField(d)).toBe('2026-05-20T10:00:00.000Z')
  })
})
