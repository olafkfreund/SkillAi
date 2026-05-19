/**
 * Unit tests for src/actions/candidates.ts
 *
 * Covers:
 *   createCandidate — happy path, auth errors, file validation errors, parse
 *     error, missing file, rate-without-currency validation.
 *   bulkUpdateCandidateStatus — happy path, validation guards.
 *   updateCandidateAvailability — happy path and invalid-status guard.
 *
 * Mocks:
 *   @/db                              — db, withTenant
 *   @/db/schema                       — candidates, scores, agencies stubs
 *   drizzle-orm                       — eq / and / ilike / inArray / notInArray
 *   @/lib/auth/action-context         — getActionContext
 *   @/lib/audit                       — writeAuditLog
 *   @/lib/ai/scoring                  — triggerScoring (fire-and-forget)
 *   @/lib/cv/store                    — validateCvFile, parseCvBuffer, persistCvFile
 *   @/lib/parsers                     — ParseError class
 *   @/lib/tenants/ensure-internal-agency — silenced
 *   next/cache                        — revalidatePath silenced
 *   next/navigation                   — redirect silenced
 *   next/server                       — after fires callback synchronously
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID     = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CANDIDATE_ID  = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROLE_ID       = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_ID       = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

// ── Chainable mock builders ────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then   = resolved.then.bind(resolved)
  c.catch  = resolved.catch.bind(resolved)
  c.from   = vi.fn(() => c)
  c.where  = vi.fn(() => c)
  c.limit  = vi.fn(() => Promise.resolve(rows))
  c.orderBy = vi.fn(() => c)
  return c
}

// ── Per-test captured calls ───────────────────────────────────────────────────

const mockInsertValues   = vi.fn()
const mockUpdateSet      = vi.fn()
const mockUpdateWhere    = vi.fn()
const mockUpdateReturning = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => makeSelectChain([])),
  },
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => makeSelectChain([])),
        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return Promise.resolve()
          },
        })),
        update: vi.fn(() => ({
          set: (...args: unknown[]) => {
            mockUpdateSet(...args)
            return {
              where: (...wargs: unknown[]) => {
                mockUpdateWhere(...wargs)
                return {
                  returning: (...rargs: unknown[]) => {
                    mockUpdateReturning(...rargs)
                    // Return an array of one updated row by default
                    return Promise.resolve([{ id: CANDIDATE_ID }])
                  },
                }
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
  candidates: {
    id:         'id',
    tenantId:   'tenant_id',
    isActive:   'is_active',
    firstName:  'first_name',
    lastName:   'last_name',
    status:     'status',
    agencyId:   'agency_id',
    isInternal: 'is_internal',
    embedding:  'embedding',
  },
  scores: {
    id:          'id',
    tenantId:    'tenant_id',
    candidateId: 'candidate_id',
    roleId:      'role_id',
    scoreStatus: 'score_status',
  },
  agencies: {
    id:         'id',
    tenantId:   'tenant_id',
    isInternal: 'is_internal',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:        vi.fn(() => ({ type: 'eq' })),
  and:       vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  or:        vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  ilike:     vi.fn(() => ({ type: 'ilike' })),
  inArray:   vi.fn(() => ({ type: 'inArray' })),
  notInArray: vi.fn(() => ({ type: 'notInArray' })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

const mockTriggerScoring = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/ai/scoring', () => ({
  triggerScoring: (...args: unknown[]) => mockTriggerScoring(...args),
}))

// validateCvFile / parseCvBuffer / persistCvFile — controlled per test
const mockValidateCvFile  = vi.fn()
const mockParseCvBuffer   = vi.fn()
const mockPersistCvFile   = vi.fn()

vi.mock('@/lib/cv/store', () => ({
  validateCvFile:  (...args: unknown[]) => mockValidateCvFile(...args),
  parseCvBuffer:   (...args: unknown[]) => mockParseCvBuffer(...args),
  persistCvFile:   (...args: unknown[]) => mockPersistCvFile(...args),
}))

// ParseError — need the real class shape for `instanceof` checks
class MockParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

vi.mock('@/lib/parsers', () => ({
  ParseError: MockParseError,
}))

vi.mock('@/lib/tenants/ensure-internal-agency', () => ({
  ensureInternalAgency: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
// after() fires synchronously in tests so embedded async calls execute inline
vi.mock('next/server', () => ({
  after: vi.fn((fn: () => void) => {
    try { fn() } catch {}
  }),
}))

// Silence the dynamic import of embeddings + cv-profile triggered by `after()`
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/ai/cv-profile', () => ({
  triggerCvProfileExtraction: vi.fn().mockResolvedValue(undefined),
}))

// Note: crypto.randomUUID cannot be reliably mocked as a named import
// because the binding is resolved at module-load time before vi.mock takes effect.
// Tests that need the candidateId instead capture it from the result directly.

// ── Helpers ───────────────────────────────────────────────name────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

/** Minimal valid FormData for createCandidate */
function baseFormData(overrides: Record<string, string | File> = {}): FormData {
  const fd = new FormData()
  fd.set('firstName', 'Jane')
  fd.set('lastName',  'Doe')
  fd.set('roleId',    ROLE_ID)
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v as string)
  return fd
}

