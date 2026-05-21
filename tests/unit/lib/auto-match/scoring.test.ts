/**
 * Unit tests for src/lib/auto-match/scoring.ts
 *
 * Covers:
 *   - getTodayAutoMatchSpend — SUM query against ai_usage
 *   - getAutoMatchDailyCostCapUsd — tenant_settings lookup with $50 default
 *   - triggerAutoMatchScoring — orchestration: cost-cap gate, reuse-existing,
 *     parallel scoring, scored/failed classification via final scoreStatus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROLE_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── Mock builders ─────────────────────────────────────────────────────────────

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

function makeInsertChain() {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(undefined)
  c.then     = resolved.then.bind(resolved)
  c.values   = vi.fn(() => c)
  c.onConflictDoNothing = vi.fn(() => Promise.resolve(undefined))
  return c
}

// Per-test queues (consumed sequentially across withTenant calls)
let selectQueue: unknown[][] = []
let selectCount = 0
let executeQueue: unknown[][] = []
let executeCount = 0

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => {
          const rows = selectQueue[selectCount] ?? []
          selectCount++
          return makeSelectChain(rows)
        }),
        insert: vi.fn(() => makeInsertChain()),
        execute: vi.fn(() => {
          const rows = executeQueue[executeCount] ?? []
          executeCount++
          return Promise.resolve(rows)
        }),
      }
      return fn(tx)
    },
  ),
}))

vi.mock('@/db/schema', () => ({
  scores: {
    id: 'id', tenantId: 'tenant_id', candidateId: 'candidate_id',
    roleId: 'role_id', scoreStatus: 'score_status',
  },
  tenantSettings: {
    tenantId: 'tenant_id', key: 'key', value: 'value',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:       vi.fn(() => ({ type: 'eq' })),
  and:      vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray:  vi.fn(() => ({ type: 'inArray' })),
  sql:      vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}))

const mockTriggerScoring = vi.fn()
vi.mock('@/lib/ai/scoring', () => ({
  triggerScoring: (...args: unknown[]) => mockTriggerScoring(...args),
}))

function resetState() {
  selectQueue = []
  selectCount = 0
  executeQueue = []
  executeCount = 0
}

// ── getTodayAutoMatchSpend ────────────────────────────────────────────────────

describe('getTodayAutoMatchSpend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
  })

  it('returns 0 when ai_usage SUM is null (no rows today)', async () => {
    executeQueue = [[{ total: 0 }]]
    const { getTodayAutoMatchSpend } = await import('@/lib/auto-match/scoring')

    const result = await getTodayAutoMatchSpend(TENANT_ID)

    expect(result).toBe(0)
  })

  it('parses string totals (postgres NUMERIC returns string)', async () => {
    executeQueue = [[{ total: '12.345678' }]]
    const { getTodayAutoMatchSpend } = await import('@/lib/auto-match/scoring')

    const result = await getTodayAutoMatchSpend(TENANT_ID)

    expect(result).toBeCloseTo(12.345678, 6)
  })

  it('returns 0 if execute returns no rows', async () => {
    executeQueue = [[]]
    const { getTodayAutoMatchSpend } = await import('@/lib/auto-match/scoring')

    const result = await getTodayAutoMatchSpend(TENANT_ID)

    expect(result).toBe(0)
  })
})

// ── getAutoMatchDailyCostCapUsd ───────────────────────────────────────────────

describe('getAutoMatchDailyCostCapUsd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
  })

  it('returns the default $50 cap when no setting row exists', async () => {
    selectQueue = [[]]
    const { getAutoMatchDailyCostCapUsd } = await import('@/lib/auto-match/scoring')

    const result = await getAutoMatchDailyCostCapUsd(TENANT_ID)

    expect(result).toBe(50)
  })

  it('returns the configured cap from tenant_settings', async () => {
    selectQueue = [[{ value: '120' }]]
    const { getAutoMatchDailyCostCapUsd } = await import('@/lib/auto-match/scoring')

    const result = await getAutoMatchDailyCostCapUsd(TENANT_ID)

    expect(result).toBe(120)
  })

  it('falls back to default when the setting value is malformed', async () => {
    selectQueue = [[{ value: 'not-a-number' }]]
    const { getAutoMatchDailyCostCapUsd } = await import('@/lib/auto-match/scoring')

    const result = await getAutoMatchDailyCostCapUsd(TENANT_ID)

    expect(result).toBe(50)
  })

  it('falls back to default when the setting value is zero or negative', async () => {
    selectQueue = [[{ value: '0' }]]
    const { getAutoMatchDailyCostCapUsd } = await import('@/lib/auto-match/scoring')

    const result = await getAutoMatchDailyCostCapUsd(TENANT_ID)

    expect(result).toBe(50)
  })
})

// ── triggerAutoMatchScoring ───────────────────────────────────────────────────

describe('triggerAutoMatchScoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
    mockTriggerScoring.mockResolvedValue(undefined)
  })

  it('returns empty result without touching the DB when no candidates supplied', async () => {
    const { triggerAutoMatchScoring } = await import('@/lib/auto-match/scoring')

    const result = await triggerAutoMatchScoring(ROLE_ID, TENANT_ID, [])

    expect(result).toEqual({
      skipped: false,
      scoredCandidateIds: [],
      failedCandidateIds: [],
      reusedExistingScores: [],
    })
    expect(mockTriggerScoring).not.toHaveBeenCalled()
  })

  it('skips scoring when daily cost cap is already met', async () => {
    // Order of withTenant calls inside triggerAutoMatchScoring:
    //   1. execute → today's spend          → returns 51.0
    //   2. select  → cap setting            → returns [] (use default 50)
    executeQueue = [[{ total: '51.0' }]]
    selectQueue  = [[]]
    const { triggerAutoMatchScoring } = await import('@/lib/auto-match/scoring')

    const result = await triggerAutoMatchScoring(ROLE_ID, TENANT_ID, ['c-1', 'c-2', 'c-3'])

    expect(result).toEqual({
      skipped: true,
      reason: 'daily_cost_cap_exceeded',
      spentTodayUsd: 51,
      capUsd: 50,
    })
    expect(mockTriggerScoring).not.toHaveBeenCalled()
  })

  it('scores all candidates when none have existing scores', async () => {
    //   1. execute → today's spend           → returns 0
    //   2. select  → cap setting             → returns [] (use 50)
    //   3. select  → existing scores         → returns []
    //   4. insert (withTenant — uses no select call but does count as one withTenant)
    //      NOTE: insert path uses insert() not select(), so no selectQueue advance
    //   5. select  → final statuses          → returns 3 complete rows
    executeQueue = [[{ total: '0' }]]
    selectQueue  = [
      [],                                    // cap setting
      [],                                    // existing scores
      [
        { candidateId: 'c-1', status: 'complete' },
        { candidateId: 'c-2', status: 'complete' },
        { candidateId: 'c-3', status: 'complete' },
      ],
    ]
    const { triggerAutoMatchScoring } = await import('@/lib/auto-match/scoring')

    const result = await triggerAutoMatchScoring(ROLE_ID, TENANT_ID, ['c-1', 'c-2', 'c-3'])

    expect(mockTriggerScoring).toHaveBeenCalledTimes(3)
    expect(mockTriggerScoring).toHaveBeenCalledWith('c-1', ROLE_ID, TENANT_ID, 'auto_match_scoring')
    expect(mockTriggerScoring).toHaveBeenCalledWith('c-2', ROLE_ID, TENANT_ID, 'auto_match_scoring')
    expect(mockTriggerScoring).toHaveBeenCalledWith('c-3', ROLE_ID, TENANT_ID, 'auto_match_scoring')

    expect(result).toEqual({
      skipped: false,
      scoredCandidateIds: ['c-1', 'c-2', 'c-3'],
      failedCandidateIds: [],
      reusedExistingScores: [],
    })
  })

  it('does not re-score candidates that already have complete scores', async () => {
    executeQueue = [[{ total: '0' }]]
    selectQueue  = [
      [],                                                              // cap setting
      [{ candidateId: 'c-1', status: 'complete' }],                    // existing
      [{ candidateId: 'c-2', status: 'complete' },                     // final statuses for c-2, c-3
       { candidateId: 'c-3', status: 'complete' }],
    ]
    const { triggerAutoMatchScoring } = await import('@/lib/auto-match/scoring')

    const result = await triggerAutoMatchScoring(ROLE_ID, TENANT_ID, ['c-1', 'c-2', 'c-3'])

    expect(mockTriggerScoring).toHaveBeenCalledTimes(2)
    expect(mockTriggerScoring).toHaveBeenCalledWith('c-2', ROLE_ID, TENANT_ID, 'auto_match_scoring')
    expect(mockTriggerScoring).toHaveBeenCalledWith('c-3', ROLE_ID, TENANT_ID, 'auto_match_scoring')
    expect(mockTriggerScoring).not.toHaveBeenCalledWith('c-1', ROLE_ID, TENANT_ID, 'auto_match_scoring')

    if (result.skipped) throw new Error('expected non-skipped result')
    expect(result.reusedExistingScores).toEqual(['c-1'])
    expect(result.scoredCandidateIds).toContain('c-1')
    expect(result.scoredCandidateIds).toContain('c-2')
    expect(result.scoredCandidateIds).toContain('c-3')
  })

  it('classifies failed scoring runs from the final scoreStatus', async () => {
    executeQueue = [[{ total: '0' }]]
    selectQueue  = [
      [],                                                              // cap setting
      [],                                                              // existing
      [{ candidateId: 'c-1', status: 'complete' },                     // c-2 failed mid-call
       { candidateId: 'c-2', status: 'failed' },
       { candidateId: 'c-3', status: 'complete' }],
    ]
    const { triggerAutoMatchScoring } = await import('@/lib/auto-match/scoring')

    const result = await triggerAutoMatchScoring(ROLE_ID, TENANT_ID, ['c-1', 'c-2', 'c-3'])

    if (result.skipped) throw new Error('expected non-skipped result')
    expect(result.scoredCandidateIds).toEqual(['c-1', 'c-3'])
    expect(result.failedCandidateIds).toEqual(['c-2'])
  })
})
