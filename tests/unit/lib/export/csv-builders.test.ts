/**
 * Unit tests for src/lib/export/csv-builders.ts
 *
 * Strategy: mock @/db withTenant to return controlled fixture rows without
 * touching a real database.  The real toCsv / escapeCsvField helpers from
 * @/lib/reports/to-csv are used un-mocked so RFC 4180 behaviour is verified.
 *
 * Coverage:
 *   1. buildCandidatesCsv — header row contains expected columns
 *   2. buildCandidatesCsv — excludes cvText, cvTextFormatted, embedding, synechronCvData
 *   3. buildRolesCsv       — excludes description and requirements
 *   4. buildScoresCsv      — excludes the four reasoning fields + aiSummary
 *   5. buildAgenciesCsv    — contains the expected agency columns
 *   6. Each builder returns { csv, rowCount } shape
 *   7. Empty tenant → CSV is header-only; rowCount = 0
 *   8. Special characters in data → RFC 4180 quoting applied correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CANDIDATE_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const ROLE_ID = 'cccccccc-0000-0000-0000-000000000003'
const AGENCY_ID = 'dddddddd-0000-0000-0000-000000000004'

// ── DB mock ───────────────────────────────────────────────────────────────────

const mockSelect = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect }),
  ),
}))

// ── Chainable Drizzle query mock ──────────────────────────────────────────────

/** Returns a chainable object that resolves to `returnValue` when awaited. */
function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = [
    'from', 'where', 'limit', 'offset', 'leftJoin', 'innerJoin',
    'orderBy', 'returning', 'values', 'set', 'onConflictDoNothing',
    'onConflictDoUpdate', 'groupBy',
  ]
  methods.forEach((method) => {
    m[method] = vi.fn().mockReturnValue(m)
  })
  ;(m as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    _reject?: (e: unknown) => unknown,
  ) => Promise.resolve(returnValue).then(resolve)
  return m
}

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeCandidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                   CANDIDATE_ID,
    tenantId:             TENANT_ID,
    agencyId:             AGENCY_ID,
    firstName:            'Jane',
    lastName:             'Doe',
    email:                'jane@example.com',
    phone:                '+44 1234 567890',
    filePath:             '/uploads/cvs/jane.pdf',
    fileType:             'pdf',
    linkedinUrl:          null,
    githubUsername:       null,
    status:               'new',
    statusConfirmedBy:    null,
    statusConfirmedAt:    null,
    country:              'GB',
    city:                 'London',
    languagesSpoken:      ['English', 'French'],
    willingToRelocate:    false,
    candidateRate:        '500.00',
    customerRate:         '650.00',
    rateCurrency:         'GBP',
    availabilityStatus:   'available',
    availableFrom:        null,
    isActive:             true,
    synechronCandidateId: null,
    createdAt:            new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  }
}

function makeRoleRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                        ROLE_ID,
    tenantId:                  TENANT_ID,
    title:                     'Senior Backend Engineer',
    filePath:                  null,
    createdBy:                 'user-uuid',
    customerId:                null,
    isActive:                  true,
    frameworkLevelId:          null,
    frameworkLevelLabel:       null,
    country:                   'GB',
    city:                      'London',
    workMode:                  'hybrid',
    languageRequirements:      ['English'],
    keySkills:                 ['TypeScript', 'PostgreSQL'],
    topRequirements:           ['5+ years experience'],
    priorityKeywords:          ['microservices'],
    priorityKeywordsUpdatedAt: null,
    targetFillDate:            null,
    cutoffDate:                null,
    customerPortalPath:        null,
    customerDayRate:           '800.00',
    rateCurrency:              'GBP',
    shortlistSentAt:           null,
    createdAt:                 new Date('2026-01-01T09:00:00.000Z'),
    ...overrides,
  }
}

function makeScoreRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                 'score-uuid',
    tenantId:           TENANT_ID,
    candidateId:        CANDIDATE_ID,
    roleId:             ROLE_ID,
    scoreStatus:        'complete',
    overallScore:       85,
    technicalScore:     90,
    experienceScore:    80,
    culturalFitScore:   85,
    communicationScore: 85,
    errorMessage:       null,
    createdAt:          new Date('2026-01-16T11:00:00.000Z'),
    updatedAt:          new Date('2026-01-16T11:05:00.000Z'),
    ...overrides,
  }
}

