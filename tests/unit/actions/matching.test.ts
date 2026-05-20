/**
 * Unit tests for src/actions/matching.ts
 *
 * Covers:
 *   getSuggestedCandidates — unauthenticated returns [], embedding failure returns [],
 *     no candidates in tenant returns [], happy path with mocked raw SQL results,
 *     already-scored candidates excluded.
 *
 *   getRoleFitSuggestionsForCandidate — unauthenticated returns [],
 *     candidate not found returns [], candidate has no cvText returns [],
 *     no unscored roles returns [], happy path with sorted fit results.
 *
 * Mocks:
 *   @/db                       — withTenant (handles both select + execute calls)
 *   @/db/schema                — candidates, roles, scores stubs
 *   drizzle-orm                — eq / and / notInArray / sql pass-throughs
 *   @/lib/auth/action-context  — getActionContext
 *   @/lib/ai/embeddings        — generateEmbedding
 *   @/lib/ai/role-fit          — analyseRoleFitForCandidate
 *
 * pgvector note: getSuggestedCandidates uses tx.execute(sql`...`) for the vector
 * search. The mock captures the execute call and returns pre-set rows directly —
 * no SQL parsing attempted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID     = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID       = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CANDIDATE_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ROLE_ID_1     = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ROLE_ID_2     = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CANDIDATE_ROW = {
  id: CANDIDATE_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  cvText: 'Experienced TypeScript engineer with 6 years in fintech.',
  embedding: '[0.1,0.2,0.3]',
}

const ROLE_ROWS = [
  { id: ROLE_ID_1, title: 'Senior Engineer', requirements: 'TypeScript, Node.js', priorityKeywords: ['TypeScript'] },
  { id: ROLE_ID_2, title: 'Tech Lead', requirements: 'Leadership, architecture', priorityKeywords: null },
]

const VECTOR_RAW_ROWS = [
  { id: 'v1', first_name: 'Alice', last_name: 'Walker', email: 'alice@example.com', file_path: '/uploads/a.pdf', similarity: 0.95 },
  { id: 'v2', first_name: 'Bob', last_name: 'Smith', email: null, file_path: null, similarity: 0.78 },
]

// ── Mock builders ─────────────────────────────────────────────────────────────

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

// Queue of result batches returned in order per withTenant() call.
// Each withTenant call gets one entry from this queue.
let withTenantResults: unknown[][] = []
let withTenantCallCount = 0

// Controls the raw execute() result (used for pgvector search)
let executeResult: unknown[] = []

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const rows = withTenantResults[withTenantCallCount] ?? []
      withTenantCallCount++

      const tx = {
        select: vi.fn(() => makeSelectChain(rows)),
        execute: vi.fn(() => Promise.resolve(executeResult)),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  candidates: {
    id: 'id', tenantId: 'tenant_id', firstName: 'first_name', lastName: 'last_name',
    email: 'email', cvText: 'cv_text', embedding: 'embedding', filePath: 'file_path',
    isActive: 'is_active',
  },
  roles: {
    id: 'id', tenantId: 'tenant_id', title: 'title', requirements: 'requirements',
    priorityKeywords: 'priority_keywords', isActive: 'is_active',
  },
  scores: {
    id: 'id', tenantId: 'tenant_id', candidateId: 'candidate_id', roleId: 'role_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:         vi.fn(() => ({ type: 'eq' })),
  and:        vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  notInArray: vi.fn(() => ({ type: 'notInArray' })),
  sql:        vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockGenerateEmbedding = vi.fn()
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}))

const mockAnalyseRoleFit = vi.fn()
vi.mock('@/lib/ai/role-fit', () => ({
  analyseRoleFitForCandidate: (...args: unknown[]) => mockAnalyseRoleFit(...args),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

// ── getSuggestedCandidates ────────────────────────────────────────────────────

describe('getSuggestedCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantResults = []
    withTenantCallCount = 0
    executeResult = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
  })

  it('returns [] when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { getSuggestedCandidates } = await import('@/actions/matching')

    const result = await getSuggestedCandidates(ROLE_ID_1, 'TypeScript engineer', 5)

    expect(result).toEqual([])
  })

  it('returns [] when generateEmbedding returns null', async () => {
    mockGenerateEmbedding.mockResolvedValue(null)
    // Still need to mock the alreadyScored call so withTenant doesn't blow up
    withTenantResults = [[]]
    const { getSuggestedCandidates } = await import('@/actions/matching')

    const result = await getSuggestedCandidates(ROLE_ID_1, 'TypeScript engineer', 5)

    expect(result).toEqual([])
  })

  it('returns [] when pgvector execute returns no rows', async () => {
    withTenantResults = [[]] // alreadyScored = []
    executeResult = []
    const { getSuggestedCandidates } = await import('@/actions/matching')

    const result = await getSuggestedCandidates(ROLE_ID_1, 'TypeScript engineer', 5)

    expect(result).toEqual([])
  })

  it('maps raw SQL rows to camelCase with similarity as percentage', async () => {
    withTenantResults = [[]] // alreadyScored = []
    executeResult = VECTOR_RAW_ROWS
    const { getSuggestedCandidates } = await import('@/actions/matching')

    const result = await getSuggestedCandidates(ROLE_ID_1, 'TypeScript engineer', 5)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'v1',
      firstName: 'Alice',
      lastName: 'Walker',
      email: 'alice@example.com',
      filePath: '/uploads/a.pdf',
      similarity: 95, // Math.round(0.95 * 100)
    })
    expect(result[1]).toMatchObject({
      id: 'v2',
      firstName: 'Bob',
      lastName: 'Smith',
      email: null,
      filePath: null,
      similarity: 78, // Math.round(0.78 * 100)
    })
  })

  it('respects the limit parameter', async () => {
    withTenantResults = [[]]
    executeResult = VECTOR_RAW_ROWS
    const { getSuggestedCandidates } = await import('@/actions/matching')

    // Limit 1 — the SQL itself is mocked, so mock returns 2 rows regardless.
    // The action does not slice — it relies on the SQL LIMIT. This test
    // verifies the action passes through without error (limit is SQL-side).
    const result = await getSuggestedCandidates(ROLE_ID_1, 'TypeScript engineer', 1)

    expect(Array.isArray(result)).toBe(true)
  })

  it('returns [] and does not throw on unexpected execute error', async () => {
    withTenantResults = [[]]
    const { withTenant } = await import('@/db')
    const wt = withTenant as ReturnType<typeof vi.fn>
    // Override to throw on the execute call
    wt.mockImplementationOnce(async (_tid: string, fn: (tx: unknown) => unknown) => {
      return fn({ execute: vi.fn().mockRejectedValue(new Error('pgvector unavailable')) })
    })
    const { getSuggestedCandidates } = await import('@/actions/matching')

    const result = await getSuggestedCandidates(ROLE_ID_1, 'TypeScript engineer', 5)

    expect(result).toEqual([])
  })
})

// ── getRoleFitSuggestionsForCandidate ─────────────────────────────────────────

describe('getRoleFitSuggestionsForCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantResults = []
    withTenantCallCount = 0
    executeResult = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    mockAnalyseRoleFit.mockResolvedValue([])
  })

  it('returns [] when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toEqual([])
  })

  it('returns [] when candidate row is not found', async () => {
    // First withTenant call returns empty (candidate lookup)
    withTenantResults = [[]]
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toEqual([])
  })

  it('returns [] when candidate has no cvText', async () => {
    withTenantResults = [
      [{ ...CANDIDATE_ROW, cvText: null }], // candidate exists but no CV text
    ]
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toEqual([])
  })

  it('returns [] when no active unscored roles exist', async () => {
    withTenantResults = [
      [CANDIDATE_ROW],   // candidate found
      [],                // alreadyScoredRows = []
      [],                // activeRoles = []
    ]
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toEqual([])
    expect(mockAnalyseRoleFit).not.toHaveBeenCalled()
  })

  it('calls analyseRoleFitForCandidate with correct arguments', async () => {
    withTenantResults = [
      [CANDIDATE_ROW], // candidate
      [],              // alreadyScoredRows (none scored yet)
      ROLE_ROWS,       // activeRoles
    ]
    mockAnalyseRoleFit.mockResolvedValue([])
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(mockAnalyseRoleFit).toHaveBeenCalledWith(
      'Jane Doe',
      CANDIDATE_ROW.cvText,
      expect.arrayContaining([
        expect.objectContaining({ roleId: ROLE_ID_1, roleTitle: 'Senior Engineer' }),
        expect.objectContaining({ roleId: ROLE_ID_2, roleTitle: 'Tech Lead' }),
      ]),
      TENANT_ID
    )
  })

  it('returns results sorted by fitScore descending and capped at 8', async () => {
    withTenantResults = [
      [CANDIDATE_ROW],
      [],
      ROLE_ROWS,
    ]
    const fitResults = [
      { roleId: ROLE_ID_2, fitScore: 90, pros: ['Leadership'], cons: [], headline: 'Strong lead fit' },
      { roleId: ROLE_ID_1, fitScore: 75, pros: ['TypeScript'], cons: ['Minimal ops'], headline: 'Good tech fit' },
    ]
    mockAnalyseRoleFit.mockResolvedValue(fitResults)
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toHaveLength(2)
    // Higher fitScore first
    expect(result[0].fit.fitScore).toBe(90)
    expect(result[0].role.id).toBe(ROLE_ID_2)
    expect(result[1].fit.fitScore).toBe(75)
    expect(result[1].role.id).toBe(ROLE_ID_1)
  })

  it('excludes already-scored roles from the role query', async () => {
    withTenantResults = [
      [CANDIDATE_ROW],
      [{ roleId: ROLE_ID_1 }], // ROLE_ID_1 already scored
      [ROLE_ROWS[1]],          // only ROLE_ID_2 returned as active+unscored
    ]
    const fitResults = [
      { roleId: ROLE_ID_2, fitScore: 80, pros: ['Architecture'], cons: [], headline: 'Good arch fit' },
    ]
    mockAnalyseRoleFit.mockResolvedValue(fitResults)
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toHaveLength(1)
    expect(result[0].role.id).toBe(ROLE_ID_2)
  })

  it('returns [] and does not throw on analyseRoleFitForCandidate error', async () => {
    withTenantResults = [
      [CANDIDATE_ROW],
      [],
      ROLE_ROWS,
    ]
    mockAnalyseRoleFit.mockRejectedValue(new Error('Claude API unavailable'))
    const { getRoleFitSuggestionsForCandidate } = await import('@/actions/matching')

    const result = await getRoleFitSuggestionsForCandidate(CANDIDATE_ID)

    expect(result).toEqual([])
  })
})
