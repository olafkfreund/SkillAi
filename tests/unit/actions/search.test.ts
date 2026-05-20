/**
 * Unit tests for src/actions/search.ts
 *
 * Covers:
 *   searchGlobal — unauthenticated / role-gated degradation (returns EMPTY),
 *     short-query guard, happy path (all four entity types populated),
 *     no-results case, viewer silently returns empty.
 *
 * Mocks:
 *   @/db                      — withTenant (tx with joinable select chain)
 *   @/db/schema                — candidates, roles, customers, agencies stubs
 *   drizzle-orm               — eq / and / or / ilike / desc pass-throughs
 *   @/lib/auth/action-context  — getActionContext
 *
 * Note: searchGlobal uses Promise.all with four parallel tx.select() chains.
 * The mock returns all four via a per-call queue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── Fixture rows ──────────────────────────────────────────────────────────────

const CANDIDATE_ROWS = [
  { id: 'c1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', agencyName: 'Acme Staffing' },
]
const ROLE_ROWS = [
  { id: 'r1', title: 'Senior TypeScript Engineer', customerRoleId: 'ENG-001', customerName: 'ClientCo' },
]
const CUSTOMER_ROWS = [
  { id: 'cu1', name: 'ClientCo Ltd' },
]
const AGENCY_ROWS = [
  { id: 'ag1', name: 'Acme Staffing', isInternal: false },
]

// ── Mock builder ──────────────────────────────────────────────────────────────

/**
 * Builds a thenable select-chain that supports the full
 * .select().from().leftJoin().where().orderBy().limit() call chain.
 * All chainable methods return `this`; limit returns a resolved promise.
 */
function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then      = resolved.then.bind(resolved)
  c.catch     = resolved.catch.bind(resolved)
  c.from      = vi.fn(() => c)
  c.leftJoin  = vi.fn(() => c)
  c.innerJoin = vi.fn(() => c)
  c.where     = vi.fn(() => c)
  c.orderBy   = vi.fn(() => c)
  c.limit     = vi.fn(() => Promise.resolve(rows))
  return c
}

// ── Per-test state ────────────────────────────────────────────────────────────

// Queue of result sets to return in order — one per tx.select() call.
// searchGlobal calls Promise.all([...4 queries...]); each select() pop from the front.
let selectQueue: unknown[][] = []
let selectCallCount = 0

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => {
          const rows = selectQueue[selectCallCount] ?? []
          selectCallCount++
          return makeSelectChain(rows)
        }),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  candidates: {
    id: 'id', firstName: 'first_name', lastName: 'last_name',
    email: 'email', agencyId: 'agency_id', isActive: 'is_active',
    createdAt: 'created_at',
  },
  roles: {
    id: 'id', title: 'title', customerRoleId: 'customer_role_id',
    customerId: 'customer_id', isActive: 'is_active', createdAt: 'created_at',
  },
  customers: {
    id: 'id', name: 'name', isActive: 'is_active', createdAt: 'created_at',
  },
  agencies: {
    id: 'id', name: 'name', isInternal: 'is_internal',
    isActive: 'is_active', createdAt: 'created_at',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:    vi.fn(() => ({ type: 'eq' })),
  and:   vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  or:    vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  ilike: vi.fn(() => ({ type: 'ilike' })),
  desc:  vi.fn(() => ({ type: 'desc' })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

const EMPTY = { candidates: [], roles: [], customers: [], agencies: [] }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('searchGlobal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectQueue = []
    selectCallCount = 0
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  // ── Auth + role degradation ───────────────────────────────────────────────

  it('returns empty when unauthenticated (no context)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('Jane')

    expect(result).toEqual(EMPTY)
  })

  it('returns empty when role is viewer (below recruiter threshold)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const,
    })
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('Jane')

    expect(result).toEqual(EMPTY)
  })

  it('returns empty when role is hiring_manager (below recruiter threshold)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'hiring_manager' as const,
    })
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('Jane')

    expect(result).toEqual(EMPTY)
  })

  // ── Short query guard ─────────────────────────────────────────────────────

  it('returns empty for empty string (< 2 chars)', async () => {
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('')

    expect(result).toEqual(EMPTY)
  })

  it('returns empty for single-character query', async () => {
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('J')

    expect(result).toEqual(EMPTY)
  })

  it('returns empty for whitespace-only query that trims to < 2 chars', async () => {
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('  ')

    expect(result).toEqual(EMPTY)
  })

  // ── No-results case ───────────────────────────────────────────────────────

  it('returns all-empty arrays when no DB rows match', async () => {
    // All four select() calls return []
    selectQueue = [[], [], [], []]
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('xyz-no-match')

    expect(result).toEqual(EMPTY)
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns candidate, role, customer, agency hits with correct kind tags', async () => {
    selectQueue = [CANDIDATE_ROWS, ROLE_ROWS, CUSTOMER_ROWS, AGENCY_ROWS]
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('Jane')

    // Candidates
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      kind: 'candidate',
      id: 'c1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      agencyName: 'Acme Staffing',
    })

    // Roles
    expect(result.roles).toHaveLength(1)
    expect(result.roles[0]).toMatchObject({
      kind: 'role',
      id: 'r1',
      title: 'Senior TypeScript Engineer',
      customerName: 'ClientCo',
      customerRoleId: 'ENG-001',
    })

    // Customers
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0]).toMatchObject({
      kind: 'customer',
      id: 'cu1',
      name: 'ClientCo Ltd',
    })

    // Agencies
    expect(result.agencies).toHaveLength(1)
    expect(result.agencies[0]).toMatchObject({
      kind: 'agency',
      id: 'ag1',
      name: 'Acme Staffing',
      isInternal: false,
    })
  })

  it('coerces null agencyName to null in candidate hit', async () => {
    selectQueue = [
      [{ id: 'c2', firstName: 'Bob', lastName: 'Smith', email: null, agencyName: undefined }],
      [], [], [],
    ]
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('Bob')

    expect(result.candidates[0].agencyName).toBeNull()
    expect(result.candidates[0].email).toBeNull()
  })

  it('succeeds for admin role', async () => {
    selectQueue = [[], [], [], []]
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'admin' as const,
    })
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('query')

    expect(result).toEqual(EMPTY)
  })

  it('accepts exactly 2-character query (boundary)', async () => {
    selectQueue = [[], [], [], []]
    const { searchGlobal } = await import('@/actions/search')

    const result = await searchGlobal('Jo')

    expect(result).toEqual(EMPTY)
  })
})
