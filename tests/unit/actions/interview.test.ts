/**
 * Unit tests for src/actions/interview.ts
 *
 * Covers:
 *   createInterviewPack  — auth gate, role gate (viewer/hiring_manager blocked),
 *                          validation (invalid UUID), candidate-not-found, happy path
 *                          (pack row inserted, packId returned).
 *   retryInterviewPack   — auth gate, pack-not-found, pack-already-complete guard,
 *                          happy path (status reset to pending).
 *   deleteInterviewPack  — auth gate, pack-not-found, happy path (row deleted).
 *   updateQuestionNotes  — auth gate, question-not-found, happy path (notes updated).
 *
 * Mocks:
 *   @/db                          — withTenant
 *   @/db/schema                   — candidates, interviewPacks, interviewQuestions stubs
 *   drizzle-orm                   — eq / and pass-throughs
 *   @/lib/auth/action-context     — getActionContext
 *   @/lib/ai/interview-helpers    — inferExperienceLevel (returns 'mid')
 *   next/cache                    — revalidatePath silenced
 *
 * Note: requireRole is NOT mocked — the real implementation is a pure function
 * with no I/O dependencies and its behaviour is load-bearing for the role-gate tests.
 *
 * Note: @/lib/ai/language is NOT mocked. The real SUPPORTED_LANGUAGES contains
 * 'en' which is used in all FormData fixtures, so no mock is necessary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

// UUIDs: v4 requires the variant nibble (first nibble of the 4th group) to be
// 8, 9, a, or b. All constants below satisfy this constraint.
const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROLE_ID      = '11111111-1111-4111-8111-111111111111'
const PACK_ID      = '22222222-2222-4222-8222-222222222222'
const QUESTION_ID  = '33333333-3333-4333-8333-333333333333'
const USER_ID      = '44444444-4444-4444-8444-444444444444'

// ── Chainable mock builder ────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then      = resolved.then.bind(resolved)
  c.catch     = resolved.catch.bind(resolved)
  c.from      = vi.fn(() => c)
  c.where     = vi.fn(() => c)
  c.limit     = vi.fn(() => Promise.resolve(rows))
  c.innerJoin = vi.fn(() => c)
  return c
}

// ── Per-test state ────────────────────────────────────────────────────────────

// Controls what withTenant select calls return.
// Many actions do a single select; selectQueue lets tests push multiple rows
// in sequence for actions that call select more than once.
type SelectFactory = () => ReturnType<typeof makeSelectChain>
let selectFactory: SelectFactory

const mockInsertValues = vi.fn()
const mockUpdateSet    = vi.fn()
const mockUpdateWhere  = vi.fn()
const mockDeleteWhere  = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => selectFactory()),

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

vi.mock('@/db/schema', () => ({
  candidates: {
    id:          'id',
    tenantId:    'tenant_id',
    cvText:      'cv_text',
  },
  interviewPacks: {
    id:               'id',
    tenantId:         'tenant_id',
    candidateId:      'candidate_id',
    generationStatus: 'generation_status',
    errorMessage:     'error_message',
    updatedAt:        'updated_at',
  },
  interviewQuestions: {
    id:      'id',
    packId:  'pack_id',
    notes:   'notes',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

vi.mock('@/lib/ai/interview-helpers', () => ({
  inferExperienceLevel: vi.fn().mockReturnValue('mid'),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function viewerCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const }
}

function hiringManagerCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'hiring_manager' as const }
}

/** Minimal valid FormData for createInterviewPack */
function basePackFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('candidateId', CANDIDATE_ID)
  fd.set('roleId', ROLE_ID)
  fd.set('packType', 'full')
  fd.set('language', 'en')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

/** A minimal candidate row */
function candidateRow() {
  return { id: CANDIDATE_ID, cvText: 'Senior TypeScript engineer with 8 years experience.' }
}

/** A minimal pack row that is still pending */
function pendingPackRow() {
  return { id: PACK_ID, candidateId: CANDIDATE_ID, generationStatus: 'pending' }
}

/** A pack row that has completed generation */
function completedPackRow() {
  return { id: PACK_ID, candidateId: CANDIDATE_ID, generationStatus: 'complete' }
}

/** A question row linked to PACK_ID */
function questionRow() {
  return { id: QUESTION_ID, packId: PACK_ID }
}

// ── createInterviewPack ───────────────────────────────────────────────────────

