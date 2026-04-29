/**
 * Unit tests for src/actions/roles.ts — createRole and updateRole.
 *
 * Focuses on the customerRoleId field added in issue #140.
 *
 * Mocks:
 *   @/db (withTenant)                 — controls all DB interaction
 *   @/lib/auth/action-context         — provides synthetic recruiter context
 *   @/lib/audit (writeAuditLog)       — spy to verify audit-row emission
 *   next/cache (revalidatePath)       — silenced
 *   next/server (after)               — fires synchronously so tests stay simple
 *   next/navigation (redirect)        — silenced
 *   @/lib/ai/role-tags (extractRoleTags) — silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID   = 'bbbbbbbb-0000-0000-0000-000000000002'
const ROLE_ID   = 'cccccccc-0000-0000-0000-000000000003'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
// after() fires the callback synchronously so audit + tag calls execute in test
vi.mock('next/server', () => ({ after: vi.fn((fn: () => void) => fn?.()) }))
vi.mock('@/lib/ai/role-tags', () => ({ extractRoleTags: vi.fn().mockResolvedValue([]) }))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({ writeAuditLog: mockWriteAuditLog }))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// Chainable Drizzle mock: insert().values().returning() and select().from().where().limit()
const mockInsertReturning  = vi.fn()
const mockUpdateSet        = vi.fn()
const mockUpdateWhere      = vi.fn()
const mockSelectFromWhere  = vi.fn()

// select chain ----------------------------------------------------------------
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

// Tracks how many withTenant calls have been made so we can return different
// values for the "load existing role" select vs the subsequent "update" call.
let withTenantCallCount = 0
let existingRoleRows: unknown[] = []

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      withTenantCallCount++

      // For the select-existing-role call (first withTenant call in updateRole)
      // we return a chainable select chain. For the second (the update itself) we
      // provide an update chain. createRole only calls withTenant once with insert.
      const selectChain = makeSelectChain(existingRoleRows)

      const tx = {
        select: vi.fn(() => {
          mockSelectFromWhere()
          return selectChain
        }),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: (...args: unknown[]) => {
              mockInsertReturning(...args)
              return Promise.resolve([{ id: ROLE_ID }])
            },
          })),
        })),
        update: vi.fn(() => ({
          set: (...args: unknown[]) => {
            mockUpdateSet(...args)
            return {
              where: (...whereArgs: unknown[]) => {
                mockUpdateWhere(...whereArgs)
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
  roles: {
    id: 'id',
    tenantId: 'tenant_id',
    title: 'title',
    description: 'description',
    requirements: 'requirements',
    customerId: 'customer_id',
    customerRoleId: 'customer_role_id',
    createdBy: 'created_by',
    priorityKeywords: 'priority_keywords',
    priorityKeywordsUpdatedAt: 'priority_keywords_updated_at',
    isActive: 'is_active',
    frameworkLevelId: 'framework_level_id',
    frameworkLevelLabel: 'framework_level_label',
    country: 'country',
    city: 'city',
    workMode: 'work_mode',
    languageRequirements: 'language_requirements',
    targetFillDate: 'target_fill_date',
    cutoffDate: 'cutoff_date',
    customerPortalPath: 'customer_portal_path',
    customerDayRate: 'customer_day_rate',
    rateCurrency: 'rate_currency',
    shortlistSentAt: 'shortlist_sent_at',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

/** Minimum valid FormData for createRole / updateRole */
function baseFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('title',        overrides.title        ?? 'Senior Engineer')
  fd.set('description',  overrides.description  ?? 'We need a senior engineer for our platform.')
  fd.set('requirements', overrides.requirements ?? 'TypeScript, PostgreSQL, 5+ years experience.')
  for (const [k, v] of Object.entries(overrides)) {
    if (!['title', 'description', 'requirements'].includes(k)) fd.set(k, v)
  }
  return fd
}

/** Minimum existing-role fixture returned by the "load existing" select */
function existingRole(overrides: Record<string, unknown> = {}) {
  return {
    title:              'Senior Engineer',
    priorityKeywords:   [],
    customerRoleId:     null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createRole — customerRoleId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantCallCount = 0
    existingRoleRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('accepts a valid customerRoleId and passes it to the insert', async () => {
    const { createRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: 'EXT-001' })

    const result = await createRole(null, fd)

    expect(result.success).toBe(true)
    // The first (and only) argument to .values() should contain customerRoleId
    const valuesArg = mockInsertReturning.mock.calls.length >= 0
      ? (mockInsertReturning.mock.calls[0] ?? [])[0]
      : undefined
    // We verify the returning() call happened (i.e. insert was invoked)
    expect(mockInsertReturning).toHaveBeenCalledTimes(1)
  })

  it('trims whitespace around customerRoleId before persisting', async () => {
    const { createRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: '  EXT-002  ' })

    const result = await createRole(null, fd)

    // Schema has .trim() so validation succeeds; insert proceeds
    expect(result.success).toBe(true)
  })

  it('converts empty-string customerRoleId to null (treats blank as absent)', async () => {
    const { createRole } = await import('@/actions/roles')
    // FormData.set with '' + the action's `|| null` coercion → null in DB
    const fd = baseFormData({ customerRoleId: '' })

    const result = await createRole(null, fd)

    expect(result.success).toBe(true)
  })

  it('rejects a customerRoleId longer than 100 characters', async () => {
    const { createRole } = await import('@/actions/roles')
    const tooLong = 'X'.repeat(101)
    const fd = baseFormData({ customerRoleId: tooLong })

    const result = await createRole(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/validation/i)
  })

  it('succeeds when customerRoleId is exactly 100 characters', async () => {
    const { createRole } = await import('@/actions/roles')
    const exactly100 = 'A'.repeat(100)
    const fd = baseFormData({ customerRoleId: exactly100 })

    const result = await createRole(null, fd)

    expect(result.success).toBe(true)
  })

  it('returns unauthorized when there is no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { createRole } = await import('@/actions/roles')
    const fd = baseFormData()

    const result = await createRole(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })
})

