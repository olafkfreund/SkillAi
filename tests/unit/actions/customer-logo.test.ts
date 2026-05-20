/**
 * Unit tests for src/actions/customer-logo.ts
 *
 * Covers:
 *   uploadCustomerLogo — happy path (new logo + audit log written), auth gate,
 *     role gate (viewer blocked), missing customerId, missing file,
 *     oversize file rejection, wrong MIME rejection, magic-byte mismatch,
 *     customer not found, old logo deleted after DB update
 *   removeCustomerLogo — happy path (logo_path cleared + audit), auth gate,
 *     role gate, customer not found, no logo_path to delete
 *
 * Mocks:
 *   @/db                          — withTenant (stateful select rows)
 *   @/db/schema                   — customers table stub
 *   drizzle-orm                   — eq / and pass-throughs
 *   @/lib/auth/action-context     — getActionContext
 *   @/lib/audit                   — writeAuditLog
 *   @/lib/auth/require-role       — real implementation used
 *   @/lib/branding/store          — validateLogoFile, persistLogo, deleteLogo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID   = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const CUSTOMER_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'
const USER_ID     = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const OLD_LOGO    = `/uploads/${TENANT_ID}/logos/old-uuid.png`
const NEW_LOGO    = `/uploads/${TENANT_ID}/logos/new-uuid.png`

// ── Chainable mock builder ────────────────────────────────────────────────────

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

// Controls what row the customer ownership check returns.
let customerLookupRows: unknown[] = []

// Captured mutation calls
const mockUpdateSet   = vi.fn()
const mockUpdateWhere = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => makeSelectChain(customerLookupRows)),

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
  customers: {
    id:       'id',
    tenantId: 'tenant_id',
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

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

// Branding store — all three helpers are mocked so no real disk I/O.
const mockValidateLogoFile = vi.fn()
const mockPersistLogo      = vi.fn()
const mockDeleteLogo       = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/branding/store', () => ({
  validateLogoFile: (...args: unknown[]) => mockValidateLogoFile(...args),
  persistLogo:      (...args: unknown[]) => mockPersistLogo(...args),
  deleteLogo:       (...args: unknown[]) => mockDeleteLogo(...args),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

/** Builds a minimal FormData with a customerId and a small PNG File. */
function validFormData(overrides: { customerId?: string; fileName?: string } = {}): FormData {
  const fd = new FormData()
  fd.set('customerId', overrides.customerId ?? CUSTOMER_ID)
  const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  fd.set('file', new File([buf], overrides.fileName ?? 'logo.png', { type: 'image/png' }))
  return fd
}

// ── uploadCustomerLogo ────────────────────────────────────────────────────────

