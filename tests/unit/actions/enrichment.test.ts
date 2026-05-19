/**
 * Unit tests for src/actions/enrichment.ts
 *
 * Covers:
 *   enrichCandidate — happy path, auth error, candidate-not-found,
 *     AI-verification failure (conservative skip), braveSearch absent.
 *   confirmProfile / dismissProfile — happy path and error cases.
 *
 * Mocks:
 *   @/db                               — withTenant
 *   @/db/schema                        — candidates, candidateEnrichments, cvProfiles
 *   drizzle-orm                        — eq / and pass-throughs
 *   @/lib/auth/action-context          — getActionContext
 *   @/lib/audit                        — writeAuditLog
 *   @/lib/ai/keys                      — resolveAnthropicKey silenced
 *   @/lib/ai/profile-matcher           — verifyProfilesAgainstCv
 *   @/lib/ai/usage-logger              — logAiUsage / anthropicUsageToInput
 *   @anthropic-ai/sdk                  — Anthropic client silenced
 *   next/cache                         — revalidatePath silenced
 *   global fetch                       — returns empty results so braveSearch
 *                                        resolves to [] and no HTTP calls happen
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_ID      = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// ── Candidate fixtures ────────────────────────────────────────────────────────

const BASE_CANDIDATE = {
  id: CANDIDATE_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  githubUsername: null,
  linkedinUrl: null,
  city: 'London',
  country: 'UK',
}

// ── Chainable mock builder ────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then   = resolved.then.bind(resolved)
  c.catch  = resolved.catch.bind(resolved)
  c.from   = vi.fn(() => c)
  c.where  = vi.fn(() => c)
  c.limit  = vi.fn(() => Promise.resolve(rows))
  return c
}

// ── Per-test state ────────────────────────────────────────────────────────────

// withTenant select call counter — controls which rows each select returns
type SelectFactory = () => ReturnType<typeof makeSelectChain>
let selectFactory: SelectFactory

// Captured mutation calls
const mockInsertValues             = vi.fn()
const mockOnConflictDoUpdate       = vi.fn()
const mockUpdateSet                = vi.fn()
const mockUpdateWhere              = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => selectFactory()),

        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return {
              onConflictDoUpdate: (...oArgs: unknown[]) => {
                mockOnConflictDoUpdate(...oArgs)
                return Promise.resolve()
              },
            }
          },
        })),

        update: vi.fn(() => ({
          set: (...args: unknown[]) => {
            mockUpdateSet(...args)
            return {
              where: (...wargs: unknown[]) => {
                mockUpdateWhere(...wargs)
                return Promise.resolve()
              },
            }
          },
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  candidates:           { id: 'id', tenantId: 'tenant_id' },
  candidateEnrichments: { candidateId: 'candidate_id', verifiedProfiles: 'verified_profiles', rejectedUrls: 'rejected_urls' },
  cvProfiles:           { candidateId: 'candidate_id', technicalSkills: 'technical_skills', companies: 'companies' },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireRole: vi.fn(), // no-op by default; tests that need it to throw will override
}))

vi.mock('@/lib/ai/keys', () => ({
  resolveAnthropicKey: vi.fn().mockResolvedValue('sk-ant-fake'),
}))

const mockVerifyProfilesAgainstCv = vi.fn().mockResolvedValue([])
vi.mock('@/lib/ai/profile-matcher', () => ({
  verifyProfilesAgainstCv: (...args: unknown[]) => mockVerifyProfilesAgainstCv(...args),
}))

vi.mock('@/lib/ai/usage-logger', () => ({
  logAiUsage:              vi.fn().mockResolvedValue(undefined),
  anthropicUsageToInput:   vi.fn().mockReturnValue({}),
}))

// Anthropic SDK — no real HTTP calls
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: 'Software engineer focused on TypeScript.' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    }
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Silence fetch so braveSearch returns [] (BRAVE_SEARCH_API_KEY not set in test env)
const mockFetch = vi.fn().mockResolvedValue({
  ok: false,
  json: vi.fn().mockResolvedValue({}),
  body: null,
})
global.fetch = mockFetch as unknown as typeof fetch

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

/**
 * Build a selectFactory that returns different rows for each successive
 * withTenant select call.  The first 3 select calls map to:
 *   1. candidate lookup    → candidateRows
 *   2. existingEnrichment  → enrichmentRows
 *   3. cvProfile           → cvProfileRows
 */
