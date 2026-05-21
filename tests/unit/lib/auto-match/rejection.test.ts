/**
 * Unit tests for src/lib/auto-match/rejection.ts
 *
 * Covers hasBeenRejectedByCustomer — the customer-rejection signal that drives
 * the auto-match pre-filter (epic #267, issue #268).
 *
 * Two SQL queries are issued inside one withTenant() call:
 *   1. role_submissions JOIN roles WHERE status='rejected' AND customer_id matches
 *   2. candidate_role_approvals JOIN roles WHERE decision='rejected' AND customer_id matches
 *
 * Tests verify the OR semantics: either query finding a row returns true.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CUSTOMER_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// The rejection helper calls tx.execute() twice in sequence inside ONE
// withTenant block. We control the two return values via this queue.
let executeQueue: unknown[][] = []
let executeCallCount = 0

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn(() => {
          const rows = executeQueue[executeCallCount] ?? []
          executeCallCount++
          return Promise.resolve(rows)
        }),
      }
      return fn(tx)
    },
  ),
}))

vi.mock('drizzle-orm', () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}))

describe('hasBeenRejectedByCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeQueue = []
    executeCallCount = 0
  })

  it('returns true when role_submissions has a rejected row for the customer', async () => {
    // First execute (submissions) returns a row, so the helper short-circuits
    // and never runs the approvals query.
    executeQueue = [[{ '?column?': 1 }], []]
    const { hasBeenRejectedByCustomer } = await import('@/lib/auto-match/rejection')

    const result = await hasBeenRejectedByCustomer(CANDIDATE_ID, CUSTOMER_ID, TENANT_ID)

    expect(result).toBe(true)
    expect(executeCallCount).toBe(1) // short-circuited
  })

  it('returns true when candidate_role_approvals has a rejected row (submissions empty)', async () => {
    executeQueue = [[], [{ '?column?': 1 }]]
    const { hasBeenRejectedByCustomer } = await import('@/lib/auto-match/rejection')

    const result = await hasBeenRejectedByCustomer(CANDIDATE_ID, CUSTOMER_ID, TENANT_ID)

    expect(result).toBe(true)
    expect(executeCallCount).toBe(2)
  })

  it('returns true when both signals fire', async () => {
    // Short-circuits on the submissions row; the second query never runs.
    executeQueue = [[{ '?column?': 1 }], [{ '?column?': 1 }]]
    const { hasBeenRejectedByCustomer } = await import('@/lib/auto-match/rejection')

    const result = await hasBeenRejectedByCustomer(CANDIDATE_ID, CUSTOMER_ID, TENANT_ID)

    expect(result).toBe(true)
  })

  it('returns false when neither query finds a rejection row', async () => {
    executeQueue = [[], []]
    const { hasBeenRejectedByCustomer } = await import('@/lib/auto-match/rejection')

    const result = await hasBeenRejectedByCustomer(CANDIDATE_ID, CUSTOMER_ID, TENANT_ID)

    expect(result).toBe(false)
    expect(executeCallCount).toBe(2)
  })

  it('runs both queries inside a single withTenant call', async () => {
    executeQueue = [[], []]
    const dbMod = await import('@/db')
    const { hasBeenRejectedByCustomer } = await import('@/lib/auto-match/rejection')

    await hasBeenRejectedByCustomer(CANDIDATE_ID, CUSTOMER_ID, TENANT_ID)

    expect(dbMod.withTenant).toHaveBeenCalledTimes(1)
    expect(dbMod.withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
  })
})
