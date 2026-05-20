/**
 * Unit tests for deleteUserForGdpr in src/actions/gdpr.ts
 *
 * Mirrors the structure of the existing gdpr.test.ts (candidate erasure).
 *
 * Mocks:
 *   - @/db (withTenant) — intercepts all DB calls
 *   - @/lib/auth/action-context (getActionContext) — provides synthetic context
 *   - @/lib/audit (writeAuditLog) — spied to verify tombstone write
 *   - next/cache (revalidatePath) — silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const TARGET_USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const CALLER_USER_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'

const TARGET_USER = {
  id: TARGET_USER_ID,
  tenantId: TENANT_ID,
  email: 'target@example.com',
  name: 'Target User',
  role: 'recruiter' as const,
}

const ADMIN_TARGET_USER = {
  ...TARGET_USER,
  id: TARGET_USER_ID,
  email: 'admin-target@example.com',
  name: 'Admin Target',
  role: 'admin' as const,
}

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) }
const mockUpdateChain = { set: vi.fn() }
const mockSetChain = { where: vi.fn().mockResolvedValue([]) } // return array so length works
mockUpdateChain.set.mockReturnValue(mockSetChain)
const mockExecute = vi.fn().mockResolvedValue(undefined)

/**
 * makeSelectChain — returns a Drizzle-compatible query builder mock.
 * Supports both `await chain` (PromiseLike) and `.limit(n)` (explicit resolve).
 */
function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
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

// ---------------------------------------------------------------------------
// Select sequencing state
// ---------------------------------------------------------------------------

// We control which select call returns which rows by tracking call count.
// Call 1: load target user (existence check)
// Call 2: count admins (last-admin guard — only triggered for admin targets)
let selectCallCount = 0

const mockTx = {
  select: vi.fn(() => {
    selectCallCount++
    if (selectCallCount === 1) {
      // Existence check — return target user by default
      return makeSelectChain([TARGET_USER])
    }
    if (selectCallCount === 2) {
      // Admin count query — default to 2 (safe, not last admin)
      return makeSelectChain([{ id: 'admin-1' }, { id: 'admin-2' }])
    }
    return makeSelectChain([])
  }),
  delete: vi.fn(() => mockDeleteChain),
  update: vi.fn(() => mockUpdateChain),
  execute: mockExecute,
}

vi.mock('@/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
}))

vi.mock('@/db/schema', () => ({
  // candidate cascade tables (used by deleteCandidateForGdpr — not needed here but must exist)
  candidates: {},
  scores: {},
  notes: {},
  candidateEnrichments: {},
  cvProfiles: {},
  sentEmails: {},
  interviewPacks: {},
  interviewQuestions: {},
  codeChallenges: {},
  interviewSlots: {},
  interviewTranscripts: {},
  transcriptAnalyses: {},
  candidateRoleApprovals: {},
  roleSubmissions: {},
  // user cascade tables
  users: {},
  auditLogs: {},
  aiUsage: {},
  apiTokens: {},
  calendarConnections: {},
  roleManagers: {},
  roles: {},
  tenantSettings: {},
  userInvitations: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  // sql tagged-template — return a token that tx.execute can receive
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings,
      values,
    }),
    { raw: (s: string) => ({ type: 'sql-raw', s }) }
  ),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: mockGetActionContext,
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

