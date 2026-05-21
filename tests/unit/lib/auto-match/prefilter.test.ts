/**
 * Unit tests for src/lib/auto-match/prefilter.ts
 *
 * Covers prefilterCandidatesForRole — the pre-filter pipeline behind
 * auto-match (epic #267, issue #268). Sequence inside the action:
 *   1. withTenant → load role (select)
 *   2. generateEmbedding (mocked)
 *   3. withTenant → pgvector cosine top-N (execute)
 *   4. hasBeenRejectedByCustomer per candidate (mocked)
 *   5. Budget / rate-match annotation in JS
 *
 * Mocks isolate the action from drizzle / pgvector / rejection / embeddings
 * so each filter branch is testable in pure JS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROLE_ID      = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CUSTOMER_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function role(overrides: Partial<{
  customerId: string | null
  customerDayRate: string | null
  rateCurrency: string | null
}> = {}) {
  return {
    id: ROLE_ID,
    title: 'Senior Engineer',
    description: 'Build distributed systems.',
    requirements: 'TypeScript, Node.js, distributed systems experience',
    customerId: CUSTOMER_ID,
    customerDayRate: '500',
    rateCurrency: 'GBP',
    ...overrides,
  }
}

function vectorRow(id: string, overrides: Partial<{
  availability_status: 'available' | 'on_project' | 'unavailable'
  available_from: string | null
  candidate_rate: string | null
  rate_currency: string | null
  similarity: number
}> = {}) {
  return {
    id,
    availability_status: 'available' as const,
    available_from: null,
    candidate_rate: '450',
    rate_currency: 'GBP',
    similarity: 0.85,
    ...overrides,
  }
}

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then    = resolved.then.bind(resolved)
  c.catch   = resolved.catch.bind(resolved)
  c.from    = vi.fn(() => c)
  c.where   = vi.fn(() => c)
  c.limit   = vi.fn(() => Promise.resolve(rows))
  return c
}

// Per-test state
let withTenantSelectQueue: unknown[][] = []
let withTenantSelectCallCount = 0
let executeResult: unknown[] = []

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const rows = withTenantSelectQueue[withTenantSelectCallCount] ?? []
      withTenantSelectCallCount++
      const tx = {
        select:  vi.fn(() => makeSelectChain(rows)),
        execute: vi.fn(() => Promise.resolve(executeResult)),
      }
      return fn(tx)
    },
  ),
}))

vi.mock('@/db/schema', () => ({
  roles: {
    id: 'id', tenantId: 'tenant_id', title: 'title', description: 'description',
    requirements: 'requirements', customerId: 'customer_id',
    customerDayRate: 'customer_day_rate', rateCurrency: 'rate_currency',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}))

const mockGenerateEmbedding = vi.fn()
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}))

const mockHasBeenRejected = vi.fn()
vi.mock('@/lib/auto-match/rejection', () => ({
  hasBeenRejectedByCustomer: (...args: unknown[]) => mockHasBeenRejected(...args),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('prefilterCandidatesForRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantSelectQueue = []
    withTenantSelectCallCount = 0
    executeResult = []
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    mockHasBeenRejected.mockResolvedValue(false)
  })

  it('returns [] when role is not found', async () => {
    withTenantSelectQueue = [[]] // role lookup returns nothing
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result).toEqual([])
    expect(mockGenerateEmbedding).not.toHaveBeenCalled()
  })

  it('returns [] when generateEmbedding returns null', async () => {
    withTenantSelectQueue = [[role()]]
    mockGenerateEmbedding.mockResolvedValue(null)
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result).toEqual([])
  })

  it('returns [] when pgvector finds no candidates', async () => {
    withTenantSelectQueue = [[role()], []] // role, then pgvector withTenant
    executeResult = []
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result).toEqual([])
  })

  it('filters out rejected candidates', async () => {
    withTenantSelectQueue = [[role()], []]
    executeResult = [
      vectorRow('cand-1'),
      vectorRow('cand-2'),
      vectorRow('cand-3'),
    ]
    // cand-2 is rejected by this customer
    mockHasBeenRejected.mockImplementation((candidateId: string) =>
      Promise.resolve(candidateId === 'cand-2'),
    )
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result.map((r) => r.candidateId)).toEqual(['cand-1', 'cand-3'])
  })

  it('skips rejection check when role has no customerId', async () => {
    withTenantSelectQueue = [[role({ customerId: null })], []]
    executeResult = [vectorRow('cand-1')]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result).toHaveLength(1)
    expect(mockHasBeenRejected).not.toHaveBeenCalled()
  })

  it('annotates rateMatch=within when candidate is at or under budget', async () => {
    withTenantSelectQueue = [[role()], []] // budget 500 GBP
    executeResult = [vectorRow('cand-1', { candidate_rate: '450', rate_currency: 'GBP' })]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].rateMatch).toBe('within')
    expect(result[0].rateOveragePercent).toBeNull()
  })

  it('annotates rateMatch=over with overage percent when over budget but within 25%', async () => {
    withTenantSelectQueue = [[role()], []] // budget 500 GBP
    executeResult = [vectorRow('cand-1', { candidate_rate: '550', rate_currency: 'GBP' })]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].rateMatch).toBe('over')
    expect(result[0].rateOveragePercent).toBe(10) // (550-500)/500 = 10%
  })

  it('excludes candidates more than 25% over budget', async () => {
    withTenantSelectQueue = [[role()], []] // budget 500 GBP
    executeResult = [
      vectorRow('within',  { candidate_rate: '450', rate_currency: 'GBP' }),
      vectorRow('barely',  { candidate_rate: '625', rate_currency: 'GBP' }), // exactly 25% over → allowed
      vectorRow('overcap', { candidate_rate: '626', rate_currency: 'GBP' }), // 25.2% over → excluded
    ]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result.map((r) => r.candidateId)).toEqual(['within', 'barely'])
  })

  it('annotates rateMatch=currency_mismatch when currencies differ', async () => {
    withTenantSelectQueue = [[role()], []] // budget GBP
    executeResult = [vectorRow('cand-1', { candidate_rate: '550', rate_currency: 'EUR' })]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].rateMatch).toBe('currency_mismatch')
    expect(result[0].rateOveragePercent).toBeNull()
  })

  it('annotates rateMatch=unknown when role has no budget', async () => {
    withTenantSelectQueue = [[role({ customerDayRate: null, rateCurrency: null })], []]
    executeResult = [vectorRow('cand-1')]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].rateMatch).toBe('unknown')
  })

  it('annotates rateMatch=unknown when candidate has no rate', async () => {
    withTenantSelectQueue = [[role()], []]
    executeResult = [vectorRow('cand-1', { candidate_rate: null, rate_currency: null })]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].rateMatch).toBe('unknown')
  })

  it('returns on_project availability with availableFrom for on_project candidates', async () => {
    withTenantSelectQueue = [[role()], []]
    executeResult = [
      vectorRow('cand-1', { availability_status: 'on_project', available_from: '2026-06-15' }),
    ]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].availability).toEqual({
      status: 'on_project',
      availableFrom: '2026-06-15',
    })
  })

  it('returns flat available status for available candidates', async () => {
    withTenantSelectQueue = [[role()], []]
    executeResult = [vectorRow('cand-1', { availability_status: 'available' })]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].availability).toEqual({ status: 'available' })
  })

  it('caps results at 20 even if pgvector returns 30', async () => {
    withTenantSelectQueue = [[role()], []]
    executeResult = Array.from({ length: 30 }, (_, i) => vectorRow(`cand-${i}`))
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result).toHaveLength(20)
  })

  it('rounds similarity to integer percent', async () => {
    withTenantSelectQueue = [[role()], []]
    executeResult = [vectorRow('cand-1', { similarity: 0.876 })]
    const { prefilterCandidatesForRole } = await import('@/lib/auto-match/prefilter')

    const result = await prefilterCandidatesForRole({ roleId: ROLE_ID, tenantId: TENANT_ID })

    expect(result[0].similarity).toBe(88) // Math.round(0.876 * 100)
  })
})
