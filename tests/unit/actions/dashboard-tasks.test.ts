/**
 * Unit tests for src/actions/dashboard-tasks.ts — getForYouFeed()
 *
 * Strategy: mock @/db withTenant with a chainable Drizzle stub so we can
 * intercept each select call and return controlled data. No real DB touched.
 *
 * Coverage goals:
 *  - pendingApprovals is gated to hiring_manager only
 *  - all five sub-queries are called for hiring_manager
 *  - each stream returns correctly-shaped rows
 *  - each stream is limited to 5 items (hard cap via .limit())
 *  - empty arrays returned cleanly when no data rows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const ROLE_ID = 'cccccccc-0000-0000-0000-000000000003'
const CANDIDATE_ID = 'dddddddd-0000-0000-0000-000000000004'
const SLOT_ID = 'eeeeeeee-0000-0000-0000-000000000005'

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockSelect = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect })
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Chainable Drizzle query mock that resolves to `returnValue` when awaited. */
function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = [
    'from', 'where', 'limit', 'offset', 'leftJoin', 'innerJoin',
    'orderBy', 'returning', 'values', 'set', 'onConflictDoNothing',
    'onConflictDoUpdate', 'groupBy', 'then',
  ]
  methods.forEach((method) => {
    if (method === 'then') return
    m[method] = vi.fn().mockReturnValue(m)
  })
  // Make the mock thenable so Promise.all can await it
  ;(m as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    _reject?: (e: unknown) => unknown
  ) => Promise.resolve(returnValue).then(resolve)
  return m
}

function makeSlotRow() {
  return {
    slotId: SLOT_ID,
    candidateId: CANDIDATE_ID,
    candidateFirstName: 'Jane',
    candidateLastName: 'Doe',
    roleId: ROLE_ID,
    roleTitle: 'Backend Engineer',
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
  }
}

function makeScoreRow() {
  return {
    candidateId: CANDIDATE_ID,
    candidateFirstName: 'Jane',
    candidateLastName: 'Doe',
    roleId: ROLE_ID,
    roleTitle: 'Backend Engineer',
    scoreStatus: 'pending' as const,
    uploadedAt: new Date(),
  }
}

function makeStaleRow() {
  return {
    roleId: ROLE_ID,
    roleTitle: 'Backend Engineer',
    prioritiesUpdatedAt: new Date(),
    staleCount: 3,
  }
}

function makeExpiredRoleRow() {
  return {
    roleId: ROLE_ID,
    roleTitle: 'Backend Engineer',
    cutoffDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    customerName: 'ACME Corp',
  }
}

function makeApprovalRow() {
  return {
    roleId: ROLE_ID,
    roleTitle: 'Backend Engineer',
    sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    pendingCount: 2,
  }
}

/** Set up mockSelect to return the five streams in order (interviews, awaiting,
 *  stale, expired, approvals). Approvals is the 5th call. */