vi.mock('@/lib/cv/store', () => ({
  deleteCvFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminContext() {
  return {
    tenantId: TENANT_ID,
    userId: CALLER_USER_ID,
    userRole: 'admin' as const,
  }
}

function resetMockTx(targetRow: typeof TARGET_USER = TARGET_USER, adminCount = 2) {
  let localCount = 0
  mockTx.select = vi.fn(() => {
    localCount++
    if (localCount === 1) return makeSelectChain([targetRow])
    if (localCount === 2) return makeSelectChain(Array.from({ length: adminCount }, (_, i) => ({ id: `admin-${i}` })))
    return makeSelectChain([])
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deleteUserForGdpr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0

    // Re-wire chains after clearAllMocks
    mockDeleteChain.where.mockResolvedValue(undefined)
    mockUpdateChain.set.mockReturnValue(mockSetChain)
    mockSetChain.where.mockResolvedValue([])
    mockExecute.mockResolvedValue(undefined)

    // Default: admin caller, recruiter target, 2 admins exist
    mockGetActionContext.mockResolvedValue(adminContext())
    resetMockTx(TARGET_USER, 2)
  })

  // ── Authorization checks ──────────────────────────────────────────────────

  it('returns error when no action context (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is recruiter (not admin)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: CALLER_USER_ID,
      userRole: 'recruiter' as const,
    })
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when role is viewer (not admin)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: CALLER_USER_ID,
      userRole: 'viewer' as const,
    })
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── Input validation ──────────────────────────────────────────────────────

  it('returns error when userId is not a valid UUID', async () => {
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: 'not-a-uuid',
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('UUID')
  })

  it('returns error when typedConfirmation is empty', async () => {
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: '',
    })

    expect(result.ok).toBe(false)
  })

  // ── Self-delete guard ─────────────────────────────────────────────────────

  it('returns error when caller tries to delete their own account', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: TARGET_USER_ID, // caller IS the target
      userRole: 'admin' as const,
    })
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/cannot delete your own/i)
  })

  // ── User not found ────────────────────────────────────────────────────────

  it('returns error when target user is not found', async () => {
    // Select returns empty — user does not exist
    mockTx.select = vi.fn(() => makeSelectChain([]))

    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/not found/i)
  })

  // ── Typed-confirmation check ──────────────────────────────────────────────

  it('returns error when typed email does not match', async () => {
    resetMockTx(TARGET_USER)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: 'wrong@example.com',
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/confirmation does not match/i)
  })

  it('returns error when typed email has wrong case (case-sensitive)', async () => {
    resetMockTx(TARGET_USER)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email.toUpperCase(),
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/confirmation does not match/i)
  })

  // ── Last-admin guard ──────────────────────────────────────────────────────

  it('returns error when deleting the sole remaining admin', async () => {
    // First select: target user with admin role
    // Second select: only 1 admin exists
    let localCount = 0
    mockTx.select = vi.fn(() => {
      localCount++
      if (localCount === 1) return makeSelectChain([ADMIN_TARGET_USER])
      if (localCount === 2) return makeSelectChain([{ id: TARGET_USER_ID }]) // only 1 admin
      return makeSelectChain([])
    })

    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: ADMIN_TARGET_USER.email,
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/sole admin/i)
  })

  it('succeeds when deleting an admin user if other admins exist', async () => {
    // First select: admin target
    // Second select: 2 admins (one is the target, one is someone else)
    let localCount = 0
    mockTx.select = vi.fn(() => {
      localCount++
      if (localCount === 1) return makeSelectChain([ADMIN_TARGET_USER])
      if (localCount === 2) return makeSelectChain([{ id: TARGET_USER_ID }, { id: CALLER_USER_ID }])
      return makeSelectChain([])
    })

    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: ADMIN_TARGET_USER.email,
    })

    expect(result.ok).toBe(true)
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('succeeds when admin provides the exact user email (recruiter target)', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    const result = await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(result.ok).toBe(true)
  })

  it('calls tx.delete at least once (for the users row)', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(mockTx.delete).toHaveBeenCalled()
  })

  // ── Audit redaction ───────────────────────────────────────────────────────

  it('calls tx.update(auditLogs) with GDPR redaction payload', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    expect(mockTx.update).toHaveBeenCalled()

    // The set payload for audit redaction must have the '[redacted-gdpr]' marker
    const setCalls = mockUpdateChain.set.mock.calls
    const auditRedactCall = setCalls.find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload?.userEmail === '[redacted-gdpr]'
    })
    expect(auditRedactCall).toBeDefined()
    const payload = auditRedactCall?.[0] as Record<string, unknown>
    expect((payload?.metadata as Record<string, unknown>)?.redacted_gdpr).toBe(true)
  })

  // ── Tombstone audit row ───────────────────────────────────────────────────

  it('writes a tombstone audit log entry with action user.deleted_gdpr', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    // writeAuditLog is called via emitAudit (fire-and-forget) — wait a tick
    await new Promise((r) => setTimeout(r, 0))

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'user.deleted_gdpr',
        entityType: 'user',
        entityId: TARGET_USER_ID,
        entityLabel: '[deleted-gdpr]',
      })
    )
  })

  it('includes deleted_user_email and deleted_user_id in tombstone metadata', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    await new Promise((r) => setTimeout(r, 0))

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        metadata: expect.objectContaining({
          deleted_user_email: TARGET_USER.email,
          deleted_user_id: TARGET_USER_ID,
        }),
      })
    )
  })

  // ── Multiple SET NULL updates issued ─────────────────────────────────────

  it('issues multiple tx.update calls (SET NULL on referencing tables)', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    // Expect more than 1 update call: at minimum audit redaction + several SET NULL
    expect(mockTx.update.mock.calls.length).toBeGreaterThan(1)
  })

  // ── ai_usage PII redaction ────────────────────────────────────────────────

  it('calls tx.execute to redact ai_usage user_id reference (Article 17 PII gap)', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    // tx.execute must be called for the ai_usage UPDATE
    expect(mockTx.execute).toHaveBeenCalled()
  })

  it('ai_usage redaction SQL NULLs user_id and sets user_redacted_gdpr flag', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    const callArg = mockTx.execute.mock.calls[0]?.[0] as
      | { type: string; strings: string[]; values: unknown[] }
      | undefined

    expect(callArg).toBeDefined()
    const rawSql = callArg!.strings.join('?')
    // The UPDATE must set user_id to NULL and add the redaction marker
    expect(rawSql).toMatch(/user_id\s*=\s*NULL/i)
    expect(rawSql).toMatch(/user_redacted_gdpr/i)
    // The WHERE clause must reference the target user's UUID
    expect(callArg!.values).toContain(TARGET_USER_ID)
  })

  it('after ai_usage redaction no row has user_id = deleted user (verified via execute call)', async () => {
    // Confirms the UPDATE targets the right tenant + user combination.
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    const callArg = mockTx.execute.mock.calls[0]?.[0] as
      | { type: string; values: unknown[] }
      | undefined

    // Both tenantId and targetUserId must appear as bound parameters
    expect(callArg!.values).toContain(TENANT_ID)
    expect(callArg!.values).toContain(TARGET_USER_ID)
  })

  it('ai_usage rows are NOT deleted — only updated (row count preserved)', async () => {
    resetMockTx(TARGET_USER, 2)
    const { deleteUserForGdpr } = await import('@/actions/gdpr')

    await deleteUserForGdpr({
      userId: TARGET_USER_ID,
      typedConfirmation: TARGET_USER.email,
    })

    // tx.delete must NOT be called with the aiUsage table object
    const deleteCalls = mockTx.delete.mock.calls as unknown[][]
    const { aiUsage: aiUsageTable } = await import('@/db/schema')
    const deletedAiUsage = deleteCalls.some((args) => args[0] === aiUsageTable)
    expect(deletedAiUsage).toBe(false)
  })
})
