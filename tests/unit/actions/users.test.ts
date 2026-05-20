/**
 * Unit tests for src/actions/users.ts — deactivate, reactivate, updateUserRole,
 * and forcePasswordReset (issue #220).
 *
 * Actions under test:
 *   deactivateUser     — admin gate, self-deactivate guard, last-admin guard,
 *                        happy path (row updated + audit emitted), no-session
 *                        throws Unauthorized.
 *   reactivateUser     — admin gate, happy path (row updated + audit
 *                        `user.reactivated`), no-session throws Unauthorized.
 *   updateUserRole     — admin gate, self-demote guard, last-admin guard, happy
 *                        paths (promote/demote), no-op (same role), missing user.
 *   forcePasswordReset — admin-only force-reset flow: generates a 32-byte token,
 *                        stores its sha256 hash + 1h expiry, sends via SMTP if
 *                        configured, otherwise returns the plaintext link;
 *                        emits user.password_reset_forced audit; rejects
 *                        self-reset and inactive users.
 *
 * Mocks:
 *   @/db                            — withTenant runs the callback with a
 *                                     stub tx that records select / update.
 *   @/db/schema                     — `users` column stubs.
 *   drizzle-orm                     — eq / and / count / inArray pass-throughs.
 *   @/lib/auth                      — auth() returns a controlled session.
 *   @/lib/auth/action-context       — getActionContext returns controlled ctx.
 *   @/lib/auth/require-role         — real implementation.
 *   @/lib/audit                     — writeAuditLog spy (emitAudit delegates here).
 *   @/lib/audit-middleware          — emitAudit spy (forcePasswordReset uses
 *                                     this directly instead of writeAuditLog).
 *   @/lib/email/sender              — getSenderForTenant + send spies.
 *   next/cache                      — revalidatePath silenced.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADMIN_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TARGET_ID    = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTHER_ID     = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TARGET_EMAIL = 'target@example.com'

// ── tx mock state — reset per test ─────────────────────────────────────────────

// rows[0] = first select (target lookup); rows[1] = second select (admin
// count); etc. Tests push the expected sequence before invoking the action.
// Tests for forcePasswordReset use the simpler `selectResult` static below
// which is auto-queued by the tx select() implementation.
let txSelectQueue: unknown[][] = []
let selectResult: unknown[] = []
const mockTxUpdateSet = vi.fn()
const mockTxUpdateWhere = vi.fn()
// Aliases exposed for forcePasswordReset tests that read `mockUpdateSet`.
const mockUpdateSet = mockTxUpdateSet
const mockUpdateWhere = mockTxUpdateWhere

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
      // If the queue has rows, use them (deactivate / reactivate /
      // updateUserRole tests). Otherwise fall back to the static
      // `selectResult` used by the forcePasswordReset tests.
      const rows = txSelectQueue.length > 0
        ? (txSelectQueue.shift() ?? [])
        : selectResult
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
    id:                          'id',
    tenantId:                    'tenant_id',
    email:                       'email',
    name:                        'name',
    role:                        'role',
    passwordHash:                'password_hash',
    isActive:                    'is_active',
    passwordResetRequired:       'password_reset_required',
    lastPasswordChangeAt:        'last_password_change_at',
    passwordResetTokenHash:      'password_reset_token_hash',
    passwordResetTokenExpiresAt: 'password_reset_token_expires_at',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:        vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  and:       vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  count:     vi.fn(() => ({ type: 'count' })),
  inArray:   vi.fn((col: unknown, vals: unknown) => ({ type: 'inArray', col, vals })),
  isNull:    vi.fn((col: unknown) => ({ type: 'isNull', col })),
  isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
  gt:        vi.fn((col: unknown, val: unknown) => ({ type: 'gt', col, val })),
  lt:        vi.fn((col: unknown, val: unknown) => ({ type: 'lt', col, val })),
}))

// auth() is mocked at module scope above (resolves to null by default).
// Re-export a stable mock fn here so existing helper functions can override it.
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

// writeAuditLog is what emitAudit delegates to for deactivate/reactivate/
// updateUserRole — spy on it directly.
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

// emitAudit (in @/lib/audit-middleware) delegates to writeAuditLog. Tests
// that previously asserted on `mockEmitAudit` here observe the same calls via
// `mockWriteAuditLog` because emitAudit forwards every call. The alias below
// keeps the existing test assertions readable.
const mockEmitAudit = mockWriteAuditLog

// getActionContext — used by forcePasswordReset.
const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// Email sender — used by forcePasswordReset (SMTP path + link fallback).
const mockSenderSend = vi.fn()
const mockGetSenderForTenant = vi.fn()
vi.mock('@/lib/email/sender', () => ({
  getSenderForTenant: (...args: unknown[]) => mockGetSenderForTenant(...args),
}))

// requireRole — use real logic so the role gate behaves correctly.
vi.mock('@/lib/auth/require-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/require-role')>()
  return { requireRole: actual.requireRole }
})

// next/cache — silence revalidatePath.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// bcryptjs — silenced; the actions module imports it for password helpers but
// none of the tests exercise the real implementation.
vi.mock('bcryptjs', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash:    vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: vi.fn().mockResolvedValue(true),
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

function setViewerSession() {
  mockAuth.mockResolvedValue({
    user: { id: ADMIN_ID, tenantId: TENANT_ID, role: 'viewer' },
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

// Helper for updateUserRole tests — wait for the queued microtask that
// `emitAudit` schedules via `void writeAuditLog(...).catch(...)` so the spy
// is observable before the assertion runs.
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
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

// ── updateUserRole ────────────────────────────────────────────────────────────

describe('updateUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txSelectQueue = []
    setAdminSession()
  })

  it('returns Unauthorized when there is no session', async () => {
    setNoSession()
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'admin')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/unauthorized/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('returns Forbidden when caller is a recruiter (non-admin)', async () => {
    setRecruiterSession()
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'admin')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/admin/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('returns Forbidden when caller is a viewer', async () => {
    setViewerSession()
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'recruiter')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/admin/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('rejects self-demote (caller targets their own id)', async () => {
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(ADMIN_ID, 'recruiter')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/own role/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('rejects when target user is not found in tenant', async () => {
    txSelectQueue = [[]] // empty — user not found
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'recruiter')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/not found/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('happy path: promotes a recruiter to admin, writes DB row + audit', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'recruiter' })],
    ]
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'admin')

    expect(result.ok).toBe(true)
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ role: 'admin' })
    await flushMicrotasks()
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    const [tenantArg, entry] = mockWriteAuditLog.mock.calls[0] as [
      string,
      { action: string; entityType: string; entityId: string; metadata: Record<string, unknown> },
    ]
    expect(tenantArg).toBe(TENANT_ID)
    expect(entry.action).toBe('user.role_changed')
    expect(entry.entityType).toBe('user')
    expect(entry.entityId).toBe(TARGET_ID)
    expect(entry.metadata).toEqual({
      from: 'recruiter',
      to: 'admin',
      targetUserId: TARGET_ID,
    })
  })

  it('happy path: demotes an admin to recruiter when other admins exist', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'admin' })],
      [{ value: 3 }], // plenty of admins remaining
    ]

    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'recruiter')

    expect(result.ok).toBe(true)
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ role: 'recruiter' })
    await flushMicrotasks()
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    const [, entry] = mockWriteAuditLog.mock.calls[0] as [
      string,
      { metadata: Record<string, unknown> },
    ]
    expect(entry.metadata).toEqual({
      from: 'admin',
      to: 'recruiter',
      targetUserId: TARGET_ID,
    })
  })

  it('last-admin guard: rejects demoting the sole active admin', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'admin' })],
      [{ value: 1 }], // target IS the only admin
    ]

    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'recruiter')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/only active admin/i)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('last-admin guard: also rejects demote to hiring_manager when sole admin', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'admin' })],
      [{ value: 1 }],
    ]

    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'hiring_manager')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/only active admin/i)
  })

  it('last-admin guard does NOT fire when keeping admin role', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'admin' })],
    ]

    const { updateUserRole } = await import('@/actions/users')

    // newRole === oldRole === 'admin' → no-op short-circuit
    const result = await updateUserRole(TARGET_ID, 'admin')

    expect(result.ok).toBe(true)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('no-op when target already has the requested role: no DB write, no audit', async () => {
    txSelectQueue = [
      [makeUser({ id: TARGET_ID, role: 'recruiter' })],
    ]
    const { updateUserRole } = await import('@/actions/users')

    const result = await updateUserRole(TARGET_ID, 'recruiter')

    expect(result.ok).toBe(true)
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })
})

// ── forcePasswordReset ────────────────────────────────────────────────────────

function asAdmin() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID, userId: ADMIN_ID, userRole: 'admin',
  })
}

function asRecruiter() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID, userId: ADMIN_ID, userRole: 'recruiter',
  })
}

function noContext() {
  mockGetActionContext.mockResolvedValue(null)
}

function targetUserActive() {
  selectResult = [{
    id: TARGET_ID,
    email: TARGET_EMAIL,
    name: 'Target User',
    isActive: true,
  }]
}

function targetUserInactive() {
  selectResult = [{
    id: TARGET_ID,
    email: TARGET_EMAIL,
    name: 'Target User',
    isActive: false,
  }]
}

function targetUserNotFound() {
  selectResult = []
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('forcePasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asAdmin()
    targetUserActive()
    // Default: SMTP available, send succeeds
    mockSenderSend.mockResolvedValue({ ok: true })
    mockGetSenderForTenant.mockResolvedValue({ send: mockSenderSend })
  })

  it('returns Unauthorized when no action context', async () => {
    noContext()
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result).toEqual({ ok: false, error: 'Unauthorized' })
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockEmitAudit).not.toHaveBeenCalled()
  })

  it('returns Forbidden when caller is not admin', async () => {
    asRecruiter()
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result).toEqual({ ok: false, error: 'Forbidden: admins only' })
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('rejects self-reset attempts', async () => {
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(ADMIN_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/own password/i)
    }
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('returns "User not found" when target does not exist', async () => {
    targetUserNotFound()
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result).toEqual({ ok: false, error: 'User not found' })
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('rejects inactive users', async () => {
    targetUserInactive()
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/inactive/i)
    }
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('happy path with SMTP: persists token hash + expiry, sends email, emits audit', async () => {
    const beforeNow = Date.now()
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result).toEqual({ ok: true, emailSent: true })

    // Token + expiry persisted
    expect(mockUpdateSet).toHaveBeenCalledOnce()
    const setArg = mockUpdateSet.mock.calls[0]?.[0] as {
      passwordResetTokenHash: string
      passwordResetTokenExpiresAt: Date
      passwordResetRequired: boolean
    }
    expect(setArg.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(setArg.passwordResetRequired).toBe(true)
    expect(setArg.passwordResetTokenExpiresAt).toBeInstanceOf(Date)
    const expiryMs = setArg.passwordResetTokenExpiresAt.getTime()
    // 1 hour from now, give or take a few seconds for test scheduling
    expect(expiryMs).toBeGreaterThan(beforeNow + 60 * 60 * 1000 - 5_000)
    expect(expiryMs).toBeLessThan(beforeNow + 60 * 60 * 1000 + 5_000)

    // Email actually attempted
    expect(mockSenderSend).toHaveBeenCalledOnce()
    const sendArg = mockSenderSend.mock.calls[0]?.[0] as {
      to: string
      subject: string
      bodyText: string
      bodyHtml: string
    }
    expect(sendArg.to).toBe(TARGET_EMAIL)
    expect(sendArg.subject).toMatch(/reset/i)
    expect(sendArg.bodyText).toContain('/auth/reset?token=')
    expect(sendArg.bodyHtml).toContain('/auth/reset?token=')

    // Audit emitted with correct metadata
    expect(mockEmitAudit).toHaveBeenCalledOnce()
    const auditArgs = mockEmitAudit.mock.calls[0] as [string, {
      action: string
      entityType: string
      entityId: string
      entityLabel: string
      metadata: { targetUserId: string; emailSent: boolean }
    }]
    expect(auditArgs[0]).toBe(TENANT_ID)
    expect(auditArgs[1].action).toBe('user.password_reset_forced')
    expect(auditArgs[1].entityType).toBe('user')
    expect(auditArgs[1].entityId).toBe(TARGET_ID)
    expect(auditArgs[1].entityLabel).toBe(TARGET_EMAIL)
    expect(auditArgs[1].metadata).toEqual({ targetUserId: TARGET_ID, emailSent: true })
  })

  it('happy path WITHOUT SMTP: returns plaintext link, audit records emailSent=false', async () => {
    mockGetSenderForTenant.mockResolvedValue(null)
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.emailSent).toBe(false)
      if (result.emailSent === false) {
        expect(result.resetUrl).toMatch(/\/auth\/reset\?token=[0-9a-f]{64}$/)
      }
    }

    expect(mockSenderSend).not.toHaveBeenCalled()
    expect(mockEmitAudit).toHaveBeenCalledOnce()
    const auditArgs = mockEmitAudit.mock.calls[0] as [string, {
      metadata: { emailSent: boolean }
    }]
    expect(auditArgs[1].metadata.emailSent).toBe(false)
  })

  it('SMTP send failure is treated as link-fallback (emailSent=false in audit)', async () => {
    mockSenderSend.mockResolvedValue({ ok: false, error: 'Connection refused' })
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.emailSent).toBe(false)
    }

    const auditArgs = mockEmitAudit.mock.calls[0] as [string, {
      metadata: { emailSent: boolean }
    }]
    expect(auditArgs[1].metadata.emailSent).toBe(false)
  })

  it('persisted token hash is sha256(plaintext) — never the plaintext itself', async () => {
    mockGetSenderForTenant.mockResolvedValue(null)
    const { forcePasswordReset } = await import('@/actions/users')

    const result = await forcePasswordReset(TARGET_ID)
    expect(result.ok).toBe(true)
    if (!result.ok || result.emailSent) throw new Error('expected link-fallback')

    const plaintext = result.resetUrl.split('token=')[1] ?? ''
    expect(plaintext).toMatch(/^[0-9a-f]{64}$/)

    const setArg = mockUpdateSet.mock.calls[0]?.[0] as { passwordResetTokenHash: string }
    // The stored value must differ from the plaintext (it's a hash, not the token)
    expect(setArg.passwordResetTokenHash).not.toBe(plaintext)
    // Verify it's the expected sha256 — recomputed here to assert format
    const { createHash } = await import('crypto')
    const expectedHash = createHash('sha256').update(plaintext).digest('hex')
    expect(setArg.passwordResetTokenHash).toBe(expectedHash)
  })
})