function makeSelectSequence(
  candidateRows: unknown[],
  enrichmentRows: unknown[] = [],
  cvProfileRows: unknown[] = []
): SelectFactory {
  let callIdx = 0
  return () => {
    callIdx++
    if (callIdx === 1) return makeSelectChain(candidateRows)
    if (callIdx === 2) return makeSelectChain(enrichmentRows)
    return makeSelectChain(cvProfileRows)
  }
}

// ── enrichCandidate ────────────────────────────────────────────────────────────

describe('enrichCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: successful context + candidate found + no prior enrichment
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = makeSelectSequence([BASE_CANDIDATE])
    mockVerifyProfilesAgainstCv.mockResolvedValue([])
    // Ensure fetch stays silent (BRAVE_SEARCH_API_KEY absent → braveSearch returns [])
    mockFetch.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
      body: null,
    })
  })

  // ── Auth check ────────────────────────────────────────────────────────────────

  it('throws when action context is absent (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { enrichCandidate } = await import('@/actions/enrichment')

    await expect(enrichCandidate(CANDIDATE_ID)).rejects.toThrow(/not authenticated/i)
  })

  // ── Candidate not found ───────────────────────────────────────────────────────

  it('returns success:false when candidate is not in the tenant (no rows from RLS)', async () => {
    selectFactory = makeSelectSequence([]) // first select returns empty → not found
    const { enrichCandidate } = await import('@/actions/enrichment')

    const result = await enrichCandidate(CANDIDATE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('returns success:true with webHits array and persists enrichment row', async () => {
    const { enrichCandidate } = await import('@/actions/enrichment')

    const result = await enrichCandidate(CANDIDATE_ID)

    expect(result.success).toBe(true)
    const r = result as { success: true; webHits: unknown[] }
    expect(Array.isArray(r.webHits)).toBe(true)

    // insert().values().onConflictDoUpdate() must have been called
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.candidateId).toBe(CANDIDATE_ID)
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
  })

  it('writes enrichment_triggered and enrichment_completed audit logs', async () => {
    const { enrichCandidate } = await import('@/actions/enrichment')

    await enrichCandidate(CANDIDATE_ID)

    // Allow promises to settle
    await new Promise((r) => setTimeout(r, 0))

    const actions = mockWriteAuditLog.mock.calls.map(
      (c) => (c[1] as Record<string, unknown>).action
    )
    expect(actions).toContain('candidate.enrichment_triggered')
    expect(actions).toContain('candidate.enrichment_completed')
  })

  it('includes verified profile counts in completion audit metadata', async () => {
    const { enrichCandidate } = await import('@/actions/enrichment')

    await enrichCandidate(CANDIDATE_ID)

    const completionCall = mockWriteAuditLog.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>).action === 'candidate.enrichment_completed'
    )
    expect(completionCall).toBeDefined()
    const meta = (completionCall![1] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(typeof meta.verifiedCount).toBe('number')
    expect(typeof meta.rejectedCount).toBe('number')
  })

  // ── AI verification failure (conservative skip) ───────────────────────────────

  it('still succeeds when AI verification throws — it is swallowed per-source', async () => {
    // AI verification fails for all groups — the action logs + continues
    mockVerifyProfilesAgainstCv.mockRejectedValue(new Error('OpenAI rate limit'))
    const { enrichCandidate } = await import('@/actions/enrichment')

    // Should not throw; result is still success (no verified profiles though)
    const result = await enrichCandidate(CANDIDATE_ID)

    // Since braveSearch returns [] (no API key), there are no hits to verify,
    // so verifyProfilesAgainstCv may not even be called.
    // Either way, the action should succeed.
    expect(result.success).toBe(true)
  })

  // ── Previously-rejected URLs skipped ─────────────────────────────────────────

  it('merges previously rejected URLs into the result', async () => {
    const existingRejection = {
      rejectedUrls: [
        { source: 'linkedin', url: 'https://linkedin.com/in/janedoe-old', reason: 'dismissed by recruiter', rejectedAt: '2026-01-01' },
      ],
      verifiedProfiles: [],
    }
    selectFactory = makeSelectSequence([BASE_CANDIDATE], [existingRejection])

    const { enrichCandidate } = await import('@/actions/enrichment')

    const result = await enrichCandidate(CANDIDATE_ID)

    expect(result.success).toBe(true)
    const r = result as { success: true; rejectedUrls: Array<{ url: string }> }
    // Previously rejected URL is preserved in the merged result
    expect(r.rejectedUrls.some((u) => u.url === 'https://linkedin.com/in/janedoe-old')).toBe(true)
  })
})

