/**
 * Unit tests for src/actions/frameworks.ts
 *
 * Covers:
 *   saveCustomerFramework — unauthenticated, viewer/hiring_manager role gate,
 *     invalid JSON levels, schema validation (name missing, empty levels),
 *     happy path (insert/upsert called with correct values).
 *
 *   deleteCustomerFramework — unauthenticated (no-op), non-admin throws,
 *     happy path (roles cleared + framework deleted + redirect).
 *
 *   getCustomerFramework — returns framework when found, null when not found.
 *
 * Mocks:
 *   @/db                     — withTenant
 *   @/db/schema              — customerFrameworks, roles stubs
 *   drizzle-orm              — eq / and pass-throughs
 *   @/lib/auth/action-context — getActionContext
 *   next/cache               — revalidatePath silenced
 *   next/navigation          — redirect silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CUSTOMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_LEVELS = JSON.stringify([
  { id: 'L1', code: 'junior', title: 'Junior', description: 'Entry level', order: 1 },
  { id: 'L2', code: 'senior', title: 'Senior', description: 'Experienced', order: 2 },
])

const FRAMEWORK_ROW = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  tenantId: TENANT_ID,
  customerId: CUSTOMER_ID,
  name: 'Engineering Levels',
  description: 'Standard levels',
  levels: JSON.parse(VALID_LEVELS),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then      = resolved.then.bind(resolved)
  c.catch     = resolved.catch.bind(resolved)
  c.from      = vi.fn(() => c)
  c.where     = vi.fn(() => c)
  c.limit     = vi.fn(() => Promise.resolve(rows))
  return c
}

// ── Per-test captured calls ───────────────────────────────────────────────────

const mockInsertValues         = vi.fn()
const mockOnConflictDoUpdate   = vi.fn()
const mockUpdateSet            = vi.fn()
const mockUpdateWhere          = vi.fn()
const mockDeleteWhere          = vi.fn()

// Controls select() return value per withTenant call index
let withTenantSelectRows: unknown[] = []

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => makeSelectChain(withTenantSelectRows)),

        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return {
              onConflictDoUpdate: (...ocdArgs: unknown[]) => {
                mockOnConflictDoUpdate(...ocdArgs)
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
  customerFrameworks: {
    id: 'id', tenantId: 'tenant_id', customerId: 'customer_id',
    name: 'name', description: 'description', levels: 'levels', updatedAt: 'updated_at',
  },
  roles: {
    id: 'id', tenantId: 'tenant_id', customerId: 'customer_id',
    frameworkLevelId: 'framework_level_id', frameworkLevelLabel: 'framework_level_label',
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

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

// redirect() throws in Next.js (redirects via thrown NEXT_REDIRECT error).
// We just capture it.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function adminCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'admin' as const }
}

function makeFormData(overrides: Record<string, string | null> = {}): FormData {
  const fd = new FormData()
  fd.set('name', 'Engineering Levels')
  fd.set('description', 'Standard engineering framework')
  fd.set('levels', VALID_LEVELS)
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) fd.delete(k)
    else fd.set(k, v)
  }
  return fd
}

// ── saveCustomerFramework ─────────────────────────────────────────────────────

describe('saveCustomerFramework', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantSelectRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  // ── Auth + role gates ─────────────────────────────────────────────────────

  it('returns error when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveCustomerFramework } = await import('@/actions/frameworks')

    const result = await saveCustomerFramework(CUSTOMER_ID, null, makeFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not authenticated/i)
  })

  it('returns error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const,
    })
    const { saveCustomerFramework } = await import('@/actions/frameworks')

    const result = await saveCustomerFramework(CUSTOMER_ID, null, makeFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/forbidden/i)
  })

  it('returns error when role is hiring_manager', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'hiring_manager' as const,
    })
    const { saveCustomerFramework } = await import('@/actions/frameworks')

    const result = await saveCustomerFramework(CUSTOMER_ID, null, makeFormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/forbidden/i)
  })

  // ── Validation errors ─────────────────────────────────────────────────────

  it('returns error when levels JSON is malformed', async () => {
    const { saveCustomerFramework } = await import('@/actions/frameworks')
    const fd = makeFormData({ levels: 'not-valid-json{' })

    const result = await saveCustomerFramework(CUSTOMER_ID, null, fd)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid levels data/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns fieldErrors when name is empty', async () => {
    const { saveCustomerFramework } = await import('@/actions/frameworks')
    const fd = makeFormData({ name: '' })

    const result = await saveCustomerFramework(CUSTOMER_ID, null, fd)

    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns fieldErrors when levels array is empty', async () => {
    const { saveCustomerFramework } = await import('@/actions/frameworks')
    const fd = makeFormData({ levels: '[]' })

    const result = await saveCustomerFramework(CUSTOMER_ID, null, fd)

    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('inserts framework with upsert and returns success', async () => {
    const { saveCustomerFramework } = await import('@/actions/frameworks')

    const result = await saveCustomerFramework(CUSTOMER_ID, null, makeFormData())

    expect(result.success).toBe(true)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.customerId).toBe(CUSTOMER_ID)
    expect(insertArg.name).toBe('Engineering Levels')
    expect(Array.isArray(insertArg.levels)).toBe(true)
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
  })

  it('calls revalidatePath for the customer page on success', async () => {
    const { saveCustomerFramework } = await import('@/actions/frameworks')

    await saveCustomerFramework(CUSTOMER_ID, null, makeFormData())

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/customers/${CUSTOMER_ID}`)
  })

  it('succeeds for admin role', async () => {
    mockGetActionContext.mockResolvedValue(adminCtx())
    const { saveCustomerFramework } = await import('@/actions/frameworks')

    const result = await saveCustomerFramework(CUSTOMER_ID, null, makeFormData())

    expect(result.success).toBe(true)
  })
})

// ── deleteCustomerFramework ───────────────────────────────────────────────────

describe('deleteCustomerFramework', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantSelectRows = []
    mockGetActionContext.mockResolvedValue(adminCtx())
  })

  it('does nothing (no throw) when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { deleteCustomerFramework } = await import('@/actions/frameworks')

    await expect(deleteCustomerFramework(CUSTOMER_ID)).resolves.toBeUndefined()
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('throws Forbidden when role is recruiter (below admin)', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { deleteCustomerFramework } = await import('@/actions/frameworks')

    await expect(deleteCustomerFramework(CUSTOMER_ID)).rejects.toThrow(/forbidden/i)
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('throws Forbidden when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const,
    })
    const { deleteCustomerFramework } = await import('@/actions/frameworks')

    await expect(deleteCustomerFramework(CUSTOMER_ID)).rejects.toThrow(/forbidden/i)
  })

  it('clears frameworkLevelId from roles and deletes framework, then redirects', async () => {
    const { deleteCustomerFramework } = await import('@/actions/frameworks')

    await expect(deleteCustomerFramework(CUSTOMER_ID)).rejects.toThrow('NEXT_REDIRECT')

    // update() should have been called to clear the role framework references
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const updateSetArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(updateSetArg.frameworkLevelId).toBeNull()
    expect(updateSetArg.frameworkLevelLabel).toBeNull()

    // delete() should have been called to remove the framework
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('calls revalidatePath for the customer page', async () => {
    const { deleteCustomerFramework } = await import('@/actions/frameworks')

    await expect(deleteCustomerFramework(CUSTOMER_ID)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/dashboard/customers/${CUSTOMER_ID}`)
  })
})

// ── getCustomerFramework ──────────────────────────────────────────────────────

describe('getCustomerFramework', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withTenantSelectRows = []
  })

  it('returns the framework row when found', async () => {
    withTenantSelectRows = [FRAMEWORK_ROW]
    const { getCustomerFramework } = await import('@/actions/frameworks')

    const result = await getCustomerFramework(CUSTOMER_ID, TENANT_ID)

    expect(result).toMatchObject({
      id: FRAMEWORK_ROW.id,
      name: 'Engineering Levels',
      customerId: CUSTOMER_ID,
      tenantId: TENANT_ID,
    })
  })

  it('returns null when no framework exists for the customer', async () => {
    withTenantSelectRows = []
    const { getCustomerFramework } = await import('@/actions/frameworks')

    const result = await getCustomerFramework(CUSTOMER_ID, TENANT_ID)

    expect(result).toBeNull()
  })
})
