/**
 * Unit tests for src/actions/notes.ts
 *
 * Covers:
 *   createNote  — happy path, auth gate, role gate (viewer forbidden), body
 *                 validation (empty / too long), is_shareable flag persisted.
 *   updateNote  — happy path, auth gate, note-not-found, ownership guard
 *                 (non-author + non-admin blocked), is_shareable toggled.
 *   deleteNote  — happy path, auth gate, note-not-found, ownership guard.
 *
 * Mocks:
 *   @/db                          — withTenant
 *   @/db/schema                   — notes table stub
 *   drizzle-orm                   — eq / and pass-throughs
 *   @/lib/auth/action-context     — getActionContext
 *   next/cache                    — revalidatePath silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const NOTE_ID      = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const USER_ID      = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'
const OTHER_USER   = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'

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

// selectRows drives what withTenant select calls return (used by updateNote /
// deleteNote to simulate "note exists" / "note not found").
let selectRows: unknown[] = []

const mockInsertValues = vi.fn()
const mockUpdateSet    = vi.fn()
const mockUpdateWhere  = vi.fn()
const mockDeleteWhere  = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => makeSelectChain(selectRows)),

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
  notes: {
    id:          'id',
    tenantId:    'tenant_id',
    candidateId: 'candidate_id',
    authorId:    'author_id',
    body:        'body',
    isShareable: 'is_shareable',
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx(userId = USER_ID) {
  return { tenantId: TENANT_ID, userId, userRole: 'recruiter' as const }
}

function adminCtx(userId = USER_ID) {
  return { tenantId: TENANT_ID, userId, userRole: 'admin' as const }
}

function viewerCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const }
}

function hiringManagerCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'hiring_manager' as const }
}

/** A note row owned by USER_ID */
function ownedNote() {
  return { id: NOTE_ID, authorId: USER_ID, tenantId: TENANT_ID }
}

/** A note row owned by a different user */
function foreignNote() {
  return { id: NOTE_ID, authorId: OTHER_USER, tenantId: TENANT_ID }
}

// ── createNote ────────────────────────────────────────────────────────────────

describe('createNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { createNote } = await import('@/actions/notes')

    const result = await createNote(CANDIDATE_ID, 'A good note')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns Forbidden when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue(viewerCtx())
    const { createNote } = await import('@/actions/notes')

    const result = await createNote(CANDIDATE_ID, 'A good note')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when body is empty', async () => {
    const { createNote } = await import('@/actions/notes')

    const result = await createNote(CANDIDATE_ID, '')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/note cannot be empty/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns error when body exceeds 5000 chars', async () => {
    const { createNote } = await import('@/actions/notes')

    const result = await createNote(CANDIDATE_ID, 'x'.repeat(5001))

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/too long/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('inserts note with correct tenant + author + body on happy path', async () => {
    const { createNote } = await import('@/actions/notes')

    const result = await createNote(CANDIDATE_ID, 'Excellent communication skills')

    expect(result.success).toBe(true)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.tenantId).toBe(TENANT_ID)
    expect(arg.candidateId).toBe(CANDIDATE_ID)
    expect(arg.authorId).toBe(USER_ID)
    expect(arg.body).toBe('Excellent communication skills')
  })

  it('persists isShareable=true when caller passes true', async () => {
    const { createNote } = await import('@/actions/notes')

    await createNote(CANDIDATE_ID, 'Shareable note for HM', true)

    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.isShareable).toBe(true)
  })

  it('defaults isShareable=false when not provided', async () => {
    const { createNote } = await import('@/actions/notes')

    await createNote(CANDIDATE_ID, 'Private note')

    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.isShareable).toBe(false)
  })

  it('allows hiring_manager role to create notes (rank >= viewer, blocked only for viewer)', async () => {
    // hiring_manager (rank 0.5) is not viewer (rank 0) so must be allowed.
    mockGetActionContext.mockResolvedValue(hiringManagerCtx())
    const { createNote } = await import('@/actions/notes')

    const result = await createNote(CANDIDATE_ID, 'Manager note')

    // The action only blocks role === 'viewer', hiring_manager should succeed.
    expect(result.success).toBe(true)
  })
})

// ── updateNote ────────────────────────────────────────────────────────────────

describe('updateNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRows = [ownedNote()]
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, 'updated body')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns Forbidden when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue(viewerCtx())
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, 'updated body')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when note is not found (no DB row)', async () => {
    selectRows = [] // no note in tenant
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, 'updated body')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('returns error when body is empty', async () => {
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, '')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/note cannot be empty/i)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('returns Forbidden when non-author non-admin tries to update', async () => {
    // The stored note is owned by OTHER_USER, requester is USER_ID (recruiter, not admin)
    selectRows = [foreignNote()]
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, 'sneaky edit')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('allows admin to update another user\'s note', async () => {
    selectRows = [foreignNote()] // owned by OTHER_USER, but caller is admin
    mockGetActionContext.mockResolvedValue(adminCtx())
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, 'admin edit')

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
  })

  it('updates body and isShareable on happy path (author editing own note)', async () => {
    const { updateNote } = await import('@/actions/notes')

    const result = await updateNote(NOTE_ID, CANDIDATE_ID, 'new body text', true)

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.body).toBe('new body text')
    expect(setArg.isShareable).toBe(true)
    expect(setArg.isEdited).toBe(true)
  })
})

// ── deleteNote ────────────────────────────────────────────────────────────────

describe('deleteNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRows = [ownedNote()]
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { deleteNote } = await import('@/actions/notes')

    const result = await deleteNote(NOTE_ID, CANDIDATE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when note is not found', async () => {
    selectRows = []
    const { deleteNote } = await import('@/actions/notes')

    const result = await deleteNote(NOTE_ID, CANDIDATE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('returns Forbidden when non-author non-admin tries to delete', async () => {
    selectRows = [foreignNote()]
    const { deleteNote } = await import('@/actions/notes')

    const result = await deleteNote(NOTE_ID, CANDIDATE_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('deletes the note when called by the author', async () => {
    const { deleteNote } = await import('@/actions/notes')

    const result = await deleteNote(NOTE_ID, CANDIDATE_ID)

    expect(result.success).toBe(true)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('allows admin to delete another user\'s note', async () => {
    selectRows = [foreignNote()]
    mockGetActionContext.mockResolvedValue(adminCtx())
    const { deleteNote } = await import('@/actions/notes')

    const result = await deleteNote(NOTE_ID, CANDIDATE_ID)

    expect(result.success).toBe(true)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })
})