function makeAgencyRow(overrides: Record<string, unknown> = {}) {
  return {
    id:           AGENCY_ID,
    tenantId:     TENANT_ID,
    name:         'Acme Recruitment Ltd',
    contactEmail: 'contact@acme.com',
    contactPhone: '+44 20 1234 5678',
    notes:        'Preferred technology agency',
    logoPath:     null,
    isActive:     true,
    isInternal:   false,
    isSystem:     false,
    createdAt:    new Date('2025-12-01T08:00:00.000Z'),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('csv-builders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Candidates — header row contains expected columns
  it('buildCandidatesCsv — header row contains expected columns', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([makeCandidateRow()]))

    const { buildCandidatesCsv } = await import('@/lib/export/csv-builders')
    const { csv } = await buildCandidatesCsv(TENANT_ID)

    const headerLine = csv.split('\r\n')[0]
    expect(headerLine).toContain('ID')
    expect(headerLine).toContain('First Name')
    expect(headerLine).toContain('Last Name')
    expect(headerLine).toContain('Email')
    expect(headerLine).toContain('Status')
    expect(headerLine).toContain('Created At')
    expect(headerLine).toContain('File Path')
  })

  // 2. Candidates — excludes heavy columns
  it('buildCandidatesCsv — header does NOT include cvText, cvTextFormatted, embedding, synechronCvData', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([makeCandidateRow()]))

    const { buildCandidatesCsv } = await import('@/lib/export/csv-builders')
    const { csv } = await buildCandidatesCsv(TENANT_ID)

    const headerLine = csv.split('\r\n')[0]
    // Case-insensitive checks to be robust against label capitalisation changes
    expect(headerLine.toLowerCase()).not.toContain('cv text')
    expect(headerLine.toLowerCase()).not.toContain('cv_text')
    expect(headerLine.toLowerCase()).not.toContain('cvtext')
    expect(headerLine.toLowerCase()).not.toContain('embedding')
    expect(headerLine.toLowerCase()).not.toContain('synechron cv data')
    expect(headerLine.toLowerCase()).not.toContain('synechron_cv_data')
  })

  // 3. Roles — excludes description and requirements
  it('buildRolesCsv — header does NOT include the description or requirements columns', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([makeRoleRow()]))

    const { buildRolesCsv } = await import('@/lib/export/csv-builders')
    const { csv } = await buildRolesCsv(TENANT_ID)

    // Split into individual header labels to avoid false positives from columns
    // like "Language Requirements" and "Top Requirements" which are legitimate.
    const headerLabels = csv.split('\r\n')[0].split(',').map((h) => h.toLowerCase().trim())

    // The standalone 'description' and 'requirements' column labels should be absent.
    expect(headerLabels).not.toContain('description')
    expect(headerLabels).not.toContain('requirements')

    // Title should still be present
    expect(headerLabels).toContain('title')
  })

  // 4. Scores — excludes reasoning and aiSummary columns
  it('buildScoresCsv — header does NOT include reasoning fields or aiSummary', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([makeScoreRow()]))

    const { buildScoresCsv } = await import('@/lib/export/csv-builders')
    const { csv } = await buildScoresCsv(TENANT_ID)

    const headerLine = csv.split('\r\n')[0]
    expect(headerLine.toLowerCase()).not.toContain('technical reasoning')
    expect(headerLine.toLowerCase()).not.toContain('experience reasoning')
    expect(headerLine.toLowerCase()).not.toContain('cultural fit reasoning')
    expect(headerLine.toLowerCase()).not.toContain('communication reasoning')
    expect(headerLine.toLowerCase()).not.toContain('ai summary')
    // Numeric scores should still be present
    expect(headerLine).toContain('Overall Score')
    expect(headerLine).toContain('Technical Score')
  })

  // 5. Agencies — all expected columns present
  it('buildAgenciesCsv — contains expected columns', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([makeAgencyRow()]))

    const { buildAgenciesCsv } = await import('@/lib/export/csv-builders')
    const { csv } = await buildAgenciesCsv(TENANT_ID)

    const headerLine = csv.split('\r\n')[0]
    expect(headerLine).toContain('ID')
    expect(headerLine).toContain('Name')
    expect(headerLine).toContain('Contact Email')
    expect(headerLine).toContain('Contact Phone')
    expect(headerLine).toContain('Notes')
    expect(headerLine).toContain('Is Active')
    expect(headerLine).toContain('Is Internal')
    expect(headerLine).toContain('Is System')
  })

  // 6. Each builder returns { csv, rowCount } shape
  it('each builder returns { csv: string, rowCount: number } shape', async () => {
    mockSelect
      .mockReturnValueOnce(chainableMock([makeCandidateRow()]))
      .mockReturnValueOnce(chainableMock([makeRoleRow()]))
      .mockReturnValueOnce(chainableMock([makeScoreRow()]))
      .mockReturnValueOnce(chainableMock([makeAgencyRow()]))

    const {
      buildCandidatesCsv,
      buildRolesCsv,
      buildScoresCsv,
      buildAgenciesCsv,
    } = await import('@/lib/export/csv-builders')

    const results = await Promise.all([
      buildCandidatesCsv(TENANT_ID),
      buildRolesCsv(TENANT_ID),
      buildScoresCsv(TENANT_ID),
      buildAgenciesCsv(TENANT_ID),
    ])

    for (const result of results) {
      expect(typeof result.csv).toBe('string')
      expect(typeof result.rowCount).toBe('number')
      expect(result.rowCount).toBe(1)
    }
  })

  // 7. Empty tenant — header only; rowCount = 0
  it('empty tenant → CSV has only header row (+ trailing CRLF); rowCount = 0', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))

    const { buildCandidatesCsv } = await import('@/lib/export/csv-builders')
    const { csv, rowCount } = await buildCandidatesCsv(TENANT_ID)

    // RFC 4180: header CRLF trailing CRLF = two CRLFs total; split gives 3 segments
    // with the last being empty
    const lines = csv.split('\r\n')
    // First element is the header; last is empty string after trailing CRLF
    expect(lines[0]).not.toBe('')         // header is non-empty
    expect(lines[lines.length - 1]).toBe('') // trailing CRLF produces empty tail
    expect(lines.length).toBe(2)          // header + empty tail = 2
    expect(rowCount).toBe(0)
  })

  // 8. Special characters → RFC 4180 quoting
  it('special characters in data are properly quote-wrapped per RFC 4180', async () => {
    const specialRow = makeCandidateRow({
      firstName: 'O,Reilly "boss"',
      lastName:  'Line\r\nBreak',
    })
    mockSelect.mockReturnValueOnce(chainableMock([specialRow]))

    const { buildCandidatesCsv } = await import('@/lib/export/csv-builders')
    const { csv } = await buildCandidatesCsv(TENANT_ID)

    // The value with a comma and double-quote must be double-quoted with
    // internal quotes doubled: "O,Reilly ""boss"""
    expect(csv).toContain('"O,Reilly ""boss"""')

    // The value with a CRLF must be wrapped in double-quotes
    expect(csv).toContain('"Line\r\nBreak"')
  })
})
