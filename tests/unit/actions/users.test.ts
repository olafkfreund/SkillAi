/**
 * Unit tests for src/actions/users.ts — deactivate + reactivate.
 *
 * Actions under test:
 *   deactivateUser  — admin gate, self-deactivate guard, last-admin guard,
 *                     happy path (row updated + audit emitted), no-session
 *                     throws Unauthorized.
 *   reactivateUser  — admin gate, happy path (row updated + audit
 *                     `user.reactivated`), no-session throws Unauthorized.
 *
 * Mocks:
 *   @/db                            — withTenant runs the callback with a
 *                                     stub tx that records select / update.
 *   @/db/schema                     — `users` column stubs (column-name
 *                                     property bag, same shape as other
 *                                     action tests in this dir).
 *   drizzle-orm                     — eq / and pass-throughs.
 *   @/lib/auth                      — auth() returns a controlled session.
 *   @/lib/auth/require-role         — real implementation (throws on
 *                                     insufficient role) so the gate is
 *                                     exercised honestly.
 *   @/lib/audit                     — writeAuditLog spy (emitAudit
 *                                     delegates here).
 *   next/cache                      — revalidatePath silenced.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────

const TENANT_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADMIN_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TARGET_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTHER_ID   = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

// ── tx mock state — reset per test ─────────────────────────────────────────────

// rows[0] = first select (target lookup); rows[1] = second select (admin
// count); etc. Tests push the expected sequence before invoking the action.
let txSelectQueue: unknown[][] = []
const mockTxUpdateSet = vi.fn()
const mockTxUpdateWhere = vi.fn()

// Each call to tx.select() returns a chain that resolves to the next
// queued row set. The chain supports .from / .where / .limit so it
// matches both `select(...).from(...).where(...).limit(1)` and
// `select(...).from(...).where(...)`.
function makeTxSelectChain(rows: unknown[]) {
  const promise = Promise.resolve(rows)
  const chain: Record<string, unknown> = {}
  chain.from    = vi.fn(() => chain)
  chain.where   = vi.fn(() => chain)
  chain.limit   = vi.fn(() => Promise.resolve(rows))
  chain.orderBy = vi.fn(() => chain)
  chain.then    = promise.then.bind(promise)
  chain.catch   = promise.catch.bind(promise)
  return chain
}

function makeTx() {
  return {
    select: vi.fn(() => {
      const rows = txSelectQueue.shift() ?? []
      return makeTxSelectChain(rows)
    }),
    update: vi.fn(() => ({
      set: (...args: unknown[]) => {
        mockTxUpdateSet(...args)
        return {
          where: (...wargs: unknown[]) => {
            mockTxUpdateWhere(...wargs)
            return Promise.resolve()
          },
        }
      },
    })),
  }
}

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = makeTx()
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  users: {
    id:                    'id',
    tenantId:              'tenant_id',
    email:                 'email',
    name:                  'name',
    role:                  'role',
    passwordHash:          'password_hash',
    isActive:              'is_active',
    passwordResetRequired: 'password_reset_required',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/lib/auth/require-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/require-role')>()
  return { requireRole: actual.requireRole }
})

// writeAuditLog is what emitAudit delegates to — spy on it directly.
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// bcryptjs is unused by deactivate/reactivate but the actions module imports
// it for the password helpers — keep the import resolvable.
vi.mock('bcryptjs', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash:    vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: vi.fn().mockResolvedValue(true),
}))

// getActionContext is not used by deactivate/reactivate but the module imports it.
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: vi.fn().mockResolvedValue(null),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function setAdminSession() {
  mockAuth.mockResolvedValue({
    user: { id: ADMIN_ID, tenantId: TENANT_ID, role: 'admin' },
  })
}

function setRecruiterSession() {
  mockAuth.mockResolvedValue({
    user: { id: ADMIN_ID, tenantId: TENANT_ID, role: 'recruiter' },
  })
}

function setNoSession() {
  mockAuth.mockResolvedValue(null)
}

function makeUser(overrides: Partial<{
  id: string
  email: string
  role: 'admin' | 'recruiter' | 'viewer' | 'hiring_manager'
  isActive: boolean
}> = {}) {
  return {
    id:       TARGET_ID,
    email:    'target@example.com',
    role:     'recruiter' as const,
    isActive: true,
    ...overrides,
  }
}

// ── deactivateUser ─────────────────────────────────────────────────────────────

describe('deactivateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txSelectQueue = []
    setAdminSession()
  })

  it('throws Unauthorized when there is no session', async () => {
    setNoSession()
    const { deactivateUser } = await import('@/actions/users')

    await expect(deactivateUser(TARGET_ID)).rejects.toThrow(/unauthorized/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('throws Forbidden when caller is not admin', async () => {
    setRecruiterSession()
    const { deactivateUser } = await import('@/actions/users')

    await expect(deactivateUser(TARGET_ID)).rejects.toThrow(/forbidden/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
  })

  it('throws when admin attempts to deactivate themselves', async () => {
    const { deactivateUser } = await import('@/actions/users')

    await expect(deactivateUser(ADMIN_ID)).rejects.toThrow(
      /cannot deactivate your own account/i
    )
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('throws when target user is not found in the tenant', async () => {
    // First select (target lookup) returns no rows
    txSelectQueue = [[]]
    const { deactivateUser } = await import('@/actions/users')

    await expect(deactivateUser(TARGET_ID)).rejects.toThrow(/user not found/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
  })

  it('refuses to deactivate the sole remaining active admin', async () => {
    // Target is an active admin; admin count returns exactly one row (the target)
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'admin', isActive: true })],
      [{ id: TARGET_ID }],
    ]
    const { deactivateUser } = await import('@/actions/users')

    await expect(deactivateUser(TARGET_ID)).rejects.toThrow(
      /sole remaining admin/i
    )
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('allows deactivating an admin when another active admin remains', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'admin', isActive: true })],
      [{ id: TARGET_ID }, { id: OTHER_ID }],
    ]
    const { deactivateUser } = await import('@/actions/users')

    await deactivateUser(TARGET_ID)

    expect(mockTxUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ isActive: false })
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    const [tenantArg, entry] = mockWriteAuditLog.mock.calls[0] as [string, Record<string, unknown>]
    expect(tenantArg).toBe(TENANT_ID)
    expect(entry.action).toBe('user.deactivated')
    expect(entry.entityType).toBe('user')
    expect(entry.entityId).toBe(TARGET_ID)
  })

  it('deactivates a non-admin user happy path and emits audit', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'recruiter', isActive: true, email: 'jane@acme.com' })],
    ]
    const { deactivateUser } = await import('@/actions/users')

    await deactivateUser(TARGET_ID)

    expect(mockTxUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ isActive: false })
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    const [tenantArg, entry] = mockWriteAuditLog.mock.calls[0] as [string, Record<string, unknown>]
    expect(tenantArg).toBe(TENANT_ID)
    expect(entry.action).toBe('user.deactivated')
    expect(entry.entityId).toBe(TARGET_ID)
    expect(entry.entityLabel).toBe('jane@acme.com')
    const meta = entry.metadata as Record<string, unknown>
    expect(meta.targetUserId).toBe(TARGET_ID)
    expect(meta.targetEmail).toBe('jane@acme.com')
  })
})

// ── reactivateUser ─────────────────────────────────────────────────────────────

describe('reactivateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txSelectQueue = []
    setAdminSession()
  })

  it('throws Unauthorized when there is no session', async () => {
    setNoSession()
    const { reactivateUser } = await import('@/actions/users')

    await expect(reactivateUser(TARGET_ID)).rejects.toThrow(/unauthorized/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
  })

  it('throws Forbidden when caller is not admin', async () => {
    setRecruiterSession()
    const { reactivateUser } = await import('@/actions/users')

    await expect(reactivateUser(TARGET_ID)).rejects.toThrow(/forbidden/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
  })

  it('throws when target user is not found in the tenant', async () => {
    txSelectQueue = [[]]
    const { reactivateUser } = await import('@/actions/users')

    await expect(reactivateUser(TARGET_ID)).rejects.toThrow(/user not found/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
  })

  it('reactivates a deactivated user happy path and emits user.reactivated audit', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, isActive: false, email: 'former@acme.com' })],
    ]
    const { reactivateUser } = await import('@/actions/users')

    await reactivateUser(TARGET_ID)

    expect(mockTxUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ isActive: true })
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    const [tenantArg, entry] = mockWriteAuditLog.mock.calls[0] as [string, Record<string, unknown>]
    expect(tenantArg).toBe(TENANT_ID)
    expect(entry.action).toBe('user.reactivated')
    expect(entry.entityType).toBe('user')
    expect(entry.entityId).toBe(TARGET_ID)
    expect(entry.entityLabel).toBe('former@acme.com')
    const meta = entry.metadata as Record<string, unknown>
    expect(meta.targetUserId).toBe(TARGET_ID)
    expect(meta.targetEmail).toBe('former@acme.com')
  })
})