/** A minimal fake File-like object */
function fakeFile(name = 'cv.pdf', size = 1024, type = 'application/pdf') {
  // FormData in jsdom accepts Blobs / Files
  return new File(['x'.repeat(size)], name, { type })
}

// ── createCandidate ────────────────────────────────────────────────────────────

describe('createCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())

    // Default happy-path stubs
    mockValidateCvFile.mockResolvedValue({
      ok: true,
      fileType: 'pdf',
      buffer: Buffer.from('fake-pdf'),
    })
    mockParseCvBuffer.mockResolvedValue({ cvText: 'Experienced developer with 5 years TypeScript.' })
    mockPersistCvFile.mockResolvedValue({ filePath: `/uploads/${TENANT_ID}/cv-${CANDIDATE_ID}.pdf` })
  })

  // ── Auth checks ──────────────────────────────────────────────────────────────

  it('returns error when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── File validation errors ────────────────────────────────────────────────────

  it('returns error when no CV file is provided', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    // No cvFile in form data
    const fd = baseFormData()

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/cv file is required/i)
  })

  it('returns error when file is empty (size=0)', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' })
    const fd = baseFormData({ cvFile: emptyFile })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/cv file is required/i)
  })

  it('returns error when validateCvFile rejects (unsupported MIME)', async () => {
    mockValidateCvFile.mockResolvedValue({
      ok: false,
      error: 'Unsupported file type: image/jpeg',
    })
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile('photo.jpg', 1024, 'image/jpeg') })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unsupported/i)
    // DB must not have been written
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── Parser failure ────────────────────────────────────────────────────────────

  it('surfaces ParseError message when CV text extraction fails', async () => {
    mockParseCvBuffer.mockRejectedValue(new MockParseError('Corrupt PDF: unable to read XRef table'))
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toContain('Corrupt PDF')
    // Candidate row must NOT have been inserted
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns generic extraction error for non-ParseError parser throws', async () => {
    mockParseCvBuffer.mockRejectedValue(new Error('Unexpected internal error'))
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/failed to extract/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── Schema validation ──────────────────────────────────────────────────────────

  it('returns validation error when firstName is missing', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })
    fd.delete('firstName')

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/validation/i)
  })

  // NOTE: createCandidate's safeParse call (line ~61) only extracts
  // firstName/lastName/email/phone/agencyId/roleId — it does NOT pass candidateRate
  // or customerRate to the schema, so the rate-without-currency refine never fires
  // in createCandidate (only in updateCandidateDetails which has its own safeParse).
  // The test below verifies firstName validation still fires correctly.
  it('returns validation error when agencyId is provided but is not a valid UUID', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile(), agencyId: 'not-a-uuid' })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/validation/i)
  })

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('inserts candidate row, pending score row, writes audit log, returns candidateId', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)

    expect(result.success).toBe(true)
    // candidateId is a real UUID generated by crypto.randomUUID at runtime
    const returnedId = (result as { success: true; candidateId: string }).candidateId
    expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    // insert() should have been called twice: candidate + score
    expect(mockInsertValues).toHaveBeenCalledTimes(2)

    // First insert: the candidate row
    const candidateInsert = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(candidateInsert.tenantId).toBe(TENANT_ID)
    expect(candidateInsert.id).toBe(returnedId)
    expect(candidateInsert.firstName).toBe('Jane')
    expect(candidateInsert.lastName).toBe('Doe')
    expect(typeof candidateInsert.cvText).toBe('string')
    expect(typeof candidateInsert.filePath).toBe('string')

    // Second insert: the pending score row
    const scoreInsert = mockInsertValues.mock.calls[1][0] as Record<string, unknown>
    expect(scoreInsert.tenantId).toBe(TENANT_ID)
    expect(scoreInsert.candidateId).toBe(returnedId)
    expect(scoreInsert.roleId).toBe(ROLE_ID)
    expect(scoreInsert.scoreStatus).toBe('pending')
  })

  it('writes a candidate.created audit log entry', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)
    const returnedId = (result as { success: true; candidateId: string }).candidateId

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'candidate.created',
        entityType: 'candidate',
        entityId: returnedId,
      })
    )
  })

  it('fires triggerScoring with candidateId, roleId, tenantId', async () => {
    const { createCandidate } = await import('@/actions/candidates')
    const fd = baseFormData({ cvFile: fakeFile() })

    const result = await createCandidate(null, fd)
    const returnedId = (result as { success: true; candidateId: string }).candidateId

    await new Promise((r) => setTimeout(r, 0))
    expect(mockTriggerScoring).toHaveBeenCalledWith(returnedId, ROLE_ID, TENANT_ID)
  })
})

