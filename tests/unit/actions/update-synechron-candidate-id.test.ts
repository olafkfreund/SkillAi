/**
 * Unit tests for the updateSynechronCandidateId server action.
 *
 * Mocks at the module-import boundary: auth/action-context, requireRole,
 * @/db, audit, and next/cache. Tests focus on validation branches +
 * authorisation gating; assertions on `error` are type-only ({ ok: false })
 * never on the exact message string so wording can drift without breaking us.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks so factories see them ──────────────────────────────────────
const { mockGetActionContext, mockUpdateSet, mockUpdateWhere } = vi.hoisted(() => ({
  mockGetActionContext: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}))

// `withTenant(tenantId, fn)` runs fn with a fake tx exposing `update().set().where()`.
vi.mock('@/db', () => ({
  db: {},
  withTenant: async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: () => ({
        set: (...args: unknown[]) => {
          mockUpdateSet(...args)
          return {
            where: (...whereArgs: unknown[]) => {
              mockUpdateWhere(...whereArgs)
              return Promise.resolve()
            },
          }
        },
      }),
    }
    return fn(tx)
  },
}))

vi.mock('@/db/schema', () => ({
  candidates: {
    id: 'id',
    tenantId: 'tenant_id',
    synechronCandidateId: 'synechron_candidate_id',
  },
  scores: {},
  agencies: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  and: vi.fn((...args) => ({ _and: args })),
  inArray: vi.fn(),
  or: vi.fn(),
  ilike: vi.fn(),
  notInArray: vi.fn(),
}))

vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: mockGetActionContext,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: vi.fn((fn: () => void) => fn?.()),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

// Modules pulled in transitively by the action import — keep them inert.
vi.mock('@/lib/parsers', () => ({ ParseError: class ParseError extends Error {} }))
vi.mock('@/lib/ai/scoring', () => ({ triggerScoring: vi.fn() }))
vi.mock('@/lib/cv/store', () => ({
  validateCvFile: vi.fn(),
  parseCvBuffer: vi.fn(),
  persistCvFile: vi.fn(),
}))
vi.mock('@/lib/tenants/ensure-internal-agency', () => ({
  ensureInternalAgency: vi.fn(),
}))

// ── Module under test (imported AFTER mocks) ─────────────────────────────────
import { updateSynechronCandidateId } from '@/actions/candidates'

const CANDIDATE_ID = '00000000-0000-0000-0000-0000000000aa'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const RECRUITER_CTX = {
  tenantId: TENANT_ID,
  userId: 'user-1',
  userRole: 'recruiter' as const,
}

const VIEWER_CTX = {
  tenantId: TENANT_ID,
  userId: 'user-2',
  userRole: 'viewer' as const,
}

const ADMIN_CTX = {
  tenantId: TENANT_ID,
  userId: 'user-3',
  userRole: 'admin' as const,
}

describe('updateSynechronCandidateId()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok:false when no session/tenant context', async () => {
    mockGetActionContext.mockResolvedValue(null)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, 'SYNE-1234')

    expect(result).toEqual({ ok: false, error: 'Unauthorized' })
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('returns ok:false for viewer role (insufficient permissions)', async () => {
    mockGetActionContext.mockResolvedValue(VIEWER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, 'SYNE-1234')

    expect(result.ok).toBe(false)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('accepts a valid SYNE-#### style id (recruiter)', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, 'SYNE-1234')

    expect(result).toEqual({ ok: true })
    expect(mockUpdateSet).toHaveBeenCalledOnce()
    expect(mockUpdateSet).toHaveBeenCalledWith({ synechronCandidateId: 'SYNE-1234' })
  })

  it('accepts admin role too', async () => {
    mockGetActionContext.mockResolvedValue(ADMIN_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, 'SYNE-1234')

    expect(result).toEqual({ ok: true })
  })

  it('treats empty string after trim as a clear → null', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, '   ')

    expect(result).toEqual({ ok: true })
    expect(mockUpdateSet).toHaveBeenCalledWith({ synechronCandidateId: null })
  })

  it('treats null input as a clear → null', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, null)

    expect(result).toEqual({ ok: true })
    expect(mockUpdateSet).toHaveBeenCalledWith({ synechronCandidateId: null })
  })

  it('accepts a 64-char value at the boundary', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)
    const value = 'A'.repeat(64)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, value)

    expect(result).toEqual({ ok: true })
    expect(mockUpdateSet).toHaveBeenCalledWith({ synechronCandidateId: value })
  })

  it('rejects a 65-char value as too long', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)
    const value = 'A'.repeat(65)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, value)

    expect(result.ok).toBe(false)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('rejects values containing special characters', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, 'SYNE@1234')

    expect(result.ok).toBe(false)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('rejects values containing whitespace inside the id', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, 'SYNE 1234')

    expect(result.ok).toBe(false)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('accepts hyphens-only as valid (regex permits any combination of [A-Za-z0-9-])', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, '---')

    expect(result).toEqual({ ok: true })
    expect(mockUpdateSet).toHaveBeenCalledWith({ synechronCandidateId: '---' })
  })

  it('trims surrounding whitespace before persisting', async () => {
    mockGetActionContext.mockResolvedValue(RECRUITER_CTX)

    const result = await updateSynechronCandidateId(CANDIDATE_ID, '  SYNE-1234  ')

    expect(result).toEqual({ ok: true })
    expect(mockUpdateSet).toHaveBeenCalledWith({ synechronCandidateId: 'SYNE-1234' })
  })
})
