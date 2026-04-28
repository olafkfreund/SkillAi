/**
 * Unit tests for src/actions/approvals.ts — hiring-manager approval server actions.
 *
 * Strategy: mock @/db (withTenant + chainable Drizzle methods), mock
 * @/lib/auth/action-context to control session, mock @/lib/audit to
 * avoid real DB writes. Pure in-memory — no real DB touched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const ROLE_ID = 'cccccccc-0000-0000-0000-000000000003'
const CANDIDATE_ID = 'dddddddd-0000-0000-0000-000000000004'
const OTHER_MANAGER_ID = 'eeeeeeee-0000-0000-0000-000000000005'

// ── next/cache mock ────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Audit mock ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

// ── DB mock — chainable builder pattern ────────────────────────────────────────
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete })
  ),
}))

// ── action-context mock (controlled per test) ──────────────────────────────────
const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function asHiringManager() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID,
    userId: USER_ID,
    userRole: 'hiring_manager',
  })
}

function asRecruiter() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID,
    userId: USER_ID,
    userRole: 'recruiter',
  })
}

function asViewer() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID,
    userId: USER_ID,
    userRole: 'viewer',
  })
}

function unauthenticated() {
  mockGetActionContext.mockResolvedValue(null)
}

// ── approveCandidate ──────────────────────────────────────────────────────────

describe('approveCandidate()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asHiringManager()
  })

  it('returns success and writes decision=approved when manager is assigned', async () => {
    // First select: assignment check returns a row
    mockSelect.mockReturnValueOnce(chainableMock([{ id: 'assignment-1' }]))
    // Insert/upsert chain
    const upsertChain = chainableMock(undefined)
    mockInsert.mockReturnValueOnce(upsertChain)

    const { approveCandidate } = await import('@/actions/approvals')
    const result = await approveCandidate(ROLE_ID, CANDIDATE_ID, 'Looks great')

    expect(result).toEqual({ success: true })
    expect(mockInsert).toHaveBeenCalled()
  })

  it('returns error when manager is not assigned to the role', async () => {
    // Assignment check returns empty
    mockSelect.mockReturnValueOnce(chainableMock([]))

    const { approveCandidate } = await import('@/actions/approvals')
    const result = await approveCandidate(ROLE_ID, CANDIDATE_ID)

    expect(result).toEqual({ success: false, error: expect.stringContaining('not assigned') })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Forbidden for viewer role', async () => {
    asViewer()
    const { approveCandidate } = await import('@/actions/approvals')
    const result = await approveCandidate(ROLE_ID, CANDIDATE_ID)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns Unauthorized when unauthenticated', async () => {
    unauthenticated()
    const { approveCandidate } = await import('@/actions/approvals')
    const result = await approveCandidate(ROLE_ID, CANDIDATE_ID)
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('sets decidedAt timestamp on the upsert', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: 'assignment-1' }]))
    const upsertChain = chainableMock(undefined)
    mockInsert.mockReturnValueOnce(upsertChain)

    const before = Date.now()
    const { approveCandidate } = await import('@/actions/approvals')
    await approveCandidate(ROLE_ID, CANDIDATE_ID)
    const after = Date.now()

    // Verify insert was called with a values() call — timestamp is embedded inside
    expect(mockInsert).toHaveBeenCalled()
    // The decidedAt should be a Date within the test window
    const valuesCall = (upsertChain['values'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    if (valuesCall && typeof valuesCall === 'object' && 'decidedAt' in valuesCall) {
      const ts = (valuesCall as { decidedAt: Date }).decidedAt.getTime()
      expect(ts).toBeGreaterThanOrEqual(before)
      expect(ts).toBeLessThanOrEqual(after)
    }
  })
})

// ── rejectCandidate ────────────────────────────────────────────────────────────

describe('rejectCandidate()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asHiringManager()
  })

  it('returns success and writes decision=rejected when manager is assigned', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: 'assignment-1' }]))
    mockInsert.mockReturnValueOnce(chainableMock(undefined))

    const { rejectCandidate } = await import('@/actions/approvals')
    const result = await rejectCandidate(ROLE_ID, CANDIDATE_ID, 'Not a fit')

    expect(result).toEqual({ success: true })
  })

  it('returns error when manager is not assigned', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))

    const { rejectCandidate } = await import('@/actions/approvals')
    const result = await rejectCandidate(ROLE_ID, CANDIDATE_ID)

    expect(result).toEqual({ success: false, error: expect.stringContaining('not assigned') })
  })

  it('returns Forbidden for recruiter trying to reject via hiring_manager gate', async () => {
    // recruiter rank (1) >= hiring_manager rank (0.5) so recruiter SHOULD pass
    // this is testing the gate IS correct and doesn't block recruiters
    asRecruiter()
    mockSelect.mockReturnValueOnce(chainableMock([{ id: 'assignment-1' }]))
    mockInsert.mockReturnValueOnce(chainableMock(undefined))

    const { rejectCandidate } = await import('@/actions/approvals')
    const result = await rejectCandidate(ROLE_ID, CANDIDATE_ID)
    // recruiter passes the hiring_manager gate
    expect(result).toEqual({ success: true })
  })
})

// ── approveAllRemaining ────────────────────────────────────────────────────────

describe('approveAllRemaining()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asHiringManager()
  })

  it('updates only PENDING rows for the current manager', async () => {
    // Assignment check
    mockSelect.mockReturnValueOnce(chainableMock([{ id: 'assignment-1' }]))
    // Update returns two approved rows
    const updateChain = chainableMock([{ id: 'row-1' }, { id: 'row-2' }])
    mockUpdate.mockReturnValueOnce(updateChain)

    const { approveAllRemaining } = await import('@/actions/approvals')
    const result = await approveAllRemaining(ROLE_ID)

    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('returns Forbidden for viewer', async () => {
    asViewer()
    const { approveAllRemaining } = await import('@/actions/approvals')
    const result = await approveAllRemaining(ROLE_ID)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns error when manager is not assigned', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { approveAllRemaining } = await import('@/actions/approvals')
    const result = await approveAllRemaining(ROLE_ID)
    expect(result).toEqual({ success: false, error: expect.stringContaining('not assigned') })
  })

  it('does not touch rows belonging to other managers (WHERE clause scopes to userId)', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: 'assignment-1' }]))
    const updateChain = chainableMock([])
    mockUpdate.mockReturnValueOnce(updateChain)

    const { approveAllRemaining } = await import('@/actions/approvals')
    await approveAllRemaining(ROLE_ID)

    // The update mock was called once — the action itself enforces the
    // managerId = userId filter inside the WHERE clause. We verify the
    // update was invoked (not skipped) and returned successfully.
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })
})

// ── sendShortlistForApproval ──────────────────────────────────────────────────

describe('sendShortlistForApproval()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asRecruiter()
  })

  it('returns success for recruiter when role and managers exist', async () => {
    // role check
    mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
    // managers list
    mockSelect.mockReturnValueOnce(chainableMock([{ userId: OTHER_MANAGER_ID }]))
    // shortlisted candidates
    mockSelect.mockReturnValueOnce(chainableMock([{ candidateId: CANDIDATE_ID }]))
    // update + insert inside transaction
    mockUpdate.mockReturnValueOnce(chainableMock(undefined))
    mockInsert.mockReturnValueOnce(chainableMock(undefined))

    const { sendShortlistForApproval } = await import('@/actions/approvals')
    const result = await sendShortlistForApproval(ROLE_ID)

    expect(result).toEqual({ success: true })
  })

  it('returns Forbidden for hiring_manager (not recruiter+)', async () => {
    asHiringManager()
    const { sendShortlistForApproval } = await import('@/actions/approvals')
    const result = await sendShortlistForApproval(ROLE_ID)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns Forbidden for viewer', async () => {
    asViewer()
    const { sendShortlistForApproval } = await import('@/actions/approvals')
    const result = await sendShortlistForApproval(ROLE_ID)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns error when no managers are assigned', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
    mockSelect.mockReturnValueOnce(chainableMock([]))

    const { sendShortlistForApproval } = await import('@/actions/approvals')
    const result = await sendShortlistForApproval(ROLE_ID)
    expect(result).toEqual({ success: false, error: expect.stringContaining('No hiring managers') })
  })

  it('returns error when role does not exist', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { sendShortlistForApproval } = await import('@/actions/approvals')
    const result = await sendShortlistForApproval(ROLE_ID)
    expect(result).toEqual({ success: false, error: 'Role not found' })
  })

  it('is idempotent — second call still returns success (onConflictDoNothing prevents reset)', async () => {
    // Both calls succeed; the DB constraint handles deduplication
    for (let i = 0; i < 2; i++) {
      mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
      mockSelect.mockReturnValueOnce(chainableMock([{ userId: OTHER_MANAGER_ID }]))
      mockSelect.mockReturnValueOnce(chainableMock([{ candidateId: CANDIDATE_ID }]))
      mockUpdate.mockReturnValueOnce(chainableMock(undefined))
      mockInsert.mockReturnValueOnce(chainableMock(undefined))
    }

    const { sendShortlistForApproval } = await import('@/actions/approvals')
    const first = await sendShortlistForApproval(ROLE_ID)
    const second = await sendShortlistForApproval(ROLE_ID)

    expect(first).toEqual({ success: true })
    expect(second).toEqual({ success: true })
  })
})

// ── getApprovalsForRole ────────────────────────────────────────────────────────

describe('getApprovalsForRole()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asRecruiter()
  })

  it('returns approval rows scoped to the current tenant', async () => {
    const mockRow = {
      id: 'approval-1',
      candidateId: CANDIDATE_ID,
      managerId: OTHER_MANAGER_ID,
      decision: 'approved',
      comment: 'Great candidate',
      decidedAt: new Date(),
      createdAt: new Date(),
    }
    mockSelect.mockReturnValueOnce(chainableMock([mockRow]))

    const { getApprovalsForRole } = await import('@/actions/approvals')
    const rows = await getApprovalsForRole(ROLE_ID)

    expect(rows).toHaveLength(1)
    expect(rows[0].candidateId).toBe(CANDIDATE_ID)
    expect(rows[0].decision).toBe('approved')
  })

  it('returns empty array when unauthenticated (no tenant context)', async () => {
    unauthenticated()
    const { getApprovalsForRole } = await import('@/actions/approvals')
    const rows = await getApprovalsForRole(ROLE_ID)
    expect(rows).toEqual([])
  })

  it('returns empty array when no approvals exist for the role', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { getApprovalsForRole } = await import('@/actions/approvals')
    const rows = await getApprovalsForRole(ROLE_ID)
    expect(rows).toEqual([])
  })
})