function setupAllStreams({
  interviews = [makeSlotRow()],
  awaiting = [makeScoreRow()],
  stale = [makeStaleRow()],
  expired = [makeExpiredRoleRow()],
  approvals = [makeApprovalRow()],
} = {}) {
  mockSelect
    .mockReturnValueOnce(chainableMock(interviews))  // 1. interviews
    .mockReturnValueOnce(chainableMock(awaiting))    // 2. awaiting score
    .mockReturnValueOnce(chainableMock(stale))       // 3. stale priorities
    .mockReturnValueOnce(chainableMock(expired))     // 4. expired roles
    .mockReturnValueOnce(chainableMock(approvals))   // 5. approvals
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getForYouFeed()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns pendingApprovals: [] for recruiter role without querying DB for approvals', async () => {
    // Only 4 streams needed — no approvals query for recruiter
    mockSelect
      .mockReturnValueOnce(chainableMock([makeSlotRow()]))
      .mockReturnValueOnce(chainableMock([makeScoreRow()]))
      .mockReturnValueOnce(chainableMock([makeStaleRow()]))
      .mockReturnValueOnce(chainableMock([makeExpiredRoleRow()]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'recruiter', TENANT_ID)

    expect(feed.pendingApprovals).toEqual([])
    // select was called exactly 4 times — not 5
    expect(mockSelect).toHaveBeenCalledTimes(4)
  })

  it('returns pendingApprovals: [] for admin role without querying approvals', async () => {
    mockSelect
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'admin', TENANT_ID)

    expect(feed.pendingApprovals).toEqual([])
    expect(mockSelect).toHaveBeenCalledTimes(4)
  })

  it('calls all five sub-queries for hiring_manager', async () => {
    setupAllStreams()

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    await getForYouFeed(USER_ID, 'hiring_manager', TENANT_ID)

    expect(mockSelect).toHaveBeenCalledTimes(5)
  })

  it('correctly shapes pendingInterviews rows', async () => {
    const slotRow = makeSlotRow()
    mockSelect
      .mockReturnValueOnce(chainableMock([slotRow]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'recruiter', TENANT_ID)

    expect(feed.pendingInterviews).toHaveLength(1)
    const item = feed.pendingInterviews[0]
    expect(item.slotId).toBe(SLOT_ID)
    expect(item.candidateName).toBe('Jane Doe')
    expect(item.roleId).toBe(ROLE_ID)
    expect(item.roleTitle).toBe('Backend Engineer')
    expect(item.scheduledAt).toBeInstanceOf(Date)
    expect(typeof item.isToday).toBe('boolean')
  })

  it('correctly shapes candidatesAwaitingScore rows', async () => {
    const scoreRow = makeScoreRow()
    mockSelect
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([scoreRow]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'recruiter', TENANT_ID)

    expect(feed.candidatesAwaitingScore).toHaveLength(1)
    const item = feed.candidatesAwaitingScore[0]
    expect(item.candidateName).toBe('Jane Doe')
    expect(item.scoreStatus).toBe('pending')
    expect(item.roleId).toBe(ROLE_ID)
  })

  it('correctly shapes stalePriorities rows and filters out null prioritiesUpdatedAt', async () => {
    const staleRow = makeStaleRow()
    const nullRow = { ...makeStaleRow(), roleId: 'other', prioritiesUpdatedAt: null }
    mockSelect
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([staleRow, nullRow]))
      .mockReturnValueOnce(chainableMock([]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'recruiter', TENANT_ID)

    // Only the row with a real prioritiesUpdatedAt should appear
    expect(feed.stalePriorities).toHaveLength(1)
    expect(feed.stalePriorities[0].staleCandidateCount).toBe(3)
    expect(feed.stalePriorities[0].prioritiesUpdatedAt).toBeInstanceOf(Date)
  })

  it('correctly shapes expiredRoles and computes daysExpired', async () => {
    const expiredRow = makeExpiredRoleRow()
    mockSelect
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([expiredRow]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'recruiter', TENANT_ID)

    expect(feed.expiredRoles).toHaveLength(1)
    const item = feed.expiredRoles[0]
    expect(item.roleId).toBe(ROLE_ID)
    expect(item.customerName).toBe('ACME Corp')
    expect(item.daysExpired).toBeGreaterThanOrEqual(4)
    expect(item.cutoffDate).toBeInstanceOf(Date)
  })

  it('returns all empty arrays cleanly when no data exists (no crashes)', async () => {
    mockSelect
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))
      .mockReturnValueOnce(chainableMock([]))

    const { getForYouFeed } = await import('@/actions/dashboard-tasks')
    const feed = await getForYouFeed(USER_ID, 'recruiter', TENANT_ID)

    expect(feed.pendingInterviews).toEqual([])
    expect(feed.candidatesAwaitingScore).toEqual([])
    expect(feed.stalePriorities).toEqual([])
    expect(feed.expiredRoles).toEqual([])
    expect(feed.pendingApprovals).toEqual([])
  })
})
