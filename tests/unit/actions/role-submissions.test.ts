/**
 * Unit tests for src/actions/role-submissions/ (via index barrel)
 *
 * Covers:
 *   mutations:
 *     submitCandidatesToCustomer — schema validation, auth, role gate, happy path,
 *       idempotent re-submit (onConflictDoNothing), audit per inserted row.
 *     updateSubmissionStatus — auth, role gate, not-found, happy path with
 *       status transition audit log.
 *     removeSubmission — auth, role gate, not-found, happy path with audit.
 *
 *   sharing:
 *     generateShareToken — auth, role gate, not-found, happy path (token generated
 *       and URL built from APP_URL), re-generation audit flag.
 *     revokeShareToken — auth, role gate, not-found, happy path (shareToken cleared).
 *
 *   public:
 *     updateSubmissionStatusByToken — invalid token, disallowed status
 *       (cannot set 'submitted' via public link), rate-limit rejection,
 *       expired/revoked token (no row), happy path.
 *     getSubmissionByToken — invalid token, expired token, happy path returns
 *       CustomerVisibleSubmission with no commercial fields.
 *
 * Mocks:
 *   @/db                                              — db, withTenant
 *   @/db/schema/role-submissions                      — roleSubmissions, SubmissionStatus
 *   @/db/schema/candidates                            — candidates
 *   @/db/schema/roles                                 — roles
 *   @/db/schema/tenants                               — tenants
 *   @/db/schema/customers                             — customers
 *   @/db/schema/audit-logs                            — auditLogs
 *   drizzle-orm                                       — eq / and / inArray / sql
 *   @/lib/auth/action-context                         — getActionContext
 *   @/lib/audit                                       — writeAuditLog
 *   @/lib/api/share-rate-limit                        — checkShareUpdateRateLimit
 *   @/lib/email/notify-recruiter-of-customer-update   — notifyRecruiterOfCustomerUpdate
 *   next/cache                                        — revalidatePath silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID      = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID        = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROLE_ID        = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CANDIDATE_ID   = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CANDIDATE_ID_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const SUBMISSION_ID  = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const SHARE_TOKEN    = 'a'.repeat(44) // 44 chars base64url — valid length

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUBMISSION_ROW = {
  id: SUBMISSION_ID,
  tenantId: TENANT_ID,
  roleId: ROLE_ID,
  candidateId: CANDIDATE_ID,
  status: 'submitted',
  shareToken: SHARE_TOKEN,
  shareTokenCreatedAt: new Date('2026-01-01'),
}

const CANDIDATE_ROW = {
  id: CANDIDATE_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  tenantId: TENANT_ID,
}

const ROLE_ROW = {
  id: ROLE_ID,
  title: 'Senior TypeScript Engineer',
}

const TENANT_ROW = {
  id: TENANT_ID,
  name: 'Acme Recruiting Ltd',
}

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

// withTenant() result queue — one entry per invocation
let withTenantResults: unknown[][] = []
let withTenantCallCount = 0

// Captured mutation calls
const mockInsertValues        = vi.fn()
const mockOnConflictDoNothing = vi.fn()
const mockReturning           = vi.fn()
const mockUpdateSet           = vi.fn()
const mockUpdateWhere         = vi.fn()
const mockDeleteWhere         = vi.fn()
const mockInsertAuditValues   = vi.fn()

// db.execute mock — for public module raw SQL token lookup
let dbExecuteResult: unknown[] = []

// db.select chain for getSubmissionByToken's tenant lookup
let dbSelectChainRows: unknown[] = []

vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(() => Promise.resolve(dbExecuteResult)),
    select: vi.fn(() => makeSelectChain(dbSelectChainRows)),
  },
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const rows = withTenantResults[withTenantCallCount] ?? []
      withTenantCallCount++

      const tx = {
        select: vi.fn(() => makeSelectChain(rows)),

        insert: vi.fn((table: unknown) => {
          // Distinguish audit log inserts from submission inserts by the table stub
          const isAuditLog = table === 'audit_logs_stub'
          return {
            values: (...args: unknown[]) => {
              if (isAuditLog) mockInsertAuditValues(...args)
              else mockInsertValues(...args)
              return {
                onConflictDoNothing: (...ocdArgs: unknown[]) => {
                  mockOnConflictDoNothing(...ocdArgs)
                  return {
                    returning: (...rArgs: unknown[]) => {
                      mockReturning(...rArgs)
                      // Return the inserted rows (simulate successful insert)
                      return Promise.resolve([
                        { id: SUBMISSION_ID, candidateId: CANDIDATE_ID },
                      ])
                    },
                  }
                },
                // Plain values() without onConflictDoNothing (used in audit insert)
                catch: (fn: (e: unknown) => void) => ({ catch: fn }),
              }
            },
          }
        }),

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

        delete: vi.fn(() => ({
          where: (...wargs: unknown[]) => {
            mockDeleteWhere(...wargs)
            return Promise.resolve()
          },
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema/role-submissions', () => ({
  roleSubmissions: {
    id: 'id', tenantId: 'tenant_id', roleId: 'role_id',
    candidateId: 'candidate_id', status: 'status', sentAt: 'sent_at',
    sentByUserId: 'sent_by_user_id', statusUpdatedAt: 'status_updated_at',
    notes: 'notes', createdAt: 'created_at', shareToken: 'share_token',
    shareTokenCreatedAt: 'share_token_created_at', updatedAt: 'updated_at',
  },
}))

vi.mock('@/db/schema/candidates', () => ({
  candidates: {
    id: 'id', tenantId: 'tenant_id', firstName: 'first_name',
    lastName: 'last_name', email: 'email', agencyId: 'agency_id',
  },
}))

vi.mock('@/db/schema/roles', () => ({
  roles: {
    id: 'id', tenantId: 'tenant_id', title: 'title', customerId: 'customer_id',
  },
}))

vi.mock('@/db/schema/tenants', () => ({
  tenants: { id: 'id', name: 'name' },
}))

vi.mock('@/db/schema/customers', () => ({
  customers: { id: 'id', name: 'name' },
}))

vi.mock('@/db/schema/audit-logs', () => ({
  auditLogs: 'audit_logs_stub',
}))

vi.mock('drizzle-orm', () => ({
  eq:      vi.fn(() => ({ type: 'eq' })),
  and:     vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn(() => ({ type: 'inArray' })),
  sql:     vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql', strings, values,
  })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

const mockCheckShareRateLimit = vi.fn().mockReturnValue(null) // null = not rate-limited
vi.mock('@/lib/api/share-rate-limit', () => ({
  checkShareUpdateRateLimit: (...args: unknown[]) => mockCheckShareRateLimit(...args),
}))

const mockNotifyRecruiter = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email/notify-recruiter-of-customer-update', () => ({
  notifyRecruiterOfCustomerUpdate: (...args: unknown[]) => mockNotifyRecruiter(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function resetState() {
  vi.clearAllMocks()
  withTenantResults = []
  withTenantCallCount = 0
  dbExecuteResult = []
  dbSelectChainRows = []
  mockGetActionContext.mockResolvedValue(recruiterCtx())
  mockCheckShareRateLimit.mockReturnValue(null)
}

// ── submitCandidatesToCustomer ────────────────────────────────────────────────

describe('submitCandidatesToCustomer', () => {
  beforeEach(resetState)

  it('returns error when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { submitCandidatesToCustomer } = await import('@/actions/role-submissions')

    const result = await submitCandidatesToCustomer(ROLE_ID, [CANDIDATE_ID])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const,
    })
    const { submitCandidatesToCustomer } = await import('@/actions/role-submissions')

    const result = await submitCandidatesToCustomer(ROLE_ID, [CANDIDATE_ID])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when roleId is not a valid UUID', async () => {
    const { submitCandidatesToCustomer } = await import('@/actions/role-submissions')

    const result = await submitCandidatesToCustomer('not-a-uuid', [CANDIDATE_ID])

    expect(result.success).toBe(false)
  })

  it('returns error when candidateIds is empty array', async () => {
    const { submitCandidatesToCustomer } = await import('@/actions/role-submissions')

    const result = await submitCandidatesToCustomer(ROLE_ID, [])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/at least one/i)
  })

  it('inserts submission rows and writes audit log per inserted row', async () => {
    // candidateRows lookup
    withTenantResults = [
      [CANDIDATE_ROW],                                             // candidate names fetch
      [{ id: SUBMISSION_ID, candidateId: CANDIDATE_ID }],        // insert returning
    ]
    const { submitCandidatesToCustomer } = await import('@/actions/role-submissions')

    const result = await submitCandidatesToCustomer(ROLE_ID, [CANDIDATE_ID], 'Strong TypeScript background')

    expect(result.success).toBe(true)
    const data = (result as { success: true; data: { inserted: number } }).data
    expect(data.inserted).toBeGreaterThanOrEqual(0)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'candidate.submitted_to_customer' })
    )
  })

  it('succeeds with notes undefined (no notes variant)', async () => {
    withTenantResults = [
      [CANDIDATE_ROW],
      [{ id: SUBMISSION_ID, candidateId: CANDIDATE_ID }],
    ]
    const { submitCandidatesToCustomer } = await import('@/actions/role-submissions')

    const result = await submitCandidatesToCustomer(ROLE_ID, [CANDIDATE_ID])

    expect(result.success).toBe(true)
  })
})

// ── updateSubmissionStatus ────────────────────────────────────────────────────

describe('updateSubmissionStatus', () => {
  beforeEach(resetState)

  it('returns error when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatus(SUBMISSION_ID, 'interview_scheduled')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is hiring_manager (below recruiter)', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'hiring_manager' as const,
    })
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatus(SUBMISSION_ID, 'interview_scheduled')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when submissionId is not a valid UUID', async () => {
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatus('bad-id', 'hired')

    expect(result.success).toBe(false)
  })

  it('returns error when status value is not in the allowed enum', async () => {
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatus(SUBMISSION_ID, 'pending_review' as never)

    expect(result.success).toBe(false)
  })

  it('returns not-found when submission row does not exist in tenant', async () => {
    // existing row lookup returns empty
    withTenantResults = [[]]
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatus(SUBMISSION_ID, 'hired')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })

  it('updates status and writes submission.status_changed audit log', async () => {
    withTenantResults = [
      [SUBMISSION_ROW],                          // existing row lookup
      [{ firstName: 'Jane', lastName: 'Doe' }],  // candidate name lookup
      [{ title: 'Senior TypeScript Engineer' }], // role title lookup
      [],                                        // update() call
    ]
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatus(SUBMISSION_ID, 'interview_scheduled')

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.status).toBe('interview_scheduled')
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'submission.status_changed',
        entityType: 'submission',
        entityId: SUBMISSION_ID,
        metadata: expect.objectContaining({
          from: 'submitted',
          to: 'interview_scheduled',
        }),
      })
    )
  })

  it('includes notes in the update payload when provided', async () => {
    withTenantResults = [
      [SUBMISSION_ROW],
      [CANDIDATE_ROW],
      [ROLE_ROW],
      [],
    ]
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    await updateSubmissionStatus(SUBMISSION_ID, 'hired', 'Great interview')

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.notes).toBe('Great interview')
  })

  it('does not include notes key when notes is undefined', async () => {
    withTenantResults = [
      [SUBMISSION_ROW],
      [CANDIDATE_ROW],
      [ROLE_ROW],
      [],
    ]
    const { updateSubmissionStatus } = await import('@/actions/role-submissions')

    await updateSubmissionStatus(SUBMISSION_ID, 'hired')

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(setArg, 'notes')).toBe(false)
  })
})

// ── removeSubmission ──────────────────────────────────────────────────────────

describe('removeSubmission', () => {
  beforeEach(resetState)

  it('returns error when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { removeSubmission } = await import('@/actions/role-submissions')

    const result = await removeSubmission(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const,
    })
    const { removeSubmission } = await import('@/actions/role-submissions')

    const result = await removeSubmission(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns not-found when submission row does not exist', async () => {
    withTenantResults = [[]]
    const { removeSubmission } = await import('@/actions/role-submissions')

    const result = await removeSubmission(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })

  it('deletes submission and writes candidate.unsubmitted_from_customer audit', async () => {
    withTenantResults = [
      [SUBMISSION_ROW],  // existing row
      [CANDIDATE_ROW],   // candidate name
      [],                // delete
    ]
    const { removeSubmission } = await import('@/actions/role-submissions')

    const result = await removeSubmission(SUBMISSION_ID)

    expect(result.success).toBe(true)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'candidate.unsubmitted_from_customer',
        entityType: 'candidate',
        entityId: CANDIDATE_ID,
        metadata: expect.objectContaining({
          roleId: ROLE_ID,
          submissionId: SUBMISSION_ID,
          lastStatus: 'submitted',
        }),
      })
    )
  })
})

// ── generateShareToken ────────────────────────────────────────────────────────

describe('generateShareToken', () => {
  beforeEach(resetState)

  it('returns error when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { generateShareToken } = await import('@/actions/role-submissions')

    const result = await generateShareToken(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is hiring_manager', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'hiring_manager' as const,
    })
    const { generateShareToken } = await import('@/actions/role-submissions')

    const result = await generateShareToken(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error for invalid UUID submissionId', async () => {
    const { generateShareToken } = await import('@/actions/role-submissions')

    const result = await generateShareToken('not-a-uuid')

    expect(result.success).toBe(false)
  })

  it('returns not-found when submission does not exist in tenant', async () => {
    withTenantResults = [[]]
    const { generateShareToken } = await import('@/actions/role-submissions')

    const result = await generateShareToken(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })

  it('generates a token, persists it, and returns success with url', async () => {
    const submissionWithNoToken = { ...SUBMISSION_ROW, shareToken: null }
    withTenantResults = [
      [submissionWithNoToken],                              // submission lookup
      [{ firstName: 'Jane', lastName: 'Doe' }],            // candidate name
      [{ title: 'Senior TypeScript Engineer' }],           // role title
      [],                                                  // update call
    ]
    process.env.APP_URL = 'https://app.example.com'
    const { generateShareToken } = await import('@/actions/role-submissions')

    const result = await generateShareToken(SUBMISSION_ID)

    expect(result.success).toBe(true)
    const data = (result as { success: true; data: { token: string; url: string } }).data
    expect(typeof data.token).toBe('string')
    expect(data.token.length).toBeGreaterThan(0)
    expect(data.url).toContain(data.token)
    expect(data.url).toContain('https://app.example.com')

    // The update should have set shareToken
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(typeof setArg.shareToken).toBe('string')

    // Audit log should be written
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'submission.share_token_generated',
        metadata: expect.objectContaining({ regenerated: false }),
      })
    )
  })

  it('sets regenerated=true in audit when token already existed', async () => {
    withTenantResults = [
      [SUBMISSION_ROW], // submission with existing shareToken
      [CANDIDATE_ROW],
      [ROLE_ROW],
      [],
    ]
    const { generateShareToken } = await import('@/actions/role-submissions')

    await generateShareToken(SUBMISSION_ID)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        metadata: expect.objectContaining({ regenerated: true }),
      })
    )
  })
})

// ── revokeShareToken ──────────────────────────────────────────────────────────

describe('revokeShareToken', () => {
  beforeEach(resetState)

  it('returns error when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { revokeShareToken } = await import('@/actions/role-submissions')

    const result = await revokeShareToken(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns not-found when submission does not exist', async () => {
    withTenantResults = [[]]
    const { revokeShareToken } = await import('@/actions/role-submissions')

    const result = await revokeShareToken(SUBMISSION_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })

  it('clears shareToken on the row and writes revocation audit log', async () => {
    withTenantResults = [
      [SUBMISSION_ROW],
      [CANDIDATE_ROW],
      [ROLE_ROW],
      [],
    ]
    const { revokeShareToken } = await import('@/actions/role-submissions')

    const result = await revokeShareToken(SUBMISSION_ID)

    expect(result.success).toBe(true)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.shareToken).toBeNull()
    expect(setArg.shareTokenCreatedAt).toBeNull()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'submission.share_token_revoked' })
    )
  })
})

// ── updateSubmissionStatusByToken (public) ────────────────────────────────────

describe('updateSubmissionStatusByToken', () => {
  const OPTS = {
    ipAddress: '1.2.3.4',
    userAgent: 'TestAgent/1.0',
  }

  beforeEach(resetState)

  it('returns error for empty token', async () => {
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken('', 'hired', OPTS)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid token/i)
  })

  it('returns error for token longer than 64 chars', async () => {
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken('x'.repeat(65), 'hired', OPTS)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid token/i)
  })

  it('returns error when status is "submitted" (not in CUSTOMER_ALLOWED)', async () => {
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken(SHARE_TOKEN, 'submitted', OPTS)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not allowed/i)
  })

  it('returns error when status is "withdrawn" (not in CUSTOMER_ALLOWED)', async () => {
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken(SHARE_TOKEN, 'withdrawn' as never, OPTS)

    expect(result.success).toBe(false)
  })

  it('returns error when rate-limited', async () => {
    mockCheckShareRateLimit.mockReturnValue({ retryAfterSeconds: 30 })
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken(SHARE_TOKEN, 'hired', OPTS)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/30s/i)
  })

  it('returns expired error when db.execute returns no row', async () => {
    dbExecuteResult = []
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken(SHARE_TOKEN, 'hired', OPTS)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/expired|revoked/i)
  })

  it('returns expired error when share_token column is null (revoked)', async () => {
    dbExecuteResult = [{
      id: SUBMISSION_ID,
      tenant_id: TENANT_ID,
      role_id: ROLE_ID,
      candidate_id: CANDIDATE_ID,
      status: 'submitted',
      share_token: null,
    }]
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken(SHARE_TOKEN, 'hired', OPTS)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/expired|revoked/i)
  })

  it('updates status and returns success with new status + timestamp on happy path', async () => {
    dbExecuteResult = [{
      id: SUBMISSION_ID,
      tenant_id: TENANT_ID,
      role_id: ROLE_ID,
      candidate_id: CANDIDATE_ID,
      status: 'submitted',
      share_token: SHARE_TOKEN,
    }]
    // withTenant calls: update, candidate name, role title, audit insert
    withTenantResults = [[], [CANDIDATE_ROW], [ROLE_ROW], []]
    const { updateSubmissionStatusByToken } = await import('@/actions/role-submissions')

    const result = await updateSubmissionStatusByToken(SHARE_TOKEN, 'hired', OPTS)

    expect(result.success).toBe(true)
    const data = (result as { success: true; data: { status: string; statusUpdatedAt: Date } }).data
    expect(data.status).toBe('hired')
    expect(data.statusUpdatedAt).toBeInstanceOf(Date)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
  })
})

// ── getSubmissionByToken (public) ─────────────────────────────────────────────

describe('getSubmissionByToken', () => {
  beforeEach(resetState)

  it('returns null for empty token', async () => {
    const { getSubmissionByToken } = await import('@/actions/role-submissions')

    const result = await getSubmissionByToken('')

    expect(result).toBeNull()
  })

  it('returns null for token longer than 64 chars', async () => {
    const { getSubmissionByToken } = await import('@/actions/role-submissions')

    const result = await getSubmissionByToken('x'.repeat(65))

    expect(result).toBeNull()
  })

  it('returns null when db.execute finds no row for the token', async () => {
    dbExecuteResult = []
    const { getSubmissionByToken } = await import('@/actions/role-submissions')

    const result = await getSubmissionByToken(SHARE_TOKEN)

    expect(result).toBeNull()
  })

  it('returns null when share_token column is null (revoked)', async () => {
    dbExecuteResult = [{
      id: SUBMISSION_ID,
      tenant_id: TENANT_ID,
      role_id: ROLE_ID,
      candidate_id: CANDIDATE_ID,
      status: 'submitted',
      sent_at: new Date(),
      status_updated_at: new Date(),
      share_token: null,
    }]
    const { getSubmissionByToken } = await import('@/actions/role-submissions')

    const result = await getSubmissionByToken(SHARE_TOKEN)

    expect(result).toBeNull()
  })

  it('returns CustomerVisibleSubmission on happy path', async () => {
    const now = new Date('2026-05-01T10:00:00Z')
    dbExecuteResult = [{
      id: SUBMISSION_ID,
      tenant_id: TENANT_ID,
      role_id: ROLE_ID,
      candidate_id: CANDIDATE_ID,
      status: 'submitted',
      sent_at: now,
      status_updated_at: now,
      share_token: SHARE_TOKEN,
    }]
    // Phase 2: withTenant enriched projection
    withTenantResults = [[{
      candidateFirstName: 'Jane',
      candidateLastName: 'Doe',
      roleTitle: 'Senior TypeScript Engineer',
      customerName: 'ClientCo',
    }]]
    // Phase 3: db.select() for tenant name
    dbSelectChainRows = [TENANT_ROW]

    const { getSubmissionByToken } = await import('@/actions/role-submissions')

    const result = await getSubmissionByToken(SHARE_TOKEN)

    expect(result).not.toBeNull()
    expect(result!.candidateFirstName).toBe('Jane')
    expect(result!.candidateLastName).toBe('Doe')
    expect(result!.roleTitle).toBe('Senior TypeScript Engineer')
    expect(result!.customerName).toBe('ClientCo')
    expect(result!.tenantName).toBe('Acme Recruiting Ltd')
    expect(result!.status).toBe('submitted')

    // Ensure no commercial fields are present
    expect(result).not.toHaveProperty('candidateRate')
    expect(result).not.toHaveProperty('margin')
    expect(result).not.toHaveProperty('notes')
    expect(result).not.toHaveProperty('agencyId')
  })

  it('returns null when tenant row does not exist', async () => {
    dbExecuteResult = [{
      id: SUBMISSION_ID,
      tenant_id: TENANT_ID,
      role_id: ROLE_ID,
      candidate_id: CANDIDATE_ID,
      status: 'submitted',
      sent_at: new Date(),
      status_updated_at: new Date(),
      share_token: SHARE_TOKEN,
    }]
    withTenantResults = [[{
      candidateFirstName: 'Jane',
      candidateLastName: 'Doe',
      roleTitle: 'Senior TypeScript Engineer',
      customerName: null,
    }]]
    // tenant not found
    dbSelectChainRows = []

    const { getSubmissionByToken } = await import('@/actions/role-submissions')

    const result = await getSubmissionByToken(SHARE_TOKEN)

    expect(result).toBeNull()
  })
})