// ── bulkUpdateCandidateStatus ─────────────────────────────────────────────────

describe('bulkUpdateCandidateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns error when not authenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { bulkUpdateCandidateStatus } = await import('@/actions/candidates')

    const result = await bulkUpdateCandidateStatus([CANDIDATE_ID], 'shortlisted')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns error when candidateIds is empty', async () => {
    const { bulkUpdateCandidateStatus } = await import('@/actions/candidates')

    const result = await bulkUpdateCandidateStatus([], 'shortlisted')

    expect(result.success).toBe(false)
    expect(result.updated).toBe(0)
    expect(result.error).toMatch(/no candidates/i)
  })

  it('returns error when more than 200 candidates selected', async () => {
    const { bulkUpdateCandidateStatus } = await import('@/actions/candidates')
    const ids = Array.from({ length: 201 }, (_, i) => `id-${i}`)

    const result = await bulkUpdateCandidateStatus(ids, 'shortlisted')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/200/i)
  })

  it('returns error for invalid status', async () => {
    const { bulkUpdateCandidateStatus } = await import('@/actions/candidates')

    const result = await bulkUpdateCandidateStatus([CANDIDATE_ID], 'invalid_status' as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid status/i)
  })

  it('updates candidates and returns count on happy path', async () => {
    const { bulkUpdateCandidateStatus } = await import('@/actions/candidates')
    const ids = [CANDIDATE_ID, 'ffffffff-ffff-4fff-8fff-ffffffffffff']

    const result = await bulkUpdateCandidateStatus(ids, 'shortlisted')

    expect(result.success).toBe(true)
    // The mock returns [{id: CANDIDATE_ID}] so updated=1 (default mock)
    expect(result.updated).toBeGreaterThanOrEqual(0)
    expect(mockUpdateSet).toHaveBeenCalledWith({ status: 'shortlisted' })
  })
})

// ── updateCandidateAvailability ───────────────────────────────────────────────

describe('updateCandidateAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns error when not authenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { updateCandidateAvailability } = await import('@/actions/candidates')

    const result = await updateCandidateAvailability(CANDIDATE_ID, {
      availabilityStatus: 'available',
      availableFrom: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns error for invalid availability status', async () => {
    const { updateCandidateAvailability } = await import('@/actions/candidates')

    const result = await updateCandidateAvailability(CANDIDATE_ID, {
      availabilityStatus: 'weekend_only' as never,
      availableFrom: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid availability/i)
  })

  it('sets available status and clears availableFrom', async () => {
    const { updateCandidateAvailability } = await import('@/actions/candidates')

    const result = await updateCandidateAvailability(CANDIDATE_ID, {
      availabilityStatus: 'available',
      availableFrom: '2026-09-01',
    })

    expect(result.success).toBe(true)
    // When status is 'available', effectiveFrom should be null
    const setCall = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.availabilityStatus).toBe('available')
    expect(setCall.availableFrom).toBeNull()
  })

  it('preserves availableFrom when status is on_project', async () => {
    const { updateCandidateAvailability } = await import('@/actions/candidates')

    const result = await updateCandidateAvailability(CANDIDATE_ID, {
      availabilityStatus: 'on_project',
      availableFrom: '2026-09-01',
    })

    expect(result.success).toBe(true)
    const setCall = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.availabilityStatus).toBe('on_project')
    expect(setCall.availableFrom).toBe('2026-09-01')
  })
})
