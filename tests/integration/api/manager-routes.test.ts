/**
 * Integration tests for the /dashboard/manager page guard.
 *
 * The page calls `notFound()` for any session whose role is not
 * 'hiring_manager' or 'admin'. We verify that contract by mocking auth()
 * and the DB layer, then importing the page component directly.
 *
 * next/navigation's notFound() throws a special Next.js error object that
 * matches { digest: 'NEXT_NOT_FOUND' }. We catch it here so we can assert
 * the redirect behaviour without spinning up a real server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

// ── next/navigation mock ───────────────────────────────────────────────────────
// notFound() in Next.js throws an error with a specific digest. Replicate
// that so our test can catch and assert it without needing a real server.
const NOT_FOUND_DIGEST = 'NEXT_NOT_FOUND'
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    const err = new Error('Not found')
    ;(err as unknown as { digest: string }).digest = NOT_FOUND_DIGEST
    throw err
  }),
  redirect: vi.fn(),
}))

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ select: mockSelect, insert: mockInsert, update: mockUpdate })
  ),
}))

// ── Auth mock (controlled per-test) ───────────────────────────────────────────
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))

// ── RoleCardList component mock ────────────────────────────────────────────────
vi.mock('@/components/manager/role-card-list', () => ({
  RoleCardList: vi.fn().mockReturnValue(null),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = [
    'from', 'where', 'limit', 'leftJoin', 'innerJoin',
    'orderBy', 'groupBy', 'returning',
  ]
  methods.forEach((method) => {
    m[method] = vi.fn().mockReturnValue(m)
  })
  ;(m as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(returnValue).then(resolve)
  return m
}

function sessionFor(role: string) {
  return {
    user: { id: USER_ID, tenantId: TENANT_ID, role },
  }
}

/** Returns true if the error is a Next.js notFound() throw. */
function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as unknown as { digest?: string }).digest === NOT_FOUND_DIGEST
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ManagerPage — /dashboard/manager page guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls notFound() for viewer role', async () => {
    mockAuth.mockResolvedValue(sessionFor('viewer'))

    const { default: ManagerPage } = await import(
      '@/app/(dashboard)/dashboard/manager/page'
    )
    await expect(ManagerPage()).rejects.toSatisfy(isNotFound)
  })

  it('calls notFound() for recruiter role', async () => {
    mockAuth.mockResolvedValue(sessionFor('recruiter'))

    const { default: ManagerPage } = await import(
      '@/app/(dashboard)/dashboard/manager/page'
    )
    await expect(ManagerPage()).rejects.toSatisfy(isNotFound)
  })

  it('calls notFound() when session is null (unauthenticated)', async () => {
    mockAuth.mockResolvedValue(null)

    const { default: ManagerPage } = await import(
      '@/app/(dashboard)/dashboard/manager/page'
    )
    await expect(ManagerPage()).rejects.toSatisfy(isNotFound)
  })

  it('does NOT call notFound() for hiring_manager role', async () => {
    mockAuth.mockResolvedValue(sessionFor('hiring_manager'))
    // DB calls inside the page
    mockSelect.mockReturnValue(chainableMock([]))

    const { default: ManagerPage } = await import(
      '@/app/(dashboard)/dashboard/manager/page'
    )
    await expect(ManagerPage()).resolves.not.toThrow()

    const { notFound } = await import('next/navigation')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('does NOT call notFound() for admin role', async () => {
    mockAuth.mockResolvedValue(sessionFor('admin'))
    mockSelect.mockReturnValue(chainableMock([]))

    const { default: ManagerPage } = await import(
      '@/app/(dashboard)/dashboard/manager/page'
    )
    await expect(ManagerPage()).resolves.not.toThrow()

    const { notFound } = await import('next/navigation')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('returns role data for an authenticated hiring_manager', async () => {
    mockAuth.mockResolvedValue(sessionFor('hiring_manager'))
    // The page runs two selects (assigned roles + pending counts)
    mockSelect.mockReturnValue(
      chainableMock([
        {
          roleId: 'role-x',
          title: 'Principal Engineer',
          isActive: true,
          shortlistSentAt: null,
          targetFillDate: null,
          isPrimary: true,
          customerName: 'Acme Corp',
        },
      ])
    )

    const { default: ManagerPage } = await import(
      '@/app/(dashboard)/dashboard/manager/page'
    )
    // Resolves without notFound — page renders a JSX element
    const output = await ManagerPage()
    expect(output).toBeDefined()
  })
})
