// @vitest-environment node

/**
 * Integration tests for the MCP HTTP route at /api/mcp.
 *
 * Mocks the bearer-token validator, the rate-limiter, and the user-row
 * lookup. Mocks server actions invoked by write tools so the test never
 * touches the database. Read tools have their target tables shimmed by
 * mocking `withTenant` to return canned rows.
 *
 * Test matrix:
 *   1. Missing Authorization → 401
 *   2. Invalid bearer token → 401
 *   3. Insufficient scope on a write tool → MCP tool error
 *   4. Read tool happy path → structured content
 *   5. Write tool without confirmed=true → MCP tool error (no action call)
 *   6. Write tool with confirmed=true → server action invoked
 *   7. Cross-tenant read enforced via withTenant — different tenantId
 *      passed through to the database call
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// db.select().from(users) for the role lookup, and db.transaction(...) for
// withTenant. We stub both via factory mocks.
const mockUserRoleLookup = vi.fn()
const mockWithTenantImpl = vi.fn()
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async (_n: number) => mockUserRoleLookup(),
        }),
      }),
    }),
  },
  withTenant: async <T,>(tenantId: string, fn: (tx: unknown) => Promise<T>): Promise<T> =>
    mockWithTenantImpl(tenantId, fn),
}))

const mockUpdateCandidateStatus = vi.fn()
vi.mock('@/actions/candidates', () => ({
  updateCandidateStatus: (...args: unknown[]) => mockUpdateCandidateStatus(...args),
  updateCandidateAvailability: vi.fn(),
  archiveCandidate: vi.fn(),
}))

// Mock the rest of the action modules so the tool imports resolve without
// pulling in `next/server`, `next/navigation`, `next-auth`, etc.
vi.mock('@/actions/roles', () => ({ archiveRole: vi.fn() }))
vi.mock('@/actions/scores', () => ({ rescoreCandidate: vi.fn() }))
vi.mock('@/actions/notes', () => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}))
vi.mock('@/actions/approvals', () => ({
  approveCandidate: vi.fn(),
  rejectCandidate: vi.fn(),
  getApprovalsForRole: vi.fn(),
}))
vi.mock('@/actions/role-managers', () => ({ getMyAssignedRoles: vi.fn() }))
vi.mock('@/actions/users', () => ({ listTenantUsers: vi.fn() }))
vi.mock('@/actions/settings', () => ({ getConfiguredKeys: vi.fn() }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TOKEN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TOKEN = 'skl_dev_validtoken1234'

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function rpcCall(id: number, method: string, params?: unknown) {
  return { jsonrpc: '2.0', id, method, params }
}

function rateOk() {
  return { ok: true, remaining: { token: 59, tenant: 99, write: 29 } }
}

function setHappyAuth(scopes: ('read' | 'write' | 'admin')[] = ['read'], tenantId = TENANT_A) {
  mockValidateApiToken.mockResolvedValue({ tenantId, userId: USER_ID, scopes, tokenId: TOKEN_ID })
  mockCheckRateLimit.mockResolvedValue(rateOk())
  mockUserRoleLookup.mockResolvedValue([{ role: 'recruiter' }])
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/api/mcp route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithTenantImpl.mockReset()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      new Request('http://localhost/api/mcp', { method: 'POST', body: '{}' })
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is invalid', async () => {
    mockValidateApiToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      makeReq(rpcCall(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {} }), {
        authorization: `Bearer ${TOKEN}`,
      })
    )
    expect(res.status).toBe(401)
  })

  it('write tool with read-only token surfaces an MCP scope error', async () => {
    setHappyAuth(['read'])
    const { POST } = await import('@/app/api/mcp/route')

    const res = await POST(
      makeReq(
        rpcCall(2, 'tools/call', {
          name: 'update_candidate_status',
          arguments: {
            candidateId: '00000000-0000-4000-8000-000000000001',
            status: 'shortlisted',
            confirmed: true,
          },
        }),
        { authorization: `Bearer ${TOKEN}` }
      )
    )
    // The route returns 200 with a JSON-RPC body; the tool error is in
    // the body under result.isError or error fields.
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toMatch(/insufficient_scope|scope/i)
    // updateCandidateStatus must NOT have been called
    expect(mockUpdateCandidateStatus).not.toHaveBeenCalled()
  })

  it('read tool happy path returns structured content for the calling tenant', async () => {
    setHappyAuth(['read'], TENANT_A)
    // withTenant mock returns canned rows for list_candidates
    mockWithTenantImpl.mockImplementation(async (tenantId: string) => {
      // Verify the route passed the right tenantId through to the DB layer
      expect(tenantId).toBe(TENANT_A)
      return [
        {
          id: '00000000-0000-4000-8000-000000000001',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          status: 'new',
          availabilityStatus: 'available',
          availableFrom: null,
          agencyId: null,
          agencyName: null,
          createdAt: new Date('2026-04-28T00:00:00Z'),
        },
      ]
    })

    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      makeReq(
        rpcCall(3, 'tools/call', {
          name: 'list_candidates',
          arguments: { limit: 10 },
        }),
        { authorization: `Bearer ${TOKEN}` }
      )
    )

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Ada')
    expect(text).toContain('Lovelace')
    // checkRateLimit should have been called as a read
    expect(mockCheckRateLimit).toHaveBeenCalledWith(TENANT_A, TOKEN_ID, false)
  })

  it('write tool without confirmed: true is rejected before any action call', async () => {
    setHappyAuth(['write'])
    const { POST } = await import('@/app/api/mcp/route')

    const res = await POST(
      makeReq(
        rpcCall(4, 'tools/call', {
          name: 'update_candidate_status',
          arguments: {
            candidateId: '00000000-0000-4000-8000-000000000001',
            status: 'shortlisted',
            // confirmed intentionally omitted
          },
        }),
        { authorization: `Bearer ${TOKEN}` }
      )
    )

    expect(res.status).toBe(200)
    expect(mockUpdateCandidateStatus).not.toHaveBeenCalled()
  })

  it('write tool with confirmed: true delegates to the server action', async () => {
    setHappyAuth(['write'])
    mockUpdateCandidateStatus.mockResolvedValue(undefined)

    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      makeReq(
        rpcCall(5, 'tools/call', {
          name: 'update_candidate_status',
          arguments: {
            candidateId: '00000000-0000-4000-8000-000000000001',
            status: 'shortlisted',
            confirmed: true,
          },
        }),
        { authorization: `Bearer ${TOKEN}` }
      )
    )

    expect(res.status).toBe(200)
    expect(mockUpdateCandidateStatus).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      'shortlisted'
    )
    // checkRateLimit should be invoked as a write
    expect(mockCheckRateLimit).toHaveBeenCalledWith(TENANT_A, TOKEN_ID, true)
  })

  it('cross-tenant: token bound to tenant B propagates tenant B to withTenant, not tenant A', async () => {
    setHappyAuth(['read'], TENANT_B)
    const seenTenants: string[] = []
    mockWithTenantImpl.mockImplementation(async (tenantId: string) => {
      seenTenants.push(tenantId)
      return [] // no rows for tenant B in this fixture
    })

    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      makeReq(
        rpcCall(6, 'tools/call', {
          name: 'list_candidates',
          arguments: { limit: 10 },
        }),
        { authorization: `Bearer ${TOKEN}` }
      )
    )

    expect(res.status).toBe(200)
    expect(seenTenants).toEqual([TENANT_B])
    expect(seenTenants).not.toContain(TENANT_A)
  })

  it('returns 429 when rate-limit denies the request', async () => {
    mockValidateApiToken.mockResolvedValue({
      tenantId: TENANT_A,
      userId: USER_ID,
      scopes: ['read'],
      tokenId: TOKEN_ID,
    })
    mockUserRoleLookup.mockResolvedValue([{ role: 'recruiter' }])
    mockCheckRateLimit.mockResolvedValue({ ok: false, retryAfter: 30, limit: 'token' })

    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      makeReq(rpcCall(7, 'tools/list'), { authorization: `Bearer ${TOKEN}` })
    )

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })
})
