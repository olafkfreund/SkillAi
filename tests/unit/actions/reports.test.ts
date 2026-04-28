/**
 * Unit tests for src/actions/reports.ts — getReportsFeed()
 *
 * Strategy: mock @/db (withTenant) and @/lib/auth/action-context to control
 * auth state. The withTenant mock receives a fake tx with a chainable select
 * mock, enabling us to drive each sub-query's return value independently.
 *
 * No real DB is touched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const ROLE_ID = 'cccccccc-0000-0000-0000-000000000003'
const AGENCY_ID = 'ffffffff-0000-0000-0000-000000000006'

// ── next/headers mock (required because action-context imports it) ─────────────
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}))

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockSelect = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect })
  ),
}))

// ── action-context mock ───────────────────────────────────────────────────────
const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Chainable Drizzle query mock that resolves to `returnValue` when awaited. */
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
  ;(m as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(returnValue).then(resolve)
  return m
}

/** Admin context fixture */
function adminCtx() {
  return { tenantId: TENANT_ID, userId: 'user-1', userRole: 'admin' as const }
}

/**
 * Queue up all mocked select calls in exact order — NO fallback mockReturnValue.
 *
 * The function queues exactly the provided returns. Each test must know how many
 * calls will be made and provide that many return values.
 *
 * Parallel batch (13 calls in Promise.all — indices 0-12):
 *  0.  activeRoles
 *  1.  candidatesAdded
 *  2.  candidatesScored
 *  3.  candidatesHired
 *  4.  aiSpend
 *  5.  aiCostTrend
 *  6.  aiCostLast30
 *  7.  aiCostPrior30
 *  8.  rolesOpenOver30
 *  9.  expiredRoles
 *  10. stuckInterviewing
 *  11. agencyCandidates
 *  12. hiredAudit
 *
 * Sequential follow-ups (only executed when the matching ids array is non-empty):
 *  13. preferredRoles    (if any hiredAudit row has metadata.roleId)
 *  14. fallbackScores    (if any hiredAudit row lacks metadata.roleId)
 *  15. fallbackRoles     (if fallbackScores returns non-empty)
 *  16. customers         (if any resolved role has a non-null customerId)
 */
function queueSelectReturns(returns: unknown[][]) {
  // Use only mockReturnValueOnce — never mockReturnValue — to prevent bleed between tests.
  let chain: typeof mockSelect = mockSelect
  for (const rv of returns) {
    chain = chain.mockReturnValueOnce(chainableMock(rv)) as typeof mockSelect
  }
}

