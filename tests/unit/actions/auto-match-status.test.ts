/**
 * Unit tests for src/actions/auto-match-status.ts
 *
 * Covers getAutoMatchStatus — the read action that backs the
 * ArchiveMatchesPanel polling endpoint (epic #267 / issue #271). Reads the
 * latest auto-match audit row, joins candidate + score + agency rows,
 * derives rateMatch from current rates rather than persisted state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROLE_ID   = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then     = resolved.then.bind(resolved)
  c.catch    = resolved.catch.bind(resolved)
  c.from     = vi.fn(() => c)
  c.leftJoin = vi.fn(() => c)
  c.where    = vi.fn(() => c)
  c.orderBy  = vi.fn(() => c)
  c.limit    = vi.fn(() => Promise.resolve(rows))
  return c
}

// Each withTenant() call consumes one entry from this queue
let selectQueue: unknown[][] = []
let selectCount = 0

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const rows = selectQueue[selectCount] ?? []
      selectCount++
      const tx = {
        select: vi.fn(() => makeSelectChain(rows)),
      }
      return fn(tx)
    },
  ),
}))

vi.mock('@/db/schema', () => ({
  auditLogs: {
    action: 'action', tenantId: 'tenant_id', entityType: 'entity_type',
    entityId: 'entity_id', metadata: 'metadata', createdAt: 'created_at',
  },
  candidates: {
    id: 'id', tenantId: 'tenant_id', firstName: 'first_name', lastName: 'last_name',
    candidateRate: 'candidate_rate', rateCurrency: 'rate_currency',
    availabilityStatus: 'availability_status', availableFrom: 'available_from',
    agencyId: 'agency_id',
  },
  agencies: { id: 'id', name: 'name', logoPath: 'logo_path' },
  scores: {
    candidateId: 'candidate_id', roleId: 'role_id',
    overallScore: 'overall_score', scoreStatus: 'score_status',
  },
  roles: {
    id: 'id', tenantId: 'tenant_id',
    customerDayRate: 'customer_day_rate', rateCurrency: 'rate_currency',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:       vi.fn(() => ({ type: 'eq' })),
  and:      vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray:  vi.fn(() => ({ type: 'inArray' })),
  desc:     vi.fn(() => ({ type: 'desc' })),
  sql:      vi.fn(() => ({ type: 'sql' })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function resetState() {
  selectQueue = []
  selectCount = 0
}

describe('getAutoMatchStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns idle when no auth context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.status).toBe('idle')
    expect(result.candidates).toEqual([])
  })

  it('returns idle when no audit row exists', async () => {
    selectQueue = [[]] // audit lookup empty
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.status).toBe('idle')
  })

  it('returns pending when most-recent audit row is auto_match_started', async () => {
    selectQueue = [[{ action: 'role.auto_match_started', metadata: null }]]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.status).toBe('pending')
    expect(result.candidates).toEqual([])
  })

  it('returns complete with empty candidates when scoredCandidateIds is empty', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_completed',
        metadata: { scoredCandidateIds: [], candidateIds: [], survivorCount: 0 },
      }],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.status).toBe('complete')
    expect(result.candidates).toEqual([])
  })

  it('returns failed with reason on cap-exceeded path including candidates', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_failed',
        metadata: {
          reason: 'daily_cost_cap_exceeded',
          candidateIds: ['c-1'],
        },
      }],
      // Role lookup
      [{ customerDayRate: '500', rateCurrency: 'GBP' }],
      // Candidate row
      [{
        id: 'c-1',
        firstName: 'Alice',
        lastName: 'Walker',
        candidateRate: '450',
        rateCurrency: 'GBP',
        availabilityStatus: 'available',
        availableFrom: null,
        agencyName: 'Acme',
        agencyLogoPath: '/uploads/acme.png',
      }],
      // Scores
      [],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.status).toBe('failed')
    expect(result.reason).toBe('daily_cost_cap_exceeded')
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      id: 'c-1',
      firstName: 'Alice',
      rateMatch: 'within',
      agencyName: 'Acme',
    })
  })

  it('returns failed with empty candidates on internal-error path', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_failed',
        metadata: { error: 'pgvector unavailable' },
      }],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.status).toBe('failed')
    expect(result.candidates).toEqual([])
  })

  it('derives rateMatch=within when candidate rate <= role budget', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_completed',
        metadata: { scoredCandidateIds: ['c-1'] },
      }],
      [{ customerDayRate: '500', rateCurrency: 'GBP' }],
      [{
        id: 'c-1', firstName: 'A', lastName: 'B',
        candidateRate: '450', rateCurrency: 'GBP',
        availabilityStatus: 'available', availableFrom: null,
        agencyName: null, agencyLogoPath: null,
      }],
      [{ candidateId: 'c-1', overallScore: 88, scoreStatus: 'complete' }],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.candidates[0].rateMatch).toBe('within')
    expect(result.candidates[0].overallScore).toBe(88)
    expect(result.candidates[0].scoreStatus).toBe('complete')
  })

  it('derives rateMatch=over with overage percent when candidate over budget', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_completed',
        metadata: { scoredCandidateIds: ['c-1'] },
      }],
      [{ customerDayRate: '500', rateCurrency: 'GBP' }],
      [{
        id: 'c-1', firstName: 'A', lastName: 'B',
        candidateRate: '550', rateCurrency: 'GBP',
        availabilityStatus: 'available', availableFrom: null,
        agencyName: null, agencyLogoPath: null,
      }],
      [{ candidateId: 'c-1', overallScore: 70, scoreStatus: 'complete' }],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.candidates[0].rateMatch).toBe('over')
    expect(result.candidates[0].rateOveragePercent).toBe(10)
  })

  it('derives rateMatch=currency_mismatch when currencies differ', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_completed',
        metadata: { scoredCandidateIds: ['c-1'] },
      }],
      [{ customerDayRate: '500', rateCurrency: 'GBP' }],
      [{
        id: 'c-1', firstName: 'A', lastName: 'B',
        candidateRate: '450', rateCurrency: 'EUR',
        availabilityStatus: 'available', availableFrom: null,
        agencyName: null, agencyLogoPath: null,
      }],
      [{ candidateId: 'c-1', overallScore: 80, scoreStatus: 'complete' }],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.candidates[0].rateMatch).toBe('currency_mismatch')
  })

  it('derives rateMatch=unknown when budget or candidate rate is missing', async () => {
    selectQueue = [
      [{
        action: 'role.auto_match_completed',
        metadata: { scoredCandidateIds: ['c-1'] },
      }],
      [{ customerDayRate: null, rateCurrency: null }],
      [{
        id: 'c-1', firstName: 'A', lastName: 'B',
        candidateRate: null, rateCurrency: null,
        availabilityStatus: 'available', availableFrom: null,
        agencyName: null, agencyLogoPath: null,
      }],
      [{ candidateId: 'c-1', overallScore: 90, scoreStatus: 'complete' }],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.candidates[0].rateMatch).toBe('unknown')
  })

  it('preserves the order of candidateIds from audit metadata (not DB row order)', async () => {
    // Audit IDs in order: c-3, c-1, c-2.  Candidate rows come back unordered.
    selectQueue = [
      [{
        action: 'role.auto_match_completed',
        metadata: { scoredCandidateIds: ['c-3', 'c-1', 'c-2'] },
      }],
      [{ customerDayRate: '500', rateCurrency: 'GBP' }],
      [
        { id: 'c-1', firstName: 'One', lastName: 'X', candidateRate: '450', rateCurrency: 'GBP',
          availabilityStatus: 'available', availableFrom: null, agencyName: null, agencyLogoPath: null },
        { id: 'c-2', firstName: 'Two', lastName: 'X', candidateRate: '460', rateCurrency: 'GBP',
          availabilityStatus: 'available', availableFrom: null, agencyName: null, agencyLogoPath: null },
        { id: 'c-3', firstName: 'Three', lastName: 'X', candidateRate: '470', rateCurrency: 'GBP',
          availabilityStatus: 'available', availableFrom: null, agencyName: null, agencyLogoPath: null },
      ],
      [
        { candidateId: 'c-1', overallScore: 70, scoreStatus: 'complete' },
        { candidateId: 'c-2', overallScore: 75, scoreStatus: 'complete' },
        { candidateId: 'c-3', overallScore: 80, scoreStatus: 'complete' },
      ],
    ]
    const { getAutoMatchStatus } = await import('@/actions/auto-match-status')

    const result = await getAutoMatchStatus(ROLE_ID)

    expect(result.candidates.map((c) => c.id)).toEqual(['c-3', 'c-1', 'c-2'])
  })
})