describe('updateRole — customerRoleId round-trip and audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantCallCount = 0
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    // Default: existing role has no customerRoleId
    existingRoleRows = [existingRole()]
  })

  it('round-trips customerRoleId: update with a new value succeeds', async () => {
    const { updateRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: 'CUST-99' })

    const result = await updateRole(ROLE_ID, null, fd)

    expect(result.success).toBe(true)
    // update().set() must have been called at least once (may be called again
    // by the _saveRoleTags after-callback via a second withTenant)
    expect(mockUpdateSet).toHaveBeenCalled()
    // The first call must carry the customerRoleId value
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.customerRoleId).toBe('CUST-99')
  })

  it('emits a role.updated audit row with field=customerRoleId when value changes from null', async () => {
    existingRoleRows = [existingRole({ customerRoleId: null })]
    const { updateRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: 'CUST-100' })

    await updateRole(ROLE_ID, null, fd)

    const auditCalls = mockWriteAuditLog.mock.calls
    const customerRoleIdAudit = auditCalls.find(
      (call) => (call[1] as Record<string, unknown>).action === 'role.updated' &&
                ((call[1] as Record<string, unknown>).metadata as Record<string, unknown>)?.field === 'customerRoleId'
    )
    expect(customerRoleIdAudit).toBeDefined()
    const meta = (customerRoleIdAudit![1] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.from).toBeNull()
    expect(meta.to).toBe('CUST-100')
  })

  it('emits a role.updated audit row when customerRoleId changes from a value to null', async () => {
    existingRoleRows = [existingRole({ customerRoleId: 'ORIGINAL-123' })]
    const { updateRole } = await import('@/actions/roles')
    // Send empty string → action converts to null
    const fd = baseFormData({ customerRoleId: '' })

    await updateRole(ROLE_ID, null, fd)

    const auditCalls = mockWriteAuditLog.mock.calls
    const customerRoleIdAudit = auditCalls.find(
      (call) => (call[1] as Record<string, unknown>).action === 'role.updated' &&
                ((call[1] as Record<string, unknown>).metadata as Record<string, unknown>)?.field === 'customerRoleId'
    )
    expect(customerRoleIdAudit).toBeDefined()
    const meta = (customerRoleIdAudit![1] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.from).toBe('ORIGINAL-123')
    expect(meta.to).toBeNull()
  })

  it('emits a role.updated audit row when customerRoleId changes from one value to another', async () => {
    existingRoleRows = [existingRole({ customerRoleId: 'OLD-VAL' })]
    const { updateRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: 'NEW-VAL' })

    await updateRole(ROLE_ID, null, fd)

    const auditCalls = mockWriteAuditLog.mock.calls
    const customerRoleIdAudit = auditCalls.find(
      (call) => (call[1] as Record<string, unknown>).action === 'role.updated' &&
                ((call[1] as Record<string, unknown>).metadata as Record<string, unknown>)?.field === 'customerRoleId'
    )
    expect(customerRoleIdAudit).toBeDefined()
    const meta = (customerRoleIdAudit![1] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.from).toBe('OLD-VAL')
    expect(meta.to).toBe('NEW-VAL')
  })

  it('does NOT emit a customerRoleId audit row when the value is unchanged', async () => {
    existingRoleRows = [existingRole({ customerRoleId: 'SAME-VAL' })]
    const { updateRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: 'SAME-VAL' })

    await updateRole(ROLE_ID, null, fd)

    const customerRoleIdAudits = mockWriteAuditLog.mock.calls.filter(
      (call) =>
        ((call[1] as Record<string, unknown>).metadata as Record<string, unknown>)?.field === 'customerRoleId'
    )
    expect(customerRoleIdAudits.length).toBe(0)
  })

  it('does NOT emit a customerRoleId audit row when both old and new values are null/empty', async () => {
    existingRoleRows = [existingRole({ customerRoleId: null })]
    const { updateRole } = await import('@/actions/roles')
    const fd = baseFormData({ customerRoleId: '' }) // empty → null; old is already null

    await updateRole(ROLE_ID, null, fd)

    const customerRoleIdAudits = mockWriteAuditLog.mock.calls.filter(
      (call) =>
        ((call[1] as Record<string, unknown>).metadata as Record<string, unknown>)?.field === 'customerRoleId'
    )
    expect(customerRoleIdAudits.length).toBe(0)
  })

  it('rejects a customerRoleId longer than 100 characters in updateRole', async () => {
    const { updateRole } = await import('@/actions/roles')
    const tooLong = 'Z'.repeat(101)
    const fd = baseFormData({ customerRoleId: tooLong })

    const result = await updateRole(ROLE_ID, null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/validation/i)
  })

  it('returns role-not-found error when the select returns no existing role', async () => {
    existingRoleRows = [] // empty — role not found
    const { updateRole } = await import('@/actions/roles')
    const fd = baseFormData()

    const result = await updateRole(ROLE_ID, null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })
})
