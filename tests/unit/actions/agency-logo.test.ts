/**
 * Unit tests for src/actions/agency-logo.ts
 *
 * Covers:
 *   uploadAgencyLogo — happy path (new logo + audit log written), auth gate,
 *     role gate (viewer blocked), missing agencyId, missing file,
 *     oversize file rejection, wrong MIME rejection, magic-byte mismatch,
 *     agency not found, old logo deleted after DB update
 *   removeAgencyLogo — happy path (logo_path cleared + audit), auth gate,
 *     role gate, agency not found, no logo_path to delete
 *
 * Mocks:
 *   @/db                          — withTenant (stateful select rows)
 *   @/db/schema                   — agencies table stub
 *   drizzle-orm                   — eq / and pass-throughs
 *   @/lib/auth/action-context     — getActionContext
 *   @/lib/audit                   — writeAuditLog
 *   @/lib/auth/require-role       — real implementation used
 *   @/lib/branding/store          — validateLogoFile, persistLogo, deleteLogo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID   = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const AGENCY_ID   = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
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

// Controls what row the agency ownership check returns.
let agencyLookupRows: unknown[] = []

// Captured mutation calls
const mockUpdateSet   = vi.fn()
const mockUpdateWhere = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => makeSelectChain(agencyLookupRows)),

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

/** Builds a minimal FormData with an agencyId and a small PNG File. */
function validFormData(overrides: { agencyId?: string; fileName?: string } = {}): FormData {
  const fd = new FormData()
  fd.set('agencyId', overrides.agencyId ?? AGENCY_ID)
  // 4-byte PNG magic number + padding so it's non-empty
  const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  fd.set('file', new File([buf], overrides.fileName ?? 'logo.png', { type: 'image/png' }))
  return fd
}

// ── uploadAgencyLogo ──────────────────────────────────────────────────────────

describe('uploadAgencyLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agencyLookupRows = []
    // Default: validation passes, persist returns the new path
    mockValidateLogoFile.mockResolvedValue({ ok: true })
    mockPersistLogo.mockResolvedValue(NEW_LOGO)
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  // ── Auth / role gates ────────────────────────────────────────────────────────

  it('returns not-authenticated error when context is null', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not authenticated/i)
  })

  it('returns forbidden error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns forbidden error when role is hiring_manager', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'hiring_manager' as const,
    })
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── Input validation ─────────────────────────────────────────────────────────

  it('returns error when agencyId is missing from FormData', async () => {
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')
    const fd = new FormData()
    // No agencyId field — only a file
    fd.set('file', new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }))

    const result = await uploadAgencyLogo(fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/missing agencyid/i)
  })

  it('returns error when file field is absent', async () => {
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')
    const fd = new FormData()
    fd.set('agencyId', AGENCY_ID)
    // No file field

    const result = await uploadAgencyLogo(fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/missing or invalid file/i)
  })

  // ── File validation (delegated to validateLogoFile) ──────────────────────────

  it('returns error when file exceeds 2 MB', async () => {
    mockValidateLogoFile.mockResolvedValue({ ok: false, error: 'Logo exceeds 2 MB limit' })
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/2 MB/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  it('returns error when file extension is not PNG/JPEG/WebP', async () => {
    mockValidateLogoFile.mockResolvedValue({
      ok: false,
      error: 'Unsupported logo format: .gif. Only PNG, JPEG, and WebP are allowed.',
    })
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')
    const fd = validFormData({ fileName: 'logo.gif' })

    const result = await uploadAgencyLogo(fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unsupported logo format/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  it('returns error when magic bytes indicate a non-image file', async () => {
    mockValidateLogoFile.mockResolvedValue({
      ok: false,
      error: 'Invalid file type detected: application/pdf. Only PNG, JPEG, and WebP are allowed.',
    })
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid file type detected/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  // ── Agency ownership check ───────────────────────────────────────────────────

  it('returns error when the agency does not belong to the tenant', async () => {
    agencyLookupRows = [] // empty — not found
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/agency not found/i)
    expect(mockPersistLogo).not.toHaveBeenCalled()
  })

  // ── Happy path ───────────────────────────────────────────────────────────────

  it('persists the logo, updates DB, writes audit log, and returns success', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, logoPath: null }]
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    const result = await uploadAgencyLogo(validFormData())

    expect(result.success).toBe(true)
    expect(mockPersistLogo).toHaveBeenCalledTimes(1)
    // DB update should set logoPath to the new path
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.logoPath).toBe(NEW_LOGO)
    // Audit log must be written
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'agency.logo_uploaded',
        entityType: 'agency',
        entityId: AGENCY_ID,
      })
    )
    // No old logo to delete when previous logoPath was null
    expect(mockDeleteLogo).not.toHaveBeenCalled()
  })

  it('best-effort deletes the old logo after DB update when one existed', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, logoPath: OLD_LOGO }]
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    await uploadAgencyLogo(validFormData())

    expect(mockDeleteLogo).toHaveBeenCalledWith(OLD_LOGO)
  })

  it('logo path returned by persistLogo stays within /uploads/{tenantId}/logos/', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, logoPath: null }]
    const { uploadAgencyLogo } = await import('@/actions/agency-logo')

    await uploadAgencyLogo(validFormData())

    // persistLogo is called with the session tenantId (not a client-supplied one)
    expect(mockPersistLogo).toHaveBeenCalledWith(
      expect.any(Buffer),
      TENANT_ID,
      expect.stringMatching(/^\.[a-z]+$/) // e.g. '.png'
    )
  })
})

// ── removeAgencyLogo ──────────────────────────────────────────────────────────

describe('removeAgencyLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    agencyLookupRows = []
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    mockDeleteLogo.mockResolvedValue(undefined)
  })

  it('returns not-authenticated error when context is null', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { removeAgencyLogo } = await import('@/actions/agency-logo')

    const result = await removeAgencyLogo(AGENCY_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not authenticated/i)
  })

  it('returns forbidden error when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userRole: 'viewer' as const,
    })
    const { removeAgencyLogo } = await import('@/actions/agency-logo')

    const result = await removeAgencyLogo(AGENCY_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns error when the agency does not exist in the tenant', async () => {
    agencyLookupRows = [] // not found
    const { removeAgencyLogo } = await import('@/actions/agency-logo')

    const result = await removeAgencyLogo(AGENCY_ID)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/agency not found/i)
  })

  it('clears logo_path and writes audit log on happy path', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, logoPath: OLD_LOGO }]
    const { removeAgencyLogo } = await import('@/actions/agency-logo')

    const result = await removeAgencyLogo(AGENCY_ID)

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.logoPath).toBeNull()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'agency.logo_removed',
        entityType: 'agency',
        entityId: AGENCY_ID,
      })
    )
  })

  it('best-effort deletes the old file when a logoPath existed', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, logoPath: OLD_LOGO }]
    const { removeAgencyLogo } = await import('@/actions/agency-logo')

    await removeAgencyLogo(AGENCY_ID)

    expect(mockDeleteLogo).toHaveBeenCalledWith(OLD_LOGO)
  })

  it('does not call deleteLogo when the agency had no logo', async () => {
    agencyLookupRows = [{ id: AGENCY_ID, logoPath: null }]
    const { removeAgencyLogo } = await import('@/actions/agency-logo')

    await removeAgencyLogo(AGENCY_ID)

    expect(mockDeleteLogo).not.toHaveBeenCalled()
  })
})