describe('createInterviewPack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    // Default: candidate exists
    selectFactory = () => makeSelectChain([candidateRow()])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { createInterviewPack } = await import('@/actions/interview')

    const result = await createInterviewPack(null, basePackFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns Forbidden when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue(viewerCtx())
    const { createInterviewPack } = await import('@/actions/interview')

    const result = await createInterviewPack(null, basePackFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns Forbidden when role is hiring_manager (rank 0.5 < recruiter rank 1)', async () => {
    mockGetActionContext.mockResolvedValue(hiringManagerCtx())
    const { createInterviewPack } = await import('@/actions/interview')

    const result = await createInterviewPack(null, basePackFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns Invalid input when candidateId is not a valid UUID', async () => {
    const { createInterviewPack } = await import('@/actions/interview')
    const fd = basePackFormData({ candidateId: 'not-a-uuid' })

    const result = await createInterviewPack(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid input/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns Candidate not found when select returns no rows', async () => {
    selectFactory = () => makeSelectChain([]) // no candidate
    const { createInterviewPack } = await import('@/actions/interview')

    const result = await createInterviewPack(null, basePackFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/candidate not found/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('inserts pack row with correct fields and returns packId on happy path', async () => {
    const { createInterviewPack } = await import('@/actions/interview')

    const result = await createInterviewPack(null, basePackFormData())

    expect(result.success).toBe(true)
    const packId = (result as { success: true; packId: string }).packId
    expect(packId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.tenantId).toBe(TENANT_ID)
    expect(arg.candidateId).toBe(CANDIDATE_ID)
    expect(arg.roleId).toBe(ROLE_ID)
    expect(arg.generationStatus).toBe('pending')
    expect(arg.packType).toBe('full')
    expect(arg.language).toBe('en')
    expect(arg.createdBy).toBe(USER_ID)
  })

  it('forces includesCodeChallenge=false when packType is pre_screening', async () => {
    const { createInterviewPack } = await import('@/actions/interview')
    const fd = basePackFormData({ packType: 'pre_screening', includeCodeChallenge: 'true' })

    await createInterviewPack(null, fd)

    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.includesCodeChallenge).toBe(false)
  })
})

// ── retryInterviewPack ────────────────────────────────────────────────────────

describe('retryInterviewPack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = () => makeSelectChain([pendingPackRow()])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { retryInterviewPack } = await import('@/actions/interview')

    const result = await retryInterviewPack(PACK_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns Pack not found when select returns no rows', async () => {
    selectFactory = () => makeSelectChain([])
    const { retryInterviewPack } = await import('@/actions/interview')

    const result = await retryInterviewPack(PACK_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('returns error when pack is already complete', async () => {
    selectFactory = () => makeSelectChain([completedPackRow()])
    const { retryInterviewPack } = await import('@/actions/interview')

    const result = await retryInterviewPack(PACK_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already complete/i)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('resets generationStatus to pending on happy path', async () => {
    const { retryInterviewPack } = await import('@/actions/interview')

    const result = await retryInterviewPack(PACK_ID)

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const arg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(arg.generationStatus).toBe('pending')
    expect(arg.errorMessage).toBeNull()
  })
})

// ── deleteInterviewPack ───────────────────────────────────────────────────────

describe('deleteInterviewPack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = () => makeSelectChain([{ candidateId: CANDIDATE_ID }])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { deleteInterviewPack } = await import('@/actions/interview')

    const result = await deleteInterviewPack(PACK_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns Pack not found when select returns no rows', async () => {
    selectFactory = () => makeSelectChain([])
    const { deleteInterviewPack } = await import('@/actions/interview')

    const result = await deleteInterviewPack(PACK_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('deletes pack row and returns success:true on happy path', async () => {
    const { deleteInterviewPack } = await import('@/actions/interview')

    const result = await deleteInterviewPack(PACK_ID)

    expect(result.success).toBe(true)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })
})

// ── updateQuestionNotes ───────────────────────────────────────────────────────

describe('updateQuestionNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = () => makeSelectChain([questionRow()])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { updateQuestionNotes } = await import('@/actions/interview')

    const result = await updateQuestionNotes(QUESTION_ID, 'my notes')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns Question not found when select returns no rows', async () => {
    selectFactory = () => makeSelectChain([])
    const { updateQuestionNotes } = await import('@/actions/interview')

    const result = await updateQuestionNotes(QUESTION_ID, 'my notes')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('updates notes field and returns success:true on happy path', async () => {
    const { updateQuestionNotes } = await import('@/actions/interview')

    const result = await updateQuestionNotes(QUESTION_ID, 'candidate answered well')

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const arg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(arg.notes).toBe('candidate answered well')
  })
})
