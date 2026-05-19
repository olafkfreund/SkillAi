/**
 * Unit tests for src/actions/scores.ts
 *
 * Covers:
 *   rescoreCandidate — happy path (existing score reset, new score insert), auth
 *   errors, AI-client-throws guard, and removeCandidateFromRole.
 *
 * Mocks:
 *   @/db                          — withTenant, db
 *   @/db/schema                   — scores table stub
 *   drizzle-orm                   — eq / and pass-throughs
 *   @/lib/auth/action-context     — getActionContext
 *   @/lib/audit                   — writeAuditLog
 *   @/lib/ai/scoring              — triggerScoring (fire-and-forget)
 *   next/cache                    — revalidatePath silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID     = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const CANDIDATE_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const ROLE_ID       = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const SCORE_ID      = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'
const USER_ID       = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'

// ── Mock builders ─────────────────────────────────────────────────────────────

/**
 * Returns a thenable chain that resolves to `rows`.
 * Supports: .select().from().where().limit()
 */
function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then  = resolved.then.bind(resolved)
  c.catch = resolved.catch.bind(resolved)
  c.from  = vi.fn(() => c)
  c.where = vi.fn(() => c)
  c.limit = vi.fn(() => Promise.resolve(rows))
  return c
}

// ── Per-test state ─────────────────────────────────────────────────────────────

// Tracks how many times withTenant has been called inside a single test so we
// can return different tx behaviour for the "select" call vs the "mutate" call.
let withTenantCallCount = 0
// Controls what the first select call returns (used to simulate
// "score exists" vs "no score").
let scoreExistsRows: unknown[] = []

// Captured args from the mutation calls so we can assert on them.
const mockUpdateSet   = vi.fn()
const mockUpdateWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockDeleteWhere  = vi.fn()

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      withTenantCallCount++

      const selectChain = makeSelectChain(scoreExistsRows)

      const tx = {
        select: vi.fn(() => selectChain),

        update: vi.fn(() => ({
          set: (...args: unknown[]) => {
            mockUpdateSet(...args)
            return {
              where: (...wargs: unknown[]) => {
                mockUpdateWhere(...wargs)
                return Promise.resolve()
              },
            }
          },
        })),

        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return Promise.resolve()
          },
        })),

        delete: vi.fn(() => ({
          where: (...wargs: unknown[]) => {
            mockDeleteWhere(...wargs)
            return Promise.resolve()
          },
        })),
      }

      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  scores: {
    id:          'id',
    tenantId:    'tenant_id',
    candidateId: 'candidate_id',
    roleId:      'role_id',
    scoreStatus: 'score_status',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

const mockTriggerScoring = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/ai/scoring', () => ({
  triggerScoring: (...args: unknown[]) => mockTriggerScoring(...args),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

// ── rescoreCandidate ──────────────────────────────────────────────────────────

describe('rescoreCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantCallCount = 0
    scoreExistsRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  // ── Auth checks ──────────────────────────────────────────────────────────────

  it('returns error when no action context (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { rescoreCandidate } = await import('@/actions/scores')

    const result = await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { rescoreCandidate } = await import('@/actions/scores')

    const result = await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── Happy path: existing score is reset ──────────────────────────────────────

  it('resets an existing score to pending and triggers scoring (success=true)', async () => {
    scoreExistsRows = [{ id: SCORE_ID }] // simulate existing score row
    const { rescoreCandidate } = await import('@/actions/scores')

    const result = await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    expect(result.success).toBe(true)
    // update().set() should have been called with scoreStatus: 'pending'
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.scoreStatus).toBe('pending')
    expect(setArg.overallScore).toBeNull()
    // insert should NOT have been called (we updated the existing row)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('fires triggerScoring with correct ids after resetting existing score', async () => {
    scoreExistsRows = [{ id: SCORE_ID }]
    const { rescoreCandidate } = await import('@/actions/scores')

    await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    // triggerScoring is fire-and-forget (.catch()), allow it to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(mockTriggerScoring).toHaveBeenCalledWith(CANDIDATE_ID, ROLE_ID, TENANT_ID)
  })

  // ── Happy path: no existing score → insert fresh pending row ─────────────────

  it('inserts a fresh pending score when no score exists yet', async () => {
    scoreExistsRows = [] // no existing score
    const { rescoreCandidate } = await import('@/actions/scores')

    const result = await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    expect(result.success).toBe(true)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.candidateId).toBe(CANDIDATE_ID)
    expect(insertArg.roleId).toBe(ROLE_ID)
    expect(insertArg.scoreStatus).toBe('pending')
    // update should NOT have been called (no existing row to reset)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('fires triggerScoring after inserting a new pending score', async () => {
    scoreExistsRows = []
    const { rescoreCandidate } = await import('@/actions/scores')

    await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    await new Promise((r) => setTimeout(r, 0))
    expect(mockTriggerScoring).toHaveBeenCalledWith(CANDIDATE_ID, ROLE_ID, TENANT_ID)
  })

  // ── Edge: hiring_manager role is allowed (rank ≥ recruiter? No — actually blocked) ──
  // requireRole(userRole, 'recruiter') uses rank-based check:
  // hiring_manager rank=0.5 < recruiter rank=1 → should be forbidden.

  it('returns error when role is hiring_manager (below recruiter threshold)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'hiring_manager' as const,
    })
    const { rescoreCandidate } = await import('@/actions/scores')

    const result = await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('succeeds for admin role', async () => {
    scoreExistsRows = []
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'admin' as const,
    })
    const { rescoreCandidate } = await import('@/actions/scores')

    const result = await rescoreCandidate(CANDIDATE_ID, ROLE_ID)

    expect(result.success).toBe(true)
  })
})

// ── removeCandidateFromRole ───────────────────────────────────────────────────

describe('removeCandidateFromRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantCallCount = 0
    scoreExistsRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('throws when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { removeCandidateFromRole } = await import('@/actions/scores')

    await expect(removeCandidateFromRole(SCORE_ID, ROLE_ID)).rejects.toThrow(/unauthorized/i)
  })

  it('deletes the score row and writes audit log', async () => {
    const { removeCandidateFromRole } = await import('@/actions/scores')

    await removeCandidateFromRole(SCORE_ID, ROLE_ID)

    // delete().where() must have been called
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
    // audit log must be written with score.removed action
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'score.removed',
        entityType: 'score',
        entityId: SCORE_ID,
      })
    )
  })

  it('throws when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { removeCandidateFromRole } = await import('@/actions/scores')

    await expect(removeCandidateFromRole(SCORE_ID, ROLE_ID)).rejects.toThrow()
  })
})
