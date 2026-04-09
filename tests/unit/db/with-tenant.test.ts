/**
 * Unit tests for withTenant() helper
 *
 * These mock the database layer so no real DB connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures these are initialised before vi.mock factory runs
const { mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockTransaction: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    execute: mockExecute,
    transaction: mockTransaction,
  },
  withTenant: async (tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(async (tx: unknown) => {
      await mockExecute(`SELECT set_tenant_context('${tenantId}'::uuid)`)
      return fn(tx)
    })
  },
}))

import { withTenant } from '@/db'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

describe('withTenant()', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({ select: vi.fn(), insert: vi.fn() })
    })
  })

  it('calls db.transaction', async () => {
    await withTenant(TENANT_ID, async () => 'result')
    expect(mockTransaction).toHaveBeenCalledOnce()
  })

  it('sets tenant context before calling fn', async () => {
    const callOrder: string[] = []

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({})
    })

    mockExecute.mockImplementation(async () => {
      callOrder.push('execute')
      return []
    })

    await withTenant(TENANT_ID, async () => {
      callOrder.push('fn')
      return 'ok'
    })

    expect(callOrder).toEqual(['execute', 'fn'])
  })

  it('passes the transaction object to fn', async () => {
    const fakeTx = { select: vi.fn() }
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx))

    let receivedTx: unknown
    await withTenant(TENANT_ID, async (tx) => {
      receivedTx = tx
    })

    expect(receivedTx).toBe(fakeTx)
  })

  it('returns the value returned by fn', async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))

    const result = await withTenant(TENANT_ID, async () => 42)
    expect(result).toBe(42)
  })

  it('propagates errors thrown by fn', async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))

    await expect(
      withTenant(TENANT_ID, async () => {
        throw new Error('something went wrong')
      })
    ).rejects.toThrow('something went wrong')
  })

  it('includes the tenantId in the context-setting call', async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))

    await withTenant(TENANT_ID, async () => {})

    const executeArg = mockExecute.mock.calls[0][0] as string
    expect(executeArg).toContain(TENANT_ID)
  })
})
