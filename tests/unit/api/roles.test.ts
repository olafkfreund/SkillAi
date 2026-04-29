/**
 * Unit tests for the roles REST API routes (issue #140 — customerRoleId).
 *
 * Covers:
 *   GET  /api/roles         — returns customerRoleId in role objects
 *   PATCH /api/roles/{id}   — accepts and forwards customerRoleId
 *   OpenAPI document        — includes customerRoleId in the roles schema
 *
 * Strategy:
 *   - Mock @/lib/api/auth-middleware (withApiAuth) as a transparent pass-through
 *     so the route handler body executes without real token validation.
 *   - Mock @/lib/auth (auth) for the session-based GET handler.
 *   - Mock @/actions/roles (createRole, updateRole) to avoid DB calls.
 *   - Mock @/db (withTenant) for the GET handler's direct DB call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// withApiAuth — transparent pass-through: calls the handler with a synthetic ctx
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const TOKEN_ID  = 'tttttttt-0000-0000-0000-000000000002'

vi.mock('@/lib/api/auth-middleware', () => ({
  withApiAuth: vi.fn(
    (_scope: string, handler: (req: Request, ctx: unknown) => Promise<Response>) =>
      (req: Request, ctx: unknown) =>
        handler(req, {
          ...(ctx as Record<string, unknown>),
          tenantId: TENANT_ID,
          userId: 'user-1',
          scopes: ['write'],
          tokenId: TOKEN_ID,
        }),
  ),
}))

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const mockCreateRole = vi.fn()
const mockUpdateRole = vi.fn()
vi.mock('@/actions/roles', () => ({
  createRole: (...args: unknown[]) => mockCreateRole(...args),
  updateRole:  (...args: unknown[]) => mockUpdateRole(...args),
}))

// DB mock — for the session-based GET which calls withTenant directly
const mockSelect = vi.fn()
vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect }),
  ),
}))

// Chainable Drizzle mock
function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = [
    'from', 'where', 'limit', 'offset', 'leftJoin', 'innerJoin',
    'orderBy', 'returning', 'values', 'set', 'onConflictDoNothing',
    'onConflictDoUpdate', 'groupBy',
  ]
  methods.forEach((method) => {
    m[method] = vi.fn().mockReturnValue(m)
  })
  ;(m as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(returnValue).then(resolve)
  return m
}

vi.mock('@/db/schema', () => ({
  roles: {
    id:             'id',
    title:          'title',
    description:    'description',
    requirements:   'requirements',
    customerRoleId: 'customer_role_id',
    isActive:       'is_active',
    createdAt:      'created_at',
    createdBy:      'created_by',
    tenantId:       'tenant_id',
  },
  users: {
    id:   'id',
    name: 'name',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:   vi.fn(() => ({ type: 'eq' })),
  and:  vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn(() => ({ type: 'desc' })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost/api/roles`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer skl_dev_testtoken' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makePatchRequest(roleId: string, body: unknown): Request {
  return new Request(`http://localhost/api/roles/${roleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer skl_dev_testtoken' },
    body: JSON.stringify(body),
  })
}

function makePatchCtx(roleId: string) {
  return { params: Promise.resolve({ roleId }) }
}

/** Minimal valid role body for create/update */
function validRoleBody(overrides: Record<string, unknown> = {}) {
  return {
    title:        'Backend Engineer',
    description:  'We need a backend engineer with strong skills.',
    requirements: 'TypeScript, 5 years experience.',
    ...overrides,
  }
}

// ── GET /api/roles — returns customerRoleId ───────────────────────────────────

describe('GET /api/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null)
    const { GET } = await import('@/app/api/roles/route')
    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('includes customerRoleId in each role object returned', async () => {
    mockAuth.mockResolvedValue({
      user: { tenantId: TENANT_ID },
      expires: '2099-01-01',
    })

    const mockRole = {
      id:             'role-uuid-0001',
      title:          'Platform Engineer',
      description:    'desc',
      requirements:   'req',
      customerRoleId: 'EXT-456',
      isActive:       true,
      createdAt:      new Date('2026-01-01T00:00:00Z'),
      createdByName:  'Alice',
    }
    mockSelect.mockReturnValueOnce(chainableMock([mockRole]))

    const { GET } = await import('@/app/api/roles/route')
    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(1)
    expect((body[0] as Record<string, unknown>).customerRoleId).toBe('EXT-456')
  })

  it('returns customerRoleId as null when not set on a role', async () => {
    mockAuth.mockResolvedValue({
      user: { tenantId: TENANT_ID },
      expires: '2099-01-01',
    })

    const mockRole = {
      id:             'role-uuid-0002',
      title:          'DevOps Lead',
      description:    'desc',
      requirements:   'req',
      customerRoleId: null,
      isActive:       true,
      createdAt:      new Date('2026-01-01T00:00:00Z'),
      createdByName:  'Bob',
    }
    mockSelect.mockReturnValueOnce(chainableMock([mockRole]))

    const { GET } = await import('@/app/api/roles/route')
    const res = await GET()

    const body = await res.json() as unknown[]
    expect((body[0] as Record<string, unknown>).customerRoleId).toBeNull()
  })
})

// ── PATCH /api/roles/{id} — forwards customerRoleId ──────────────────────────

