/**
 * Unit tests for src/actions/agencies.ts
 *
 * Covers:
 *   createAgency  — happy path, auth error, schema validation errors
 *   updateAgency  — happy path, auth error, schema validation errors
 *   archiveAgency — happy path, auth error, agency not found,
 *                   system agency protection (DEC-010)
 *
 * Mocks:
 *   @/db                          — withTenant (stateful per-call)
 *   @/db/schema                   — agencies table stub
 *   drizzle-orm                   — eq / and pass-throughs
 *   @/lib/auth/action-context     — getActionContext
 *   next/navigation               — redirect silenced
 *
 * NOTE: createAgency and updateAgency call redirect() on success, which
 * next/navigation will throw a NEXT_REDIRECT error in the real runtime. In
 * tests, redirect is mocked as a no-op, so the actions return normally.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const AGENCY_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const USER_ID   = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'

// ── Chainable mock builder ────────────────────────────────────────────────────

/**
 * Returns a thenable chain that resolves to `rows`.
 * Supports: .select().from().where().limit()
 */
function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then  = resolved.then.bind(resolved)
  c.catch = resolved.catch.bind(resolved)
  c.from  = vi.fn(() => c)
  c.where = vi.fn(() => c)
  c.limit = vi.fn(() => Promise.resolve(rows))
  return c
}

// ── Per-test state ─────────────────────────────────────────────────────────────

// Controls what rows the agency lookup in archiveAgency returns.
// Each test sets this before importing/calling the action.
let agencyLookupRows: unknown[] = []

// Captured mutation calls
const mockInsertValues = vi.fn()
const mockUpdateSet    = vi.fn()
const mockUpdateWhere  = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => makeSelectChain(agencyLookupRows)),

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
      }

      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  agencies: {
    id:       'id',
    tenantId: 'tenant_id',
    name:     'name',
    isActive: 'is_active',
    isSystem: 'is_system',
    logoPath: 'logo_path',
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

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v)
  }
  return fd
}

function validAgencyForm(overrides: Record<string, string> = {}): FormData {
  return makeFormData({
    name:         'Apex Recruitment',
    contactEmail: 'hello@apex.io',
    contactPhone: '+441234567890',
    notes:        'Great agency',
    ...overrides,
  })
}

// ── createAgency ──────────────────────────────────────────────────────────────

describe('createAgency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agencyLookupRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('throws when there is no action context (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { createAgency } = await import('@/actions/agencies')

    await expect(createAgency(null, validAgencyForm())).rejects.toThrow(/not authenticated/i)
  })

  it('inserts a new agency row on happy path', async () => {
    const { createAgency } = await import('@/actions/agencies')

    await createAgency(null, validAgencyForm())

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.name).toBe('Apex Recruitment')
    expect(insertArg.contactEmail).toBe('hello@apex.io')
  })

  it('returns a validation error when name is empty', async () => {
    const { createAgency } = await import('@/actions/agencies')
    const fd = validAgencyForm({ name: '' })

    const result = await createAgency(null, fd)

    expect(result.error).toBeTruthy()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns a validation error when contactEmail is malformed', async () => {
    const { createAgency } = await import('@/actions/agencies')
    const fd = validAgencyForm({ contactEmail: 'not-an-email' })

    const result = await createAgency(null, fd)

    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/email/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('does not set contactEmail on the row when an empty string is submitted', async () => {
    const { createAgency } = await import('@/actions/agencies')
    const fd = validAgencyForm({ contactEmail: '' })

    await createAgency(null, fd)

    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.contactEmail).toBeNull()
  })
})

// ── updateAgency ──────────────────────────────────────────────────────────────

describe('updateAgency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agencyLookupRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('throws when there is no action context (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { updateAgency } = await import('@/actions/agencies')

    await expect(updateAgency(AGENCY_ID, null, validAgencyForm())).rejects.toThrow(/not authenticated/i)
  })

  it('calls update.set with the correct fields on happy path', async () => {
    const { updateAgency } = await import('@/actions/agencies')

    await updateAgency(AGENCY_ID, null, validAgencyForm({ name: 'Updated Name' }))

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.name).toBe('Updated Name')
  })

  it('returns a validation error when name is empty', async () => {
    const { updateAgency } = await import('@/actions/agencies')

    const result = await updateAgency(AGENCY_ID, null, validAgencyForm({ name: '' }))

    expect(result.error).toBeTruthy()
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('returns a validation error when name exceeds 150 chars', async () => {
    const { updateAgency } = await import('@/actions/agencies')
    const longName = 'A'.repeat(151)

    const result = await updateAgency(AGENCY_ID, null, validAgencyForm({ name: longName }))

    expect(result.error).toBeTruthy()
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })
})

// ── archiveAgency ─────────────────────────────────────────────────────────────

describe('archiveAgency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agencyLookupRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('throws when there is no action context (unauthenticated)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { archiveAgency } = await import('@/actions/agencies')

    await expect(archiveAgency(AGENCY_ID)).rejects.toThrow(/not authenticated/i)
  })

  it('throws when agency does not exist in the tenant', async () => {
    agencyLookupRows = [] // empty — agency not found
    const { archiveAgency } = await import('@/actions/agencies')

    await expect(archiveAgency(AGENCY_ID)).rejects.toThrow(/agency not found/i)
  })

  it('throws when the agency has isSystem=true (DEC-010 protection)', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, isSystem: true }]
    const { archiveAgency } = await import('@/actions/agencies')

    await expect(archiveAgency(AGENCY_ID)).rejects.toThrow(/system agencies cannot be archived/i)
  })

  it('sets isActive=false on a normal (non-system) agency', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, isSystem: false }]
    const { archiveAgency } = await import('@/actions/agencies')

    await archiveAgency(AGENCY_ID)

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.isActive).toBe(false)
  })

  it('does not call update when the agency is a system agency', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, isSystem: true }]
    const { archiveAgency } = await import('@/actions/agencies')

    await expect(archiveAgency(AGENCY_ID)).rejects.toThrow()

    expect(mockUpdateSet).not.toHaveBeenCalled()
  })
})
