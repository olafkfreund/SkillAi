/**
 * Unit tests for src/actions/role-managers.ts — hiring-manager assignment actions.
 *
 * Mocks: @/db (withTenant), @/lib/auth/action-context, next/cache, @/lib/audit.
 * No real DB. No fixtures written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const ACTOR_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const ROLE_ID = 'cccccccc-0000-0000-0000-000000000003'
const MANAGER_1 = 'dddddddd-0000-0000-0000-000000000004'
const MANAGER_2 = 'eeeeeeee-0000-0000-0000-000000000005'

// ── next/cache mock ────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Audit mock ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete })
  ),
}))

// ── action-context mock ────────────────────────────────────────────────────────
const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = [
    'from', 'where', 'limit', 'offset', 'leftJoin', 'innerJoin',
    'orderBy', 'returning', 'values', 'set', 'onConflictDoNothing',
    'onConflictDoUpdate', 'groupBy',
  ]
  methods.forEach((method) => {
    m[method] = vi.fn().mockReturnValue(m)
  })
  ;(m as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(returnValue).then(resolve)
  return m
}

function asRecruiter() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID,
    userId: ACTOR_ID,
    userRole: 'recruiter',
  })
}

function asViewer() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID,
    userId: ACTOR_ID,
    userRole: 'viewer',
  })
}

function asHiringManager() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID,
    userId: ACTOR_ID,
    userRole: 'hiring_manager',
  })
}

function unauthenticated() {
  mockGetActionContext.mockResolvedValue(null)
}

// ── assignRoleManagers ────────────────────────────────────────────────────────

describe('assignRoleManagers()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asRecruiter()
  })

  it('returns success when recruiter assigns valid hiring_manager users', async () => {
    // role check
    mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
    // user validation: two valid hiring_manager users
    mockSelect.mockReturnValueOnce(
      chainableMock([
        { id: MANAGER_1, role: 'hiring_manager', isActive: true },
        { id: MANAGER_2, role: 'hiring_manager', isActive: true },
      ])
    )
    // delete existing + insert new
    mockDelete.mockReturnValueOnce(chainableMock(undefined))
    mockInsert.mockReturnValueOnce(chainableMock(undefined))

    const { assignRoleManagers } = await import('@/actions/role-managers')
    const result = await assignRoleManagers(ROLE_ID, [MANAGER_1, MANAGER_2])

    expect(result).toEqual({ success: true })
    expect(mockInsert).toHaveBeenCalled()
  })

  it('returns Forbidden for viewer', async () => {
    asViewer()
    const { assignRoleManagers } = await import('@/actions/role-managers')
    const result = await assignRoleManagers(ROLE_ID, [MANAGER_1])
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns Forbidden for hiring_manager (not recruiter+)', async () => {
    asHiringManager()
    const { assignRoleManagers } = await import('@/actions/role-managers')
    const result = await assignRoleManagers(ROLE_ID, [MANAGER_1])
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns error when role does not exist', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { assignRoleManagers } = await import('@/actions/role-managers')
    const result = await assignRoleManagers(ROLE_ID, [MANAGER_1])
    expect(result).toEqual({ success: false, error: 'Role not found' })
  })

  it('returns error when none of the provided userIds are valid hiring_managers', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
    // Users exist but have 'recruiter' role, not 'hiring_manager'
    mockSelect.mockReturnValueOnce(
      chainableMock([{ id: MANAGER_1, role: 'recruiter', isActive: true }])
    )
    const { assignRoleManagers } = await import('@/actions/role-managers')
    const result = await assignRoleManagers(ROLE_ID, [MANAGER_1])
    expect(result).toEqual({ success: false, error: expect.stringContaining('None of the selected') })
  })

  it('is idempotent — re-assigning same users replaces existing set (delete + re-insert)', async () => {
    for (let i = 0; i < 2; i++) {
      mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
      mockSelect.mockReturnValueOnce(
        chainableMock([{ id: MANAGER_1, role: 'hiring_manager', isActive: true }])
      )
      mockDelete.mockReturnValueOnce(chainableMock(undefined))
      mockInsert.mockReturnValueOnce(chainableMock(undefined))
    }

    const { assignRoleManagers } = await import('@/actions/role-managers')
    const first = await assignRoleManagers(ROLE_ID, [MANAGER_1])
    const second = await assignRoleManagers(ROLE_ID, [MANAGER_1])

    expect(first).toEqual({ success: true })
    expect(second).toEqual({ success: true })
    // delete called twice — once per call, enforcing full replacement
    expect(mockDelete).toHaveBeenCalledTimes(2)
  })

  it('enforces tenant isolation — user validation query runs through withTenant', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
    mockSelect.mockReturnValueOnce(
      chainableMock([{ id: MANAGER_1, role: 'hiring_manager', isActive: true }])
    )
    mockDelete.mockReturnValueOnce(chainableMock(undefined))
    mockInsert.mockReturnValueOnce(chainableMock(undefined))

    const { withTenant } = await import('@/db')
    const { assignRoleManagers } = await import('@/actions/role-managers')
    await assignRoleManagers(ROLE_ID, [MANAGER_1])

    // withTenant is always called with the correct tenantId — RLS enforces isolation
    expect(vi.mocked(withTenant)).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Function)
    )
  })

  it('returns Unauthorized when unauthenticated', async () => {
    unauthenticated()
    const { assignRoleManagers } = await import('@/actions/role-managers')
    const result = await assignRoleManagers(ROLE_ID, [MANAGER_1])
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })
})

// ── removeRoleManager ─────────────────────────────────────────────────────────

describe('removeRoleManager()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asRecruiter()
  })

  it('returns success when recruiter removes a manager', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{ id: ROLE_ID, title: 'SWE' }]))
    mockDelete.mockReturnValueOnce(chainableMock(undefined))

    const { removeRoleManager } = await import('@/actions/role-managers')
    const result = await removeRoleManager(ROLE_ID, MANAGER_1)

    expect(result).toEqual({ success: true })
    expect(mockDelete).toHaveBeenCalled()
  })

  it('returns Forbidden for viewer', async () => {
    asViewer()
    const { removeRoleManager } = await import('@/actions/role-managers')
    const result = await removeRoleManager(ROLE_ID, MANAGER_1)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns Forbidden for hiring_manager', async () => {
    asHiringManager()
    const { removeRoleManager } = await import('@/actions/role-managers')
    const result = await removeRoleManager(ROLE_ID, MANAGER_1)
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })

  it('returns error when role does not exist', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { removeRoleManager } = await import('@/actions/role-managers')
    const result = await removeRoleManager(ROLE_ID, MANAGER_1)
    expect(result).toEqual({ success: false, error: 'Role not found' })
  })
})

// ── getMyAssignedRoles ────────────────────────────────────────────────────────

describe('getMyAssignedRoles()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asHiringManager()
  })

  it('returns assigned roles for the current user', async () => {
    const mockRows = [
      {
        roleId: ROLE_ID,
        title: 'Senior SWE',
        isActive: true,
        shortlistSentAt: null,
        isPrimary: true,
      },
    ]
    mockSelect.mockReturnValueOnce(chainableMock(mockRows))

    const { getMyAssignedRoles } = await import('@/actions/role-managers')
    const rows = await getMyAssignedRoles()

    expect(rows).toHaveLength(1)
    expect(rows[0].roleId).toBe(ROLE_ID)
    expect(rows[0].title).toBe('Senior SWE')
  })

  it('returns empty array when unauthenticated', async () => {
    unauthenticated()
    const { getMyAssignedRoles } = await import('@/actions/role-managers')
    const rows = await getMyAssignedRoles()
    expect(rows).toEqual([])
  })

  it('returns empty array when user has no assigned roles', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { getMyAssignedRoles } = await import('@/actions/role-managers')
    const rows = await getMyAssignedRoles()
    expect(rows).toEqual([])
  })

  it('enforces tenant isolation via withTenant', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { withTenant } = await import('@/db')
    const { getMyAssignedRoles } = await import('@/actions/role-managers')
    await getMyAssignedRoles()

    expect(vi.mocked(withTenant)).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
  })
})

// ── getRoleManagers ────────────────────────────────────────────────────────────

describe('getRoleManagers()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asRecruiter()
  })

  it('returns manager rows for the given role', async () => {
    const mockRows = [
      {
        userId: MANAGER_1,
        email: 'manager@example.com',
        name: 'Alice Manager',
        isPrimary: true,
        addedAt: new Date(),
      },
    ]
    mockSelect.mockReturnValueOnce(chainableMock(mockRows))

    const { getRoleManagers } = await import('@/actions/role-managers')
    const rows = await getRoleManagers(ROLE_ID)

    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(MANAGER_1)
    expect(rows[0].email).toBe('manager@example.com')
  })

  it('returns empty array when unauthenticated', async () => {
    unauthenticated()
    const { getRoleManagers } = await import('@/actions/role-managers')
    const rows = await getRoleManagers(ROLE_ID)
    expect(rows).toEqual([])
  })

  it('returns empty array when no managers assigned', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { getRoleManagers } = await import('@/actions/role-managers')
    const rows = await getRoleManagers(ROLE_ID)
    expect(rows).toEqual([])
  })

  it('scopes query to tenant via withTenant', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([]))
    const { withTenant } = await import('@/db')
    const { getRoleManagers } = await import('@/actions/role-managers')
    await getRoleManagers(ROLE_ID)

    expect(vi.mocked(withTenant)).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
  })
})