describe('PATCH /api/roles/{roleId}', () => {
  const ROLE_ID = 'role-uuid-patch-0001'

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateRole.mockResolvedValue({ success: true })
  })

  it('accepts customerRoleId in body and calls updateRole with a FormData containing it', async () => {
    const { PATCH } = await import('@/app/api/roles/[roleId]/route')
    const req = makePatchRequest(ROLE_ID, validRoleBody({ customerRoleId: 'CUST-PATCH-01' }))

    const res = await PATCH(req, makePatchCtx(ROLE_ID))

    expect(res.status).toBe(200)
    expect(mockUpdateRole).toHaveBeenCalledTimes(1)

    // The third argument to updateRole() is a FormData object
    const callArgs = mockUpdateRole.mock.calls[0] as [string, null, FormData]
    const fd = callArgs[2]
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.get('customerRoleId')).toBe('CUST-PATCH-01')
  })

  it('passes roleId as first argument to updateRole', async () => {
    const { PATCH } = await import('@/app/api/roles/[roleId]/route')
    const req = makePatchRequest(ROLE_ID, validRoleBody({ customerRoleId: 'CUST-PATCH-02' }))

    await PATCH(req, makePatchCtx(ROLE_ID))

    expect(mockUpdateRole.mock.calls[0][0]).toBe(ROLE_ID)
  })

  it('returns 422 when customerRoleId exceeds 100 characters', async () => {
    const { PATCH } = await import('@/app/api/roles/[roleId]/route')
    const req = makePatchRequest(ROLE_ID, validRoleBody({ customerRoleId: 'X'.repeat(101) }))

    const res = await PATCH(req, makePatchCtx(ROLE_ID))

    expect(res.status).toBe(422)
    // updateRole should not have been called
    expect(mockUpdateRole).not.toHaveBeenCalled()
  })

  it('forwards null customerRoleId (omitted) to updateRole without the key in FormData', async () => {
    const { PATCH } = await import('@/app/api/roles/[roleId]/route')
    const body = validRoleBody() // no customerRoleId
    const req = makePatchRequest(ROLE_ID, body)

    const res = await PATCH(req, makePatchCtx(ROLE_ID))

    expect(res.status).toBe(200)
    const callArgs = mockUpdateRole.mock.calls[0] as [string, null, FormData]
    const fd = callArgs[2]
    // customerRoleId is only set when present in the parsed body
    // (route: `if (data.customerRoleId !== undefined) formData.set(...)`)
    // Since the key is omitted, it must not appear in FormData
    expect(fd.get('customerRoleId')).toBeNull()
  })

  it('returns 400 when updateRole returns success: false', async () => {
    mockUpdateRole.mockResolvedValue({ success: false, error: 'Role not found' })
    const { PATCH } = await import('@/app/api/roles/[roleId]/route')
    const req = makePatchRequest(ROLE_ID, validRoleBody())

    const res = await PATCH(req, makePatchCtx(ROLE_ID))

    expect(res.status).toBe(400)
  })
})

// ── OpenAPI document — customerRoleId in roles schema ────────────────────────
//
// The OpenAPI builder stores request body schemas under
// doc.components.schemas[schemaName] (not inline in the operation).
// The schemaName for POST /api/roles is:
//   POST__api_roles_body
// and for PATCH /api/roles/{roleId} is:
//   PATCH__api_roles__roleId__body
//
// z.toJSONSchema() (Zod 4) converts a ZodObject to
//   { type: 'object', properties: { field: {...}, ... }, ... }
// so we assert that the schema's properties contain 'customerRoleId'.

describe('OpenAPI document', () => {
  it('includes customerRoleId in the POST /api/roles request body schema', async () => {
    // Import route files so registerRoute() side-effects populate the registry
    await import('@/app/api/roles/route')
    const { getOpenApiDocument } = await import('@/lib/api/openapi')

    const doc = getOpenApiDocument() as {
      components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> }
    }

    const schemas = doc.components?.schemas ?? {}
    // Find any schema whose key contains 'POST' and 'roles' and 'body'
    const schemaKey = Object.keys(schemas).find(
      (k) => k.toUpperCase().includes('POST') && k.includes('roles') && k.includes('body')
    )
    expect(schemaKey).toBeDefined()

    const schema = schemas[schemaKey!]
    const properties = schema?.properties ?? {}
    expect(Object.keys(properties)).toContain('customerRoleId')
  })

  it('includes customerRoleId in the PATCH /api/roles/{roleId} request body schema', async () => {
    await import('@/app/api/roles/[roleId]/route')
    const { getOpenApiDocument } = await import('@/lib/api/openapi')

    const doc = getOpenApiDocument() as {
      components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> }
    }

    const schemas = doc.components?.schemas ?? {}
    // Find any schema whose key contains 'PATCH', 'roles', and 'body'
    const schemaKey = Object.keys(schemas).find(
      (k) => k.toUpperCase().includes('PATCH') && k.includes('roles') && k.includes('body')
    )
    expect(schemaKey).toBeDefined()

    const schema = schemas[schemaKey!]
    const properties = schema?.properties ?? {}
    expect(Object.keys(properties)).toContain('customerRoleId')
  })
})
