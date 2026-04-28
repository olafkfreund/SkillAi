/**
 * Unit tests for the API token generate + validate pipeline.
 *
 * All external dependencies (DB, audit, argon2) are mocked so these tests
 * run without a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID   = 'bbbbbbbb-0000-0000-0000-000000000002'
const TOKEN_ID  = 'cccccccc-0000-0000-0000-000000000003'

// ── Hoisted mocks (vi.mock factories run before imports) ──────────────────────
const { mockHash, mockVerify, mockDbSelect, mockWithTenant, mockWriteAuditLog } =
  vi.hoisted(() => {
    // Trivial hash/verify so tests don't pay argon2 cost
    const mockHash   = vi.fn(async (token: string) => `hash:${token}`)
    const mockVerify = vi.fn(
      async (storedHash: string, token: string) => storedHash === `hash:${token}`
    )

    // Chainable select builder: db.select().from().where().limit()
    const mockDbSelect = vi.fn()

    // withTenant stub — calls fn with a fake tx that has update chaining
    const mockWithTenant = vi.fn(
      async (_tenantId: string, fn: (tx: unknown) => unknown) => {
        const fakeTx = {
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn().mockResolvedValue(undefined),
            })),
          })),
        }
        return fn(fakeTx)
      }
    )

    const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)

    return { mockHash, mockVerify, mockDbSelect, mockWithTenant, mockWriteAuditLog }
  })

vi.mock('@node-rs/argon2', () => ({
  hash:   mockHash,
  verify: mockVerify,
}))

vi.mock('@/db', () => ({
  db: { select: mockDbSelect },
  withTenant: mockWithTenant,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

// ── Import subjects after mocks ───────────────────────────────────────────────
import { generateApiToken } from '@/lib/api-tokens/format'
import { validateApiToken } from '@/lib/api-tokens/validate'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeTokenRow = (overrides: Record<string, unknown> = {}) => ({
  id: TOKEN_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  name: 'Test Token',
  prefix: 'skl_dev_4xQz',
  hash: 'hash:skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8',
  scopes: ['read'],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: new Date(),
  ...overrides,
})

function setupDbSelect(rows: unknown[]) {
  const builder = {
    from:  vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  mockDbSelect.mockReturnValue(builder)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateApiToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHash.mockImplementation(async (token: string) => `hash:${token}`)
  })

  it('returns rawToken, prefix, and hash', async () => {
    const { rawToken, prefix, hash } = await generateApiToken()

    expect(rawToken).toMatch(/^skl_(dev|prod)_[A-Za-z0-9]{24}$/)
    expect(prefix).toHaveLength(12)
    expect(rawToken.startsWith(prefix)).toBe(true)
    expect(hash).toBeTruthy()
    expect(mockHash).toHaveBeenCalledWith(rawToken)
  })

  it('generates unique tokens on each call', async () => {
    const a = await generateApiToken()
    const b = await generateApiToken()
    expect(a.rawToken).not.toBe(b.rawToken)
    expect(a.prefix).not.toBe(b.prefix)
  })
})

describe('validateApiToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHash.mockImplementation(async (token: string) => `hash:${token}`)
    mockVerify.mockImplementation(
      async (storedHash: string, token: string) => storedHash === `hash:${token}`
    )
    mockWithTenant.mockImplementation(
      async (_tenantId: string, fn: (tx: unknown) => unknown) => {
        const fakeTx = {
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn().mockResolvedValue(undefined),
            })),
          })),
        }
        return fn(fakeTx)
      }
    )
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  it('happy path — returns tenantId, userId, scopes, tokenId', async () => {
    const rawToken = 'skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8'
    const row = makeTokenRow({ hash: `hash:${rawToken}` })
    setupDbSelect([row])

    const result = await validateApiToken(rawToken)

    expect(result).not.toBeNull()
    expect(result?.tenantId).toBe(TENANT_ID)
    expect(result?.userId).toBe(USER_ID)
    expect(result?.scopes).toEqual(['read'])
    expect(result?.tokenId).toBe(TOKEN_ID)
  })

  it('expired token → null', async () => {
    const rawToken = 'skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8'
    const past = new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
    const row = makeTokenRow({ hash: `hash:${rawToken}`, expiresAt: past })
    setupDbSelect([row])

    const result = await validateApiToken(rawToken)
    expect(result).toBeNull()
  })

  it('revoked token → null', async () => {
    const rawToken = 'skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8'
    const row = makeTokenRow({ hash: `hash:${rawToken}`, revokedAt: new Date() })
    setupDbSelect([row])

    const result = await validateApiToken(rawToken)
    expect(result).toBeNull()
  })

  it('wrong secret (verify returns false) → null', async () => {
    const rawToken = 'skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8'
    // hash in DB is for a different secret
    const row = makeTokenRow({ hash: 'hash:skl_dev_DIFFERENT_SECRET_XXXXX' })
    setupDbSelect([row])

    const result = await validateApiToken(rawToken)
    expect(result).toBeNull()
  })

  it('unknown prefix (no DB row) → null', async () => {
    setupDbSelect([])

    const result = await validateApiToken('skl_dev_UNKNOWNPREFIX_1234567')
    expect(result).toBeNull()
  })

  it('cross-tenant: returned tenantId matches the DB row, not an injected value', async () => {
    // The DB mock returns a row with OTHER_TENANT — middleware is responsible for
    // checking that result.tenantId matches the request's JWT tenantId.
    // This test confirms validateApiToken does not silently substitute tenantId.
    const rawToken = 'skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8'
    const OTHER_TENANT = 'ffffffff-0000-0000-0000-000000000099'
    const row = makeTokenRow({ hash: `hash:${rawToken}`, tenantId: OTHER_TENANT })
    setupDbSelect([row])

    const result = await validateApiToken(rawToken)
    expect(result?.tenantId).toBe(OTHER_TENANT)
  })

  it('last_used_at update fires (withTenant called) after successful validation', async () => {
    const rawToken = 'skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8'
    const row = makeTokenRow({ hash: `hash:${rawToken}` })
    setupDbSelect([row])

    await validateApiToken(rawToken)

    // Allow the fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 20))

    expect(mockWithTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
  })
})
