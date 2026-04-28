/**
 * Unit tests for src/actions/gdpr.ts — deleteCandidateForGdpr
 *
 * Mocks:
 *   - @/db (withTenant) — intercepts all DB calls
 *   - @/lib/auth/action-context (getActionContext) — provides synthetic context
 *   - @/lib/audit (writeAuditLog) — spied to verify tombstone write
 *   - @/lib/cv/store (deleteCvFile) — spied to verify file deletion
 *   - next/cache (revalidatePath) — silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-4ccc-accc-cccccccccccc'

const CANDIDATE_ROW = {
  id: CANDIDATE_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  filePath: '/uploads/tenant1/some-cv.pdf',
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// DB mocks — we capture individual operations so we can assert call order/args
const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) }
const mockUpdateChain = { set: vi.fn() }
const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) }
mockUpdateChain.set.mockReturnValue(mockSetChain)

/**
 * makeSelectChain — returns a Drizzle-compatible query builder mock.
 *
 * The chain supports:
 *   tx.select().from(t).where(w).limit(n) → Promise<rows>
 *   await tx.select().from(t).where(w)    → rows  (via PromiseLike.then)
 */
function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  // Make the chain itself a PromiseLike so direct `await` resolves to rows
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject)
  chain.catch = (reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).catch(reject)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(rows))
  return chain
}

let selectCallCount = 0
const mockTx = {
  select: vi.fn(() => {
    selectCallCount++
    // First select call: existence check → returns the candidate row
    if (selectCallCount === 1) return makeSelectChain([CANDIDATE_ROW])
    // Subsequent selects (packs, transcripts): return empty arrays so no child
    // deletes are attempted
    return makeSelectChain([])
  }),
  delete: vi.fn(() => mockDeleteChain),
  update: vi.fn(() => mockUpdateChain),
}

vi.mock('@/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
}))

vi.mock('@/db/schema', () => ({
  candidates: {},
  scores: {},
  notes: {},
  candidateEnrichments: {},
  cvProfiles: {},
  auditLogs: {},
  sentEmails: {},
  interviewPacks: {},
  interviewQuestions: {},
  codeChallenges: {},
  interviewSlots: {},
  interviewTranscripts: {},
  transcriptAnalyses: {},
  candidateRoleApprovals: {},
}))

// Drizzle eq/and — just pass through for our simple assertions
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: mockGetActionContext,
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

const mockDeleteCvFile = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/cv/store', () => ({
  deleteCvFile: mockDeleteCvFile,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminContext() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'admin' as const }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deleteCandidateForGdpr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0

    // Re-wire delete/update chains after clearAllMocks() resets them
    mockDeleteChain.where.mockResolvedValue(undefined)
    mockUpdateChain.set.mockReturnValue(mockSetChain)
    mockSetChain.where.mockResolvedValue(undefined)

    // Default: admin context
    mockGetActionContext.mockResolvedValue(adminContext())

    // Rebuild the select mock with a fresh counter closure
    let localCount = 0
    mockTx.select = vi.fn(() => {
      localCount++
      if (localCount === 1) return makeSelectChain([CANDIDATE_ROW])
      return makeSelectChain([])
    })
  })

  // ── Authorization checks ──────────────────────────────────────────────────

  it('returns error when no action context (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is recruiter (not admin)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'recruiter' as const,
    })
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when role is viewer (not admin)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── Input validation ──────────────────────────────────────────────────────

  it('returns error when candidateId is not a valid UUID', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: 'not-a-uuid',
      typedConfirmation: 'Jane Doe',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('UUID')
  })

  it('returns error when typedConfirmation is empty', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: '',
    })

    expect(result.ok).toBe(false)
  })

  // ── Confirmation name mismatch ────────────────────────────────────────────

  it('returns error when typed name does not match candidate name', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Wrong Name',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/confirmation name does not match/i)
  })

  it('returns error when typed name has wrong case (case-sensitive)', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'jane doe', // lowercase
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/confirmation name does not match/i)
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('succeeds when admin provides the exact candidate name', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(result.ok).toBe(true)
  })

  it('calls tx.delete for candidates (last delete in chain)', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    // tx.delete must have been called at least once (for candidates row)
    expect(mockTx.delete).toHaveBeenCalled()
  })

  it('calls tx.update(auditLogs) with redaction values', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    // tx.update should have been called with auditLogs-shaped table
    expect(mockTx.update).toHaveBeenCalled()

    // mockUpdateChain.set should have been called with redaction payload
    const setCall = mockUpdateChain.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(setCall).toBeDefined()
    expect(setCall?.entityLabel).toBe('[redacted-gdpr]')
    expect((setCall?.metadata as Record<string, unknown>)?.redacted_gdpr).toBe(true)
  })

  it('calls deleteCvFile with the candidate filePath', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(mockDeleteCvFile).toHaveBeenCalledWith(CANDIDATE_ROW.filePath)
  })

  it('writes a tombstone audit log entry with correct action', async () => {
    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    // writeAuditLog is fire-and-forget (.catch()), so it may be async;
    // we wait a tick to allow the promise to schedule
    await new Promise((r) => setTimeout(r, 0))

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'candidate.deleted_gdpr',
        entityType: 'candidate',
        entityId: CANDIDATE_ID,
        entityLabel: '[deleted-gdpr]',
      })
    )
  })

  it('does not call deleteCvFile when candidate has no filePath', async () => {
    // Override select to return a candidate with no filePath
    let noFileCount = 0
    mockTx.select = vi.fn(() => {
      noFileCount++
      if (noFileCount === 1) {
        return makeSelectChain([{ ...CANDIDATE_ROW, filePath: null }])
      }
      return makeSelectChain([])
    })

    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(mockDeleteCvFile).not.toHaveBeenCalled()
  })

  it('returns error when candidate is not found', async () => {
    // Override select so the candidate query returns empty
    mockTx.select = vi.fn(() => makeSelectChain([]))

    const { deleteCandidateForGdpr } = await import('@/actions/gdpr')

    const result = await deleteCandidateForGdpr({
      candidateId: CANDIDATE_ID,
      typedConfirmation: 'Jane Doe',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/not found/i)
  })
})
