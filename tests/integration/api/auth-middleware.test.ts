/**
 * Integration tests for withApiAuth middleware.
 *
 * All DB and auth dependencies are mocked — no real database or HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockValidateApiToken = vi.fn()
vi.mock('@/lib/api-tokens/validate', () => ({
  validateApiToken: (...args: unknown[]) => mockValidateApiToken(...args),
}))

const mockCheckRateLimit = vi.fn()
vi.mock('@/lib/api/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const TOKEN_ID = 'cccccccc-0000-0000-0000-000000000003'
const RAW_TOKEN = 'skl_dev_validtoken123456'

function makeRequest(options: { authHeader?: string; method?: string } = {}): Request {
  return new Request('http://localhost/api/test', {
    method: options.method ?? 'GET',
    headers: options.authHeader !== undefined
      ? { authorization: options.authHeader }
      : {},
  })
}

function makeCtx<T>(params: T = {} as T) {
  return { params: Promise.resolve(params) }
}

function makeValidatedToken(overrides: Partial<{
  tenantId: string
  userId: string
  scopes: string[]
  tokenId: string
}> = {}) {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    scopes: ['read'],
    tokenId: TOKEN_ID,
    ...overrides,
  }
}

function rateLimitOk() {
  return {
    ok: true,
    remaining: { token: 59, tenant: 99, write: 29 },
  }
}

function rateLimitDenied() {
  return {
    ok: false,
    retryAfter: 42,
    limit: 'token' as const,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('withApiAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 no_token when Authorization header is missing', async () => {
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async () => Response.json({ ok: true }))
    const res = await handler(makeRequest(), makeCtx())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'unauthorized', code: 'no_token' })
  })

  it('returns 401 no_token when Authorization header has wrong format', async () => {
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async () => Response.json({ ok: true }))
    const res = await handler(makeRequest({ authHeader: 'Basic dXNlcjpwYXNz' }), makeCtx())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'unauthorized', code: 'no_token' })
  })

  it('returns 401 invalid_token when validateApiToken returns null (expired token)', async () => {
    mockValidateApiToken.mockResolvedValue(null)
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async () => Response.json({ ok: true }))
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}` }), makeCtx())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'unauthorized', code: 'invalid_token' })
  })

  it('returns 401 invalid_token when validateApiToken returns null (revoked token)', async () => {
    mockValidateApiToken.mockResolvedValue(null)
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async () => Response.json({ ok: true }))
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}` }), makeCtx())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'unauthorized', code: 'invalid_token' })
    expect(mockValidateApiToken).toHaveBeenCalledWith(RAW_TOKEN)
  })

  it('returns 403 insufficient_scope when read-only token used on write route', async () => {
    mockValidateApiToken.mockResolvedValue(makeValidatedToken({ scopes: ['read'] }))
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    // 'write' required scope, but token only has 'read'
    const handler = withApiAuth('write', async () => Response.json({ ok: true }))
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}` }), makeCtx())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'forbidden', code: 'insufficient_scope' })
  })

  it('returns 200 on happy path read with valid read-scope token', async () => {
    mockValidateApiToken.mockResolvedValue(makeValidatedToken({ scopes: ['read'] }))
    mockCheckRateLimit.mockResolvedValue(rateLimitOk())
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async (_req, ctx) => {
      return Response.json({ ok: true, tenantId: ctx.tenantId })
    })
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}` }), makeCtx())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, tenantId: TENANT_ID })
  })

  it('returns 200 on happy path write with valid write-scope token and calls checkRateLimit as write', async () => {
    mockValidateApiToken.mockResolvedValue(makeValidatedToken({ scopes: ['write'] }))
    mockCheckRateLimit.mockResolvedValue(rateLimitOk())
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('write', async (_req, ctx) => {
      return Response.json({ ok: true, userId: ctx.userId })
    })
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}`, method: 'POST' }), makeCtx())

    expect(res.status).toBe(200)
    // Verify checkRateLimit was called with isWrite=true
    expect(mockCheckRateLimit).toHaveBeenCalledWith(TENANT_ID, TOKEN_ID, true)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, userId: USER_ID })
  })

  it('returns 429 with rate-limit headers when checkRateLimit denies', async () => {
    mockValidateApiToken.mockResolvedValue(makeValidatedToken({ scopes: ['read'] }))
    mockCheckRateLimit.mockResolvedValue(rateLimitDenied())
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async () => Response.json({ ok: true }))
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}` }), makeCtx())

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(mockWriteAuditLog).toHaveBeenCalled()
  })

  it('returns 500 internal_error on unhandled handler exception', async () => {
    mockValidateApiToken.mockResolvedValue(makeValidatedToken({ scopes: ['read'] }))
    mockCheckRateLimit.mockResolvedValue(rateLimitOk())
    const { withApiAuth } = await import('@/lib/api/auth-middleware')

    const handler = withApiAuth('read', async () => {
      throw new Error('something exploded')
    })
    const res = await handler(makeRequest({ authHeader: `Bearer ${RAW_TOKEN}` }), makeCtx())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'internal_error', code: 'unhandled' })
  })
})

// ─── requireScope unit tests ───────────────────────────────────────────────────

describe('requireScope inclusion logic', () => {
  it('admin scope satisfies read, write, and admin', async () => {
    const { requireScope } = await import('@/lib/api/auth-middleware')
    expect(requireScope('read', ['admin'])).toBe(true)
    expect(requireScope('write', ['admin'])).toBe(true)
    expect(requireScope('admin', ['admin'])).toBe(true)
  })

  it('write scope satisfies read and write but not admin', async () => {
    const { requireScope } = await import('@/lib/api/auth-middleware')
    expect(requireScope('read', ['write'])).toBe(true)
    expect(requireScope('write', ['write'])).toBe(true)
    expect(requireScope('admin', ['write'])).toBe(false)
  })

  it('read scope satisfies only read', async () => {
    const { requireScope } = await import('@/lib/api/auth-middleware')
    expect(requireScope('read', ['read'])).toBe(true)
    expect(requireScope('write', ['read'])).toBe(false)
    expect(requireScope('admin', ['read'])).toBe(false)
  })

  it('empty scopes satisfy nothing', async () => {
    const { requireScope } = await import('@/lib/api/auth-middleware')
    expect(requireScope('read', [])).toBe(false)
    expect(requireScope('write', [])).toBe(false)
    expect(requireScope('admin', [])).toBe(false)
  })
})
