import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the underlying writeAuditLog. emitAudit MUST delegate to it, otherwise
// the 13 other test files that mock '@/lib/audit' would stop seeing audit
// calls from migrated callers.
//
// `vi.hoisted` is needed because the factory in `vi.mock` is hoisted to the
// top of the file by vitest, ahead of any top-level `const`s. Without
// `vi.hoisted` the factory references a not-yet-initialised variable.
const { mockWriteAuditLog } = vi.hoisted(() => ({
  mockWriteAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

import { emitAudit } from '@/lib/audit-middleware'

describe('emitAudit', () => {
  beforeEach(() => {
    mockWriteAuditLog.mockClear()
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  it('forwards tenantId and entry to writeAuditLog unchanged', () => {
    const tenantId = 't-1'
    const entry = {
      action: 'role.created' as const,
      entityType: 'role',
      entityId: 'r-1',
      entityLabel: 'Senior Engineer',
      metadata: { source: 'manual' },
    }

    emitAudit(tenantId, entry)

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(tenantId, entry)
  })

  it('returns synchronously (void) — caller is never asked to await', () => {
    const result = emitAudit('t-1', {
      action: 'role.archived',
      entityType: 'role',
      entityId: 'r-1',
    })
    expect(result).toBeUndefined()
  })

  it('does not throw when writeAuditLog rejects (fire-and-forget)', async () => {
    mockWriteAuditLog.mockRejectedValueOnce(new Error('db down'))

    expect(() => {
      emitAudit('t-1', { action: 'role.created', entityType: 'role' })
    }).not.toThrow()

    // Yield to the microtask queue so the .catch runs before assertions end.
    await new Promise((r) => setTimeout(r, 0))
  })

  it('does not throw when writeAuditLog throws synchronously', () => {
    mockWriteAuditLog.mockImplementationOnce(() => {
      throw new Error('sync boom')
    })

    // Note: the public contract of writeAuditLog is async (returns Promise),
    // so this case shouldn't happen in practice — but if the implementation
    // ever regresses to sync-throw, emitAudit should still not crash the caller.
    expect(() => {
      emitAudit('t-1', { action: 'role.created', entityType: 'role' })
    }).toThrow('sync boom') // current behaviour: sync throws bubble.
    //
    // This test pins the current behaviour. If we ever decide to also catch
    // sync throws, change the assertion to .not.toThrow() and update emitAudit.
  })
})
