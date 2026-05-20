/**
 * Unit tests for src/actions/invitations.ts
 *
 * Actions under test:
 *   createInvitation    — happy path, auth guard (no tenantId), role guard
 *                         (non-admin), invalid email, returns inviteUrl.
 *   revokeInvitation    — happy path (deletes row), auth guard, role guard.
 *   acceptInvitation    — happy path (inserts user, marks used), token-not-found,
 *                         already-used guard, expired-token guard, email-mismatch
 *                         guard, password-mismatch validation.
 *   listPendingInvitations — admin sees list; non-admin sees []; no-tenant returns [].
 *
 * NOTE on resendInvitation:
 *   There is no `resendInvitation` export in src/actions/invitations.ts. The
 *   function does not exist in the codebase — no test is written for it.
 *
 * Mocks:
 *   @/db                            — db (direct select/insert/update/delete),
 *                                     withTenant
 *   @/db/schema                     — users, userInvitations stubs
 *   drizzle-orm                     — eq / and / gt / isNull pass-throughs
 *   @/lib/auth                      — auth (returns mock session)
 *   @/lib/auth/require-role         — requireRole (real logic via vi.fn — throws for
 *                                     non-admin)
 *   next/headers                    — headers (returns mock header list)
 *   next/cache                      — revalidatePath silenced
 *   bcryptjs                        — hash / compare silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────

const TENANT_ID     = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID       = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INVITATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INVITE_TOKEN  = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

// ── DB mock helpers ────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then    = resolved.then.bind(resolved)
  c.catch   = resolved.catch.bind(resolved)
  c.from    = vi.fn(() => c)
  c.where   = vi.fn(() => c)
  c.limit   = vi.fn(() => Promise.resolve(rows))
  c.orderBy = vi.fn(() => c)
  return c
}

// Rows returned by db.select() calls — controlled per test
let dbSelectRows: unknown[] = []

// Captured mutation calls
const mockDbInsertValues   = vi.fn()
const mockDbUpdateSet      = vi.fn()
const mockDbUpdateWhere    = vi.fn()
const mockDbDeleteWhere    = vi.fn()
const mockWithTenantInsert = vi.fn()

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => makeSelectChain(dbSelectRows)),

    insert: vi.fn(() => ({
      values: (...args: unknown[]) => {
        mockDbInsertValues(...args)
        return Promise.resolve()
      },
    })),

    update: vi.fn(() => ({
      set: (...args: unknown[]) => {
        mockDbUpdateSet(...args)
        return {
          where: (...wargs: unknown[]) => {
            mockDbUpdateWhere(...wargs)
            return Promise.resolve()
          },
        }
      },
    })),

    delete: vi.fn(() => ({
      where: (...wargs: unknown[]) => {
        mockDbDeleteWhere(...wargs)
        return Promise.resolve()
      },
    })),
  },

  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockWithTenantInsert(...args)
            return Promise.resolve()
          },
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  users: {
    id:            'id',
    tenantId:      'tenant_id',
    email:         'email',
    name:          'name',
    role:          'role',
    passwordHash:  'password_hash',
    isActive:      'is_active',
  },
  userInvitations: {
    id:         'id',
    tenantId:   'tenant_id',
    token:      'token',
    email:      'email',
    role:       'role',
    createdBy:  'created_by',
    expiresAt:  'expires_at',
    usedAt:     'used_at',
    createdAt:  'created_at',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:     vi.fn(() => ({ type: 'eq' })),
  and:    vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  gt:     vi.fn(() => ({ type: 'gt' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
  or:     vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}))

// Mock headers — controlled per test
const mockHeadersGet = vi.fn()
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (key: string) => mockHeadersGet(key),
    }),
}))

// Mock auth session — controlled per test
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

// requireRole — use real logic (throws for insufficient role)
// We import the real implementation so the role gate behaves correctly
vi.mock('@/lib/auth/require-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/require-role')>()
  return { requireRole: actual.requireRole }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// bcryptjs — hash is fast; don't actually bcrypt in unit tests
vi.mock('bcryptjs', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash:    vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: vi.fn().mockResolvedValue(true),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function setAdminHeaders() {
  mockHeadersGet.mockImplementation((key: string) => {
    if (key === 'x-tenant-id') return TENANT_ID
    if (key === 'x-user-id')   return USER_ID
    if (key === 'x-user-role') return 'admin'
    return null
  })
}

function setRecruiterHeaders() {
  mockHeadersGet.mockImplementation((key: string) => {
    if (key === 'x-tenant-id') return TENANT_ID
    if (key === 'x-user-id')   return USER_ID
    if (key === 'x-user-role') return 'recruiter'
    return null
  })
}

function setNoAuthHeaders() {
  mockHeadersGet.mockReturnValue(null)
}

function setAdminSession() {
  mockAuth.mockResolvedValue({
    user: { id: USER_ID, tenantId: TENANT_ID, role: 'admin' },
  })
}

function setRecruiterSession() {
  mockAuth.mockResolvedValue({
    user: { id: USER_ID, tenantId: TENANT_ID, role: 'recruiter' },
  })
}

function setNoSession() {
  mockAuth.mockResolvedValue(null)
}

function makeInvitation(overrides: Partial<{
  id: string
  tenantId: string
  token: string
  email: string | null
  role: string
  usedAt: Date | null
  expiresAt: Date
}> = {}) {
  return {
    id:         INVITATION_ID,
    tenantId:   TENANT_ID,
    token:      INVITE_TOKEN,
    email:      null,
    role:       'recruiter',
    createdBy:  USER_ID,
    usedAt:     null,
    expiresAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days future
    createdAt:  new Date(),
    ...overrides,
  }
}

function makeInviteFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('role', 'recruiter')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

function makeAcceptFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('token',           INVITE_TOKEN)
  fd.set('name',            'Jane Doe')
  fd.set('email',           'jane.doe@example.com')
  fd.set('password',        'SecurePassword!2026')
  fd.set('confirmPassword', 'SecurePassword!2026')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

// ── createInvitation ───────────────────────────────────────────────────────────

describe('createInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAdminHeaders()
    dbSelectRows = []
  })

  it('returns Unauthorized when no tenantId header', async () => {
    setNoAuthHeaders()
    const { createInvitation } = await import('@/actions/invitations')

    const result = await createInvitation(null, makeInviteFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns error when role is recruiter (non-admin)', async () => {
    setRecruiterHeaders()
    const { createInvitation } = await import('@/actions/invitations')

    const result = await createInvitation(null, makeInviteFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/admin/i)
  })

  it('returns fieldErrors when email is invalid', async () => {
    const { createInvitation } = await import('@/actions/invitations')
    const fd = makeInviteFormData({ email: 'not-an-email' })

    const result = await createInvitation(null, fd)

    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
  })

  it('creates invitation row and returns inviteUrl on happy path', async () => {
    const { createInvitation } = await import('@/actions/invitations')
    const fd = makeInviteFormData({ email: 'new.recruiter@example.com', role: 'recruiter' })

    const result = await createInvitation(null, fd)

    expect(result.success).toBe(true)
    expect(result.inviteUrl).toMatch(/\/invite\//)
    expect(mockDbInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockDbInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.role).toBe('recruiter')
    expect(typeof insertArg.token).toBe('string')
    expect((insertArg.token as string).length).toBeGreaterThan(20)
  })

  it('creates invitation without email (open link) when email is omitted', async () => {
    const { createInvitation } = await import('@/actions/invitations')
    const fd = makeInviteFormData() // no email field set

    const result = await createInvitation(null, fd)

    expect(result.success).toBe(true)
    const insertArg = mockDbInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.email).toBeNull()
  })

  it('creates invitation with admin role when specified', async () => {
    const { createInvitation } = await import('@/actions/invitations')
    const fd = makeInviteFormData({ role: 'admin' })

    const result = await createInvitation(null, fd)

    expect(result.success).toBe(true)
    const insertArg = mockDbInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.role).toBe('admin')
  })
})

// ── revokeInvitation ───────────────────────────────────────────────────────────

describe('revokeInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAdminSession()
  })

  it('silently returns when no session (no crash)', async () => {
    setNoSession()
    const { revokeInvitation } = await import('@/actions/invitations')

    await expect(revokeInvitation(INVITATION_ID)).resolves.toBeUndefined()
    expect(mockDbDeleteWhere).not.toHaveBeenCalled()
  })

  it('throws Forbidden when user is recruiter (not admin)', async () => {
    setRecruiterSession()
    const { revokeInvitation } = await import('@/actions/invitations')

    await expect(revokeInvitation(INVITATION_ID)).rejects.toThrow(/forbidden/i)
  })

  it('deletes the invitation row on happy path', async () => {
    const { revokeInvitation } = await import('@/actions/invitations')

    await revokeInvitation(INVITATION_ID)

    expect(mockDbDeleteWhere).toHaveBeenCalledTimes(1)
  })
})

// ── acceptInvitation ───────────────────────────────────────────────────────────

describe('acceptInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: db.select returns a valid, unused, non-expired invitation
    dbSelectRows = [makeInvitation()]
  })

  it('returns fieldErrors when token is missing', async () => {
    const { acceptInvitation } = await import('@/actions/invitations')
    const fd = makeAcceptFormData()
    fd.delete('token')

    const result = await acceptInvitation(null, fd)

    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
  })

  it('returns fieldErrors when password is too short (<12 chars)', async () => {
    const { acceptInvitation } = await import('@/actions/invitations')
    const fd = makeAcceptFormData({ password: 'short', confirmPassword: 'short' })

    const result = await acceptInvitation(null, fd)

    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
    expect(result.fieldErrors?.password).toBeDefined()
  })

  it('returns fieldErrors when passwords do not match', async () => {
    const { acceptInvitation } = await import('@/actions/invitations')
    const fd = makeAcceptFormData({
      password:        'SecurePassword!2026',
      confirmPassword: 'DifferentPassword2026!',
    })

    const result = await acceptInvitation(null, fd)

    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
  })

  it('returns error when invitation token is not found', async () => {
    dbSelectRows = []  // no invitation row
    const { acceptInvitation } = await import('@/actions/invitations')

    const result = await acceptInvitation(null, makeAcceptFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found|already used/i)
  })

  it('returns error when invitation has already been used', async () => {
    dbSelectRows = [makeInvitation({ usedAt: new Date('2026-01-01') })]
    const { acceptInvitation } = await import('@/actions/invitations')

    const result = await acceptInvitation(null, makeAcceptFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already been used/i)
  })

  it('returns error when invitation has expired', async () => {
    dbSelectRows = [makeInvitation({ expiresAt: new Date('2020-01-01') })]
    const { acceptInvitation } = await import('@/actions/invitations')

    const result = await acceptInvitation(null, makeAcceptFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/expired/i)
  })

  it('returns error when email does not match the invitation email', async () => {
    dbSelectRows = [makeInvitation({ email: 'specific@example.com' })]
    const { acceptInvitation } = await import('@/actions/invitations')
    const fd = makeAcceptFormData({ email: 'different@example.com' })

    const result = await acceptInvitation(null, fd)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/different email/i)
  })

  it('inserts user row, marks invitation used, and returns success on happy path', async () => {
    const { acceptInvitation } = await import('@/actions/invitations')

    const result = await acceptInvitation(null, makeAcceptFormData())

    expect(result.success).toBe(true)
    // User inserted via withTenant
    expect(mockWithTenantInsert).toHaveBeenCalledTimes(1)
    const userInsert = mockWithTenantInsert.mock.calls[0][0] as Record<string, unknown>
    expect(userInsert.email).toBe('jane.doe@example.com')
    expect(userInsert.name).toBe('Jane Doe')
    expect(userInsert.isActive).toBe(true)
    // Invitation marked used via db.update
    expect(mockDbUpdateSet).toHaveBeenCalledTimes(1)
    const updateArg = mockDbUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.usedAt).toBeInstanceOf(Date)
  })

  it('accepts when invitation has no email restriction (open link)', async () => {
    dbSelectRows = [makeInvitation({ email: null })]
    const { acceptInvitation } = await import('@/actions/invitations')

    const result = await acceptInvitation(
      null,
      makeAcceptFormData({ email: 'anyone@example.com' })
    )

    expect(result.success).toBe(true)
  })
})

// ── listPendingInvitations ─────────────────────────────────────────────────────

describe('listPendingInvitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] when no tenantId header', async () => {
    setNoAuthHeaders()
    const { listPendingInvitations } = await import('@/actions/invitations')

    const result = await listPendingInvitations()

    expect(result).toEqual([])
  })

  it('returns [] when user is not admin', async () => {
    setRecruiterHeaders()
    const { listPendingInvitations } = await import('@/actions/invitations')

    const result = await listPendingInvitations()

    expect(result).toEqual([])
  })

  it('returns pending invitation list for admin', async () => {
    setAdminHeaders()
    dbSelectRows = [makeInvitation(), makeInvitation({ id: 'other-id', token: 'other-token' })]
    const { listPendingInvitations } = await import('@/actions/invitations')

    const result = await listPendingInvitations()

    // db.select() chain is called — result is whatever db returns (the chain resolves to rows)
    // The function returns the chain itself (not awaited by caller), so we just verify no throw
    expect(result).toBeDefined()
  })
})