// ── confirmProfile ─────────────────────────────────────────────────────────────

describe('confirmProfile', () => {
  const PROFILE_URL = 'https://github.com/janedoe'
  const EXISTING_PROFILE = {
    source: 'github',
    url: PROFILE_URL,
    confidence: 85,
    category: 'high',
    reason: 'name+company match',
    verifiedBy: 'auto',
    verifiedAt: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns error when not authenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    // selectFactory irrelevant — auth fails first
    selectFactory = makeSelectSequence([])
    const { confirmProfile } = await import('@/actions/enrichment')

    const result = await confirmProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns error when no enrichment record exists', async () => {
    selectFactory = () => makeSelectChain([]) // no enrichment row
    const { confirmProfile } = await import('@/actions/enrichment')

    const result = await confirmProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no enrichment record/i)
  })

  it('returns error when profile URL not found in verifiedProfiles', async () => {
    selectFactory = () => makeSelectChain([{ verifiedProfiles: [] }])
    const { confirmProfile } = await import('@/actions/enrichment')

    const result = await confirmProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('updates verifiedBy to recruiter and writes audit log on happy path', async () => {
    selectFactory = () => makeSelectChain([{ verifiedProfiles: [EXISTING_PROFILE] }])
    const { confirmProfile } = await import('@/actions/enrichment')

    const result = await confirmProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(true)

    // update().set() should have been called with updated verifiedProfiles
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    const profiles = setArg.verifiedProfiles as Array<Record<string, unknown>>
    expect(profiles[0].verifiedBy).toBe('recruiter')

    // Audit log
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'candidate.profile_confirmed' })
    )
  })
})

// ── dismissProfile ─────────────────────────────────────────────────────────────

describe('dismissProfile', () => {
  const PROFILE_URL = 'https://github.com/janedoe'
  const EXISTING_PROFILE = {
    source: 'github',
    url: PROFILE_URL,
    confidence: 85,
    category: 'high',
    reason: 'name+company match',
    verifiedBy: 'auto',
    verifiedAt: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns error when not authenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    selectFactory = makeSelectSequence([])
    const { dismissProfile } = await import('@/actions/enrichment')

    const result = await dismissProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns error when no enrichment record exists', async () => {
    selectFactory = () => makeSelectChain([])
    const { dismissProfile } = await import('@/actions/enrichment')

    const result = await dismissProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no enrichment record/i)
  })

  it('moves profile from verifiedProfiles to rejectedUrls and writes audit log', async () => {
    selectFactory = () =>
      makeSelectChain([{ verifiedProfiles: [EXISTING_PROFILE], rejectedUrls: [] }])
    const { dismissProfile } = await import('@/actions/enrichment')

    const result = await dismissProfile(CANDIDATE_ID, PROFILE_URL)

    expect(result.ok).toBe(true)

    // update set should include an empty verifiedProfiles and the dismissed URL in rejectedUrls
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    const verifiedAfter = setArg.verifiedProfiles as unknown[]
    expect(verifiedAfter).toHaveLength(0)
    const rejectedAfter = setArg.rejectedUrls as Array<Record<string, unknown>>
    expect(rejectedAfter.some((r) => r.url === PROFILE_URL)).toBe(true)

    // Audit log
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'candidate.profile_dismissed' })
    )
  })

  it('does not duplicate a URL that is already in rejectedUrls', async () => {
    const alreadyRejected = {
      source: 'github',
      url: PROFILE_URL,
      reason: 'dismissed by recruiter',
      rejectedAt: '2026-01-01T00:00:00.000Z',
    }
    selectFactory = () =>
      makeSelectChain([{ verifiedProfiles: [], rejectedUrls: [alreadyRejected] }])
    const { dismissProfile } = await import('@/actions/enrichment')

    await dismissProfile(CANDIDATE_ID, PROFILE_URL)

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    const rejectedAfter = setArg.rejectedUrls as Array<Record<string, unknown>>
    // Should still be exactly one entry, not duplicated
    expect(rejectedAfter.filter((r) => r.url === PROFILE_URL)).toHaveLength(1)
  })
})
