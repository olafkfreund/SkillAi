/**
 * Unit tests for src/actions/customers.ts — createCustomer and updateCustomer.
 *
 * Focuses on the roleIdLabel field added in issue #140.
 *
 * Mocks:
 *   @/db (withTenant)          — controls all DB interaction
 *   @/lib/auth/action-context  — provides synthetic recruiter context
 *   next/cache (revalidatePath) — silenced
 *   next/navigation (redirect)  — silenced (createCustomer / updateCustomer redirect)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID   = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID     = 'bbbbbbbb-0000-0000-0000-000000000002'
const CUSTOMER_ID = 'cccccccc-0000-0000-0000-000000000003'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/cache',      () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockInsertValues = vi.fn().mockResolvedValue(undefined)
const mockUpdateSet    = vi.fn()
const mockUpdateWhere  = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
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
  customers: {
    id:           'id',
    tenantId:     'tenant_id',
    name:         'name',
    contactName:  'contact_name',
    contactEmail: 'contact_email',
    contactPhone: 'contact_phone',
    website:      'website',
    portalBaseUrl: 'portal_base_url',
    roleIdLabel:  'role_id_label',
    notes:        'notes',
    isActive:     'is_active',
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

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('name', overrides.name ?? 'Acme Corp')
  for (const [k, v] of Object.entries(overrides)) {
    if (k !== 'name') fd.set(k, v)
  }
  return fd
}

// ── createCustomer — roleIdLabel ─────────────────────────────────────────────

describe('createCustomer — roleIdLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('accepts a valid roleIdLabel and includes it in the insert values', async () => {
    const { createCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: 'Project Code' })

    // createCustomer calls redirect() at the end — that is mocked to no-op
    try {
      await createCustomer(null, fd)
    } catch {
      // redirect() may throw in test environment — that is fine
    }

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const valuesArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(valuesArg.roleIdLabel).toBe('Project Code')
  })

  it('trims whitespace around roleIdLabel', async () => {
    const { createCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: '  PO Number  ' })

    try {
      await createCustomer(null, fd)
    } catch {
      // redirect no-op
    }

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const valuesArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    // Zod .trim() normalises to 'PO Number'
    expect(valuesArg.roleIdLabel).toBe('PO Number')
  })

  it('converts empty-string roleIdLabel to null', async () => {
    const { createCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: '' })

    try {
      await createCustomer(null, fd)
    } catch {
      // redirect no-op
    }

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const valuesArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(valuesArg.roleIdLabel).toBeNull()
  })

  it('rejects a roleIdLabel longer than 60 characters', async () => {
    const { createCustomer } = await import('@/actions/customers')
    const tooLong = 'L'.repeat(61)
    const fd = baseFormData({ roleIdLabel: tooLong })

    let result: Awaited<ReturnType<typeof createCustomer>> | undefined
    try {
      result = await createCustomer(null, fd)
    } catch {
      // redirect no-op
    }

    // If validation fails the action returns early with success: false before
    // calling redirect, so result is defined
    expect(result).toBeDefined()
    expect(result!.success).toBe(false)
    expect(result!.error).toMatch(/validation/i)
  })

  it('accepts a roleIdLabel of exactly 60 characters', async () => {
    const { createCustomer } = await import('@/actions/customers')
    const exactly60 = 'C'.repeat(60)
    const fd = baseFormData({ roleIdLabel: exactly60 })

    try {
      await createCustomer(null, fd)
    } catch {
      // redirect no-op
    }

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const valuesArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(valuesArg.roleIdLabel).toBe(exactly60)
  })

  it('returns forbidden when the caller is not at least a recruiter', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { createCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: 'PO' })

    const result = await createCustomer(null, fd)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/forbidden/i)
  })
})

// ── updateCustomer — roleIdLabel ─────────────────────────────────────────────

describe('updateCustomer — roleIdLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('round-trips roleIdLabel: update sets the new value via update().set()', async () => {
    const { updateCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: 'Purchase Order' })

    try {
      await updateCustomer(CUSTOMER_ID, null, fd)
    } catch {
      // redirect no-op
    }

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.roleIdLabel).toBe('Purchase Order')
  })

  it('clears roleIdLabel to null when empty string is passed', async () => {
    const { updateCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: '' })

    try {
      await updateCustomer(CUSTOMER_ID, null, fd)
    } catch {
      // redirect no-op
    }

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.roleIdLabel).toBeNull()
  })

  it('rejects a roleIdLabel longer than 60 characters in updateCustomer', async () => {
    const { updateCustomer } = await import('@/actions/customers')
    const tooLong = 'M'.repeat(61)
    const fd = baseFormData({ roleIdLabel: tooLong })

    let result: Awaited<ReturnType<typeof updateCustomer>> | undefined
    try {
      result = await updateCustomer(CUSTOMER_ID, null, fd)
    } catch {
      // redirect no-op
    }

    expect(result).toBeDefined()
    expect(result!.success).toBe(false)
    expect(result!.error).toMatch(/validation/i)
  })

  it('returns forbidden when the caller is a viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { updateCustomer } = await import('@/actions/customers')
    const fd = baseFormData({ roleIdLabel: 'PO' })

    const result = await updateCustomer(CUSTOMER_ID, null, fd)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/forbidden/i)
  })
})