describe('uploadCustomerLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    customerLookupRows = []
    // Default: validation passes, persist returns the new path
    mockValidateLogoFile.mockResolvedValue({ ok: true })
    mockPersistLogo.mockResolvedValue(NEW_LOGO)
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  // ── Auth / role gates ────────────────────────────────────────────────────────

  it('returns not-authenticated error when context is null', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not authenticated/i)
  })

  it('returns forbidden error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns forbidden error when role is hiring_manager', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'hiring_manager' as const,
    })
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── Input validation ─────────────────────────────────────────────────────────

  it('returns error when customerId is missing from FormData', async () => {
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')
    const fd = new FormData()
    // No customerId field
    fd.set('file', new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }))

    const result = await uploadCustomerLogo(fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/missing customerid/i)
  })

  it('returns error when file field is absent', async () => {
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')
    const fd = new FormData()
    fd.set('customerId', CUSTOMER_ID)
    // No file field

    const result = await uploadCustomerLogo(fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/missing or invalid file/i)
  })

  // ── File validation (delegated to validateLogoFile) ──────────────────────────

  it('returns error when file exceeds 2 MB', async () => {
    mockValidateLogoFile.mockResolvedValue({ ok: false, error: 'Logo exceeds 2 MB limit' })
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/2 MB/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  it('returns error when file extension is not PNG/JPEG/WebP', async () => {
    mockValidateLogoFile.mockResolvedValue({
      ok: false,
      error: 'Unsupported logo format: .gif. Only PNG, JPEG, and WebP are allowed.',
    })
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')
    const fd = validFormData({ fileName: 'logo.gif' })

    const result = await uploadCustomerLogo(fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unsupported logo format/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  it('returns error when magic bytes indicate a non-image file', async () => {
    mockValidateLogoFile.mockResolvedValue({
      ok: false,
      error: 'Invalid file type detected: application/pdf. Only PNG, JPEG, and WebP are allowed.',
    })
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid file type detected/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  // ── Customer ownership check ─────────────────────────────────────────────────

  it('returns error when the customer does not belong to the tenant', async () => {
    customerLookupRows = [] // empty — not found
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/customer not found/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  // ── Happy path ───────────────────────────────────────────────────────────────

  it('persists the logo, updates DB, writes audit log, and returns success', async () => {
    customerLookupRows = [{ id: CUSTOMER_ID, logoPath: null }]
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    const result = await uploadCustomerLogo(validFormData())

    expect(result.success).toBe(true)
    expect(mockPersistLogo).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.logoPath).toBe(NEW_LOGO)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'customer.logo_uploaded',
        entityType: 'customer',
        entityId: CUSTOMER_ID,
      })
    )
    // No old logo path — deleteLogo must not be called
    expect(mockDeleteLogo).not.toHaveBeenCalled()
  })

  it('best-effort deletes the old logo after DB update when one existed', async () => {
    customerLookupRows = [{ id: CUSTOMER_ID, logoPath: OLD_LOGO }]
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    await uploadCustomerLogo(validFormData())

    expect(mockDeleteLogo).toHaveBeenCalledWith(OLD_LOGO)
  })

  it('logo path returned by persistLogo uses session tenantId (not client-supplied)', async () => {
    customerLookupRows = [{ id: CUSTOMER_ID, logoPath: null }]
    const { uploadCustomerLogo } = await import('@/actions/customer-logo')

    await uploadCustomerLogo(validFormData())

    // persistLogo must always receive the tenantId from session context
    expect(mockPersistLogo).toHaveBeenCalledWith(
      expect.any(Buffer),
      TENANT_ID,
      expect.stringMatching(/^\.[a-z]+$/) // e.g. '.png'
    )
  })
})

// ── removeCustomerLogo ────────────────────────────────────────────────────────

describe('removeCustomerLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    customerLookupRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    mockDeleteLogo.mockResolvedValue(undefined)
  })

  it('returns not-authenticated error when context is null', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { removeCustomerLogo } = await import('@/actions/customer-logo')

    const result = await removeCustomerLogo(CUSTOMER_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not authenticated/i)
  })

  it('returns forbidden error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { removeCustomerLogo } = await import('@/actions/customer-logo')

    const result = await removeCustomerLogo(CUSTOMER_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when the customer does not exist in the tenant', async () => {
    customerLookupRows = [] // not found
    const { removeCustomerLogo } = await import('@/actions/customer-logo')

    const result = await removeCustomerLogo(CUSTOMER_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/customer not found/i)
  })

  it('clears logo_path, deletes the file, and writes audit log on happy path', async () => {
    customerLookupRows = [{ id: CUSTOMER_ID, logoPath: OLD_LOGO }]
    const { removeCustomerLogo } = await import('@/actions/customer-logo')

    const result = await removeCustomerLogo(CUSTOMER_ID)

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.logoPath).toBeNull()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'customer.logo_removed',
        entityType: 'customer',
        entityId: CUSTOMER_ID,
      })
    )
    expect(mockDeleteLogo).toHaveBeenCalledWith(OLD_LOGO)
  })

  it('does not call deleteLogo when the customer had no logo', async () => {
    customerLookupRows = [{ id: CUSTOMER_ID, logoPath: null }]
    const { removeCustomerLogo } = await import('@/actions/customer-logo')

    await removeCustomerLogo(CUSTOMER_ID)

    expect(mockDeleteLogo).not.toHaveBeenCalled()
  })
})