/** Minimal all-zeros setup — no follow-up queries needed since hiredAudit is empty. */
function setupEmptyMocks(opts: { stuckInterviewing?: number } = {}) {
  queueSelectReturns([
    [{ count: 0 }],               // 0  activeRoles
    [{ count: 0 }],               // 1  candidatesAdded
    [{ count: 0 }],               // 2  candidatesScored
    [{ count: 0 }],               // 3  candidatesHired
    [{ total: '0.000000' }],      // 4  aiSpend
    [],                           // 5  aiCostTrend
    [{ total: '0.000000' }],      // 6  aiCostLast30
    [{ total: '0.000000' }],      // 7  aiCostPrior30
    [{ count: 0 }],               // 8  rolesOpenOver30
    [{ count: 0 }],               // 9  expiredRoles
    [{ count: opts.stuckInterviewing ?? 0 }], // 10 stuckInterviewing
    [],                           // 11 agencyCandidates (empty → no agency map entries)
    [],                           // 12 hiredAudit (empty → no follow-up queries)
  ])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getReportsFeed()', () => {
  beforeEach(() => {
    // clearAllMocks clears call counts and mockReturnValueOnce queues.
    // It does NOT reset mockImplementation, so withTenant stays wired up.
    // It does NOT clear mockReturnValue (the non-Once fallback) — but we never
    // call mockReturnValue in these tests to avoid bleed between tests.
    vi.clearAllMocks()

    // Re-apply withTenant implementation in case clearAllMocks wiped it.
    // (vitest clearAllMocks behaviour: clears calls/results but keeps impl.)
    // Being explicit here prevents any edge case.
    const { withTenant } = vi.mocked(
      // We can't call importActual in beforeEach synchronously, so
      // we re-apply the mock factory directly on the already-mocked module.
      // The vi.mock at the top keeps the module mocked; clearAllMocks only
      // wipes call history, not the mockImplementation set in the factory.
      // This line is intentionally a no-op safety guard:
      { withTenant: () => {} }
    )
    void withTenant
  })

  // ── Test 1: Admin gating — non-admin role throws ───────────────────────────
  it('throws for non-admin role (recruiter)', async () => {
    mockGetActionContext.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      userId: 'user-1',
      userRole: 'recruiter' as const,
    })

    const { getReportsFeed } = await import('@/actions/reports')
    await expect(getReportsFeed({ days: 7 })).rejects.toThrow()
  })

  // ── Test 2: Unauthorized context throws ───────────────────────────────────
  it('throws when no auth context', async () => {
    mockGetActionContext.mockResolvedValueOnce(null)

    const { getReportsFeed } = await import('@/actions/reports')
    await expect(getReportsFeed({ days: 7 })).rejects.toThrow('Unauthorized')
  })

  // ── Test 3: Days param — returned rangeDays matches input ──────────────────
  it('returns rangeDays=7 when called with days=7', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())
    setupEmptyMocks()

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 7 })

    expect(feed.rangeDays).toBe(7)
  })

  it('returns rangeDays=90 when called with days=90', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())
    setupEmptyMocks()

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 90 })

    expect(feed.rangeDays).toBe(90)
  })

  // ── Test 4: Empty data — fully-shaped ReportsFeed, no crashes ─────────────
  it('returns fully-shaped feed with zero counts and null averages when DB returns empty', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())
    setupEmptyMocks()

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    // KPIs
    expect(feed.kpis.activeRoles).toBe(0)
    expect(feed.kpis.candidatesAddedInRange).toBe(0)
    expect(feed.kpis.candidatesScoredInRange).toBe(0)
    expect(feed.kpis.candidatesHiredInRange).toBe(0)
    expect(feed.kpis.aiSpendInRangeUsd).toBe(0)

    // Time-to-fill
    expect(feed.timeToFill.series).toEqual([])
    expect(feed.timeToFill.totalRolesFilled).toBe(0)
    expect(feed.timeToFill.averageDaysOverall).toBeNull()
    expect(feed.timeToFill.hasLimitedHistoricalData).toBe(true)

    // Agency hit-rate
    expect(feed.agencyHitRate.series).toEqual([])

    // AI cost trend
    expect(feed.aiCostTrend.series).toEqual([])
    expect(feed.aiCostTrend.totalUsd).toBe(0)
    expect(feed.aiCostTrend.monthOverMonthPct).toBeNull()

    // Cycle health
    expect(feed.cycleHealth.rolesOpenOver30Days).toBe(0)
    expect(feed.cycleHealth.expiredRoles).toBe(0)
    expect(feed.cycleHealth.candidatesStuckInterviewing).toBe(0)

    // Top performers
    expect(feed.topPerformers.fastestFilledRoles).toEqual([])
    expect(feed.topPerformers.topAgenciesByHitRate).toEqual([])

    // generatedAt is a Date
    expect(feed.generatedAt).toBeInstanceOf(Date)
  })

  // ── Test 5a: hasLimitedHistoricalData=true when matched events < 5 ─────────
  it('sets hasLimitedHistoricalData=true when matched hire events < 5', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())

    // 3 hired audit events, none with roleId in metadata.
    // needsFallbackIds = [c1, c2, c3] → fallbackScores fires (returns [])
    // fallbackRoleIds = [] → no fallbackRoles query
    // allCustomerIds = [] → no customers query
    const hiredAudit = [
      { entityId: 'c1', metadata: { newStatus: 'hired' }, createdAt: new Date() },
      { entityId: 'c2', metadata: { newStatus: 'hired' }, createdAt: new Date() },
      { entityId: 'c3', metadata: { newStatus: 'hired' }, createdAt: new Date() },
    ]

    queueSelectReturns([
      [{ count: 5 }],               // 0  activeRoles
      [{ count: 10 }],              // 1  candidatesAdded
      [{ count: 8 }],               // 2  candidatesScored
      [{ count: 2 }],               // 3  candidatesHired
      [{ total: '150.000000' }],    // 4  aiSpend
      [],                           // 5  aiCostTrend
      [{ total: '80.000000' }],     // 6  aiCostLast30
      [{ total: '70.000000' }],     // 7  aiCostPrior30
      [{ count: 3 }],               // 8  rolesOpenOver30
      [{ count: 1 }],               // 9  expiredRoles
      [{ count: 0 }],               // 10 stuckInterviewing
      [],                           // 11 agencyCandidates
      hiredAudit,                   // 12 hiredAudit (3 rows, no roleId in metadata)
      // preferredRoleIds = [] → NO preferredRoles query
      [],                           // 13 fallbackScores (needsFallbackIds = [c1,c2,c3])
      // fallbackRoleIds = [] → NO fallbackRoles query
      // allCustomerIds = [] → NO customers query
    ])

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    expect(feed.timeToFill.hasLimitedHistoricalData).toBe(true)
  })

  // ── Test 5b: hasLimitedHistoricalData=false when matched events >= 5 ───────
  it('sets hasLimitedHistoricalData=false when matched hire events >= 5', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())

    const now = Date.now()
    const roleCreatedAt = new Date(now - 20 * 86_400_000) // 20 days ago

    // 6 hired audit events with roleId directly in metadata (preferred path).
    // preferredRoleIds = [ROLE_ID] → preferredRoles query fires
    // needsFallbackIds = [] → NO fallbackScores query
    // fallbackRoleIds = [] → NO fallbackRoles query
    // allCustomerIds = [] (customerId: null) → NO customers query
    const hiredAudit = Array.from({ length: 6 }, (_, i) => ({
      entityId: `cand-${i}`,
      metadata: { newStatus: 'hired', roleId: ROLE_ID },
      createdAt: new Date(now - i * 86_400_000),
    }))

    const preferredRoles = [
      {
        id: ROLE_ID,
        title: 'Backend Engineer',
        createdAt: roleCreatedAt,
        customerId: null,
      },
    ]

    queueSelectReturns([
      [{ count: 5 }],               // 0  activeRoles
      [{ count: 10 }],              // 1  candidatesAdded
      [{ count: 8 }],               // 2  candidatesScored
      [{ count: 2 }],               // 3  candidatesHired
      [{ total: '150.000000' }],    // 4  aiSpend
      [],                           // 5  aiCostTrend
      [{ total: '80.000000' }],     // 6  aiCostLast30
      [{ total: '70.000000' }],     // 7  aiCostPrior30
      [{ count: 3 }],               // 8  rolesOpenOver30
      [{ count: 1 }],               // 9  expiredRoles
      [{ count: 0 }],               // 10 stuckInterviewing
      [],                           // 11 agencyCandidates
      hiredAudit,                   // 12 hiredAudit
      preferredRoles,               // 13 preferredRoles (preferredRoleIds = [ROLE_ID])
      // needsFallbackIds = [] → NO fallbackScores
      // fallbackRoleIds = [] → NO fallbackRoles
      // allCustomerIds = [] (customerId: null) → NO customers
    ])

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 90 })

    expect(feed.timeToFill.hasLimitedHistoricalData).toBe(false)
    expect(feed.timeToFill.totalRolesFilled).toBeGreaterThanOrEqual(5)
  })

  // ── Test 6a: Agency hit-rate: skips agencies with zero submissions ─────────
  it('agency hit-rate series is empty when no agency candidates in range', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())
    setupEmptyMocks()

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    expect(feed.agencyHitRate.series).toHaveLength(0)
  })

  // ── Test 6b: Agency hit-rate computes pcts correctly ──────────────────────
  it('agency hit-rate computes submission and hire percentages correctly', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())

    // Agency: 10 submitted, 2 hired, 3 more in shortlisted/interviewing/offered (= 5 shortlisted total)
    // submissionToHirePct = 2/10 * 100 = 20
    // shortlistToHirePct  = 2/5 * 100  = 40
    const agencyCandidates = [
      ...Array.from({ length: 2 }, () => ({ agencyId: AGENCY_ID, agencyName: 'Alpha', status: 'hired' })),
      ...Array.from({ length: 3 }, () => ({ agencyId: AGENCY_ID, agencyName: 'Alpha', status: 'shortlisted' })),
      ...Array.from({ length: 5 }, () => ({ agencyId: AGENCY_ID, agencyName: 'Alpha', status: 'new' })),
    ]

    queueSelectReturns([
      [{ count: 5 }],               // 0  activeRoles
      [{ count: 10 }],              // 1  candidatesAdded
      [{ count: 8 }],               // 2  candidatesScored
      [{ count: 2 }],               // 3  candidatesHired
      [{ total: '150.000000' }],    // 4  aiSpend
      [],                           // 5  aiCostTrend
      [{ total: '80.000000' }],     // 6  aiCostLast30
      [{ total: '70.000000' }],     // 7  aiCostPrior30
      [{ count: 3 }],               // 8  rolesOpenOver30
      [{ count: 1 }],               // 9  expiredRoles
      [{ count: 0 }],               // 10 stuckInterviewing
      agencyCandidates,             // 11 agencyCandidates
      [],                           // 12 hiredAudit (empty → no follow-ups)
    ])

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    expect(feed.agencyHitRate.series).toHaveLength(1)
    const a = feed.agencyHitRate.series[0]
    expect(a.agencyId).toBe(AGENCY_ID)
    expect(a.candidatesSubmitted).toBe(10)
    expect(a.candidatesHired).toBe(2)
    expect(a.submissionToHirePct).toBe(20)
    expect(a.shortlistToHirePct).toBeCloseTo(40)
  })

  // ── Test 7a: Top agencies: filters out agencies with submitted < 3 ─────────
  it('topAgenciesByHitRate excludes agencies with fewer than 3 submitted candidates', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())

    // Only 2 candidates from this agency → below threshold of 3
    const agencyCandidates = [
      { agencyId: AGENCY_ID, agencyName: 'Small Agency', status: 'hired' },
      { agencyId: AGENCY_ID, agencyName: 'Small Agency', status: 'new' },
    ]

    queueSelectReturns([
      [{ count: 5 }],               // 0  activeRoles
      [{ count: 10 }],              // 1  candidatesAdded
      [{ count: 8 }],               // 2  candidatesScored
      [{ count: 2 }],               // 3  candidatesHired
      [{ total: '150.000000' }],    // 4  aiSpend
      [],                           // 5  aiCostTrend
      [{ total: '80.000000' }],     // 6  aiCostLast30
      [{ total: '70.000000' }],     // 7  aiCostPrior30
      [{ count: 3 }],               // 8  rolesOpenOver30
      [{ count: 1 }],               // 9  expiredRoles
      [{ count: 0 }],               // 10 stuckInterviewing
      agencyCandidates,             // 11 agencyCandidates
      [],                           // 12 hiredAudit (empty → no follow-ups)
    ])

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    // Agency IS in agencyHitRate.series (submitted = 2 > 0)
    expect(feed.agencyHitRate.series).toHaveLength(1)
    // But NOT in topAgenciesByHitRate (submitted = 2 < 3)
    expect(feed.topPerformers.topAgenciesByHitRate).toHaveLength(0)
  })

  // ── Test 7b: Top agencies: includes agency with submitted >= 3 ─────────────
  it('topAgenciesByHitRate includes agency with >= 3 submitted candidates', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())

    // 5 submitted, 3 hired → qualifies for top-agencies list
    const agencyCandidates = [
      { agencyId: AGENCY_ID, agencyName: 'Big Agency', status: 'hired' },
      { agencyId: AGENCY_ID, agencyName: 'Big Agency', status: 'hired' },
      { agencyId: AGENCY_ID, agencyName: 'Big Agency', status: 'hired' },
      { agencyId: AGENCY_ID, agencyName: 'Big Agency', status: 'new' },
      { agencyId: AGENCY_ID, agencyName: 'Big Agency', status: 'new' },
    ]

    queueSelectReturns([
      [{ count: 5 }],               // 0  activeRoles
      [{ count: 10 }],              // 1  candidatesAdded
      [{ count: 8 }],               // 2  candidatesScored
      [{ count: 2 }],               // 3  candidatesHired
      [{ total: '150.000000' }],    // 4  aiSpend
      [],                           // 5  aiCostTrend
      [{ total: '80.000000' }],     // 6  aiCostLast30
      [{ total: '70.000000' }],     // 7  aiCostPrior30
      [{ count: 3 }],               // 8  rolesOpenOver30
      [{ count: 1 }],               // 9  expiredRoles
      [{ count: 0 }],               // 10 stuckInterviewing
      agencyCandidates,             // 11 agencyCandidates
      [],                           // 12 hiredAudit (empty → no follow-ups)
    ])

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    expect(feed.topPerformers.topAgenciesByHitRate).toHaveLength(1)
    expect(feed.topPerformers.topAgenciesByHitRate[0].agencyId).toBe(AGENCY_ID)
    expect(feed.topPerformers.topAgenciesByHitRate[0].candidatesHired).toBe(3)
  })

  // ── Test 8: Cycle health stuck candidates ─────────────────────────────────
  it('cycleHealth.candidatesStuckInterviewing reflects the DB query count', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())
    // DB query (stuckInterviewing) returns count=7 — the action passes this directly
    setupEmptyMocks({ stuckInterviewing: 7 })

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    expect(feed.cycleHealth.candidatesStuckInterviewing).toBe(7)
  })

  it('cycleHealth.candidatesStuckInterviewing is 0 when no stuck candidates', async () => {
    mockGetActionContext.mockResolvedValueOnce(adminCtx())
    setupEmptyMocks()

    const { getReportsFeed } = await import('@/actions/reports')
    const feed = await getReportsFeed({ days: 30 })

    expect(feed.cycleHealth.candidatesStuckInterviewing).toBe(0)
  })
})
