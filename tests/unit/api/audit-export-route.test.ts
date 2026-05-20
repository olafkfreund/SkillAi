/**
 * Unit tests for GET /api/export/audit
 *
 * Tests: admin gate, filter parsing, audit emission, CSV response shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks — must be declared before any imports that transitively load them ───

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit-middleware', () => ({ emitAudit: vi.fn() }))
vi.mock('@/db', () => ({ withTenant: vi.fn() }))

// ── Import subjects after mocks ───────────────────────────────────────────────

import { GET } from '@/app/api/export/audit/route'
import { auth } from '@/lib/auth'
import { emitAudit } from '@/lib/audit-middleware'
import { withTenant } from '@/db'

const mockAuth     = vi.mocked(auth)
const mockEmit     = vi.mocked(emitAudit)
const mockWithTenant = vi.mocked(withTenant)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { tenantId: 'tenant-abc', role: 'admin' as const },
  expires: '2099-01-01',
}

const RECRUITER_SESSION = {
  user: { tenantId: 'tenant-abc', role: 'recruiter' as const },
  expires: '2099-01-01',
}

const SAMPLE_LOGS = [
  {
    id: 'log-1',
    tenantId: 'tenant-abc',
    userId: 'user-1',
    userEmail: 'recruiter@acme.com',
    action: 'candidate.created',
    entityType: 'candidate',
    entityId: 'cand-1',
    entityLabel: 'Jane Smith',
    metadata: { agencyId: 'ag-1' },
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url: string): Request {
  return new Request(url)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/export/audit', () => {
  // ── Auth / authorisation ──────────────────────────────────────────────────

  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null as never)
    const res = await GET(makeReq('http://localhost/api/export/audit'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when session has no tenantId', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin' }, expires: '2099-01-01' } as never)
    const res = await GET(makeReq('http://localhost/api/export/audit'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when the session role is recruiter', async () => {
    mockAuth.mockResolvedValue(RECRUITER_SESSION as never)
    const res = await GET(makeReq('http://localhost/api/export/audit'))
    expect(res.status).toBe(403)
  })

  it('returns 403 when the session role is viewer', async () => {
    mockAuth.mockResolvedValue({
      user: { tenantId: 'tenant-abc', role: 'viewer' },
      expires: '2099-01-01',
    } as never)
    const res = await GET(makeReq('http://localhost/api/export/audit'))
    expect(res.status).toBe(403)
  })

  // ── Happy path — no filters ───────────────────────────────────────────────

  it('returns 200 with text/csv content-type for a valid admin session', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue(SAMPLE_LOGS as never)

    const res = await GET(makeReq('http://localhost/api/export/audit'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
  })

  it('returns Content-Disposition attachment with a .csv filename', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue(SAMPLE_LOGS as never)

    const res = await GET(makeReq('http://localhost/api/export/audit'))

    const cd = res.headers.get('Content-Disposition') ?? ''
    expect(cd).toContain('attachment')
    expect(cd).toContain('skillai-audit-tenant-abc-')
    expect(cd).toMatch(/\.csv"$/)
  })

  it('includes the correct header row in the CSV body', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue(SAMPLE_LOGS as never)

    const res = await GET(makeReq('http://localhost/api/export/audit'))
    const body = await res.text()

    expect(body.startsWith(
      'created_at,actor_email,action,entity_type,entity_id,entity_label,metadata_json\r\n',
    )).toBe(true)
  })

  it('includes the data row with expected values', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue(SAMPLE_LOGS as never)

    const res = await GET(makeReq('http://localhost/api/export/audit'))
    const body = await res.text()

    expect(body).toContain('recruiter@acme.com')
    expect(body).toContain('candidate.created')
    expect(body).toContain('Jane Smith')
  })

  it('emits audit.exported_csv with rowCount metadata', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue(SAMPLE_LOGS as never)

    await GET(makeReq('http://localhost/api/export/audit'))

    expect(mockEmit).toHaveBeenCalledOnce()
    const [tenantId, entry] = mockEmit.mock.calls[0]
    expect(tenantId).toBe('tenant-abc')
    expect(entry.action).toBe('audit.exported_csv')
    expect((entry.metadata as Record<string, unknown>)?.rowCount).toBe(1)
  })

  // ── Filter parsing ────────────────────────────────────────────────────────

  it('passes filter params through to the audit metadata', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue([] as never)

    const url = 'http://localhost/api/export/audit?user=user-1&action=candidate.*&from=2026-05-01&to=2026-05-20'
    await GET(makeReq(url))

    expect(mockEmit).toHaveBeenCalledOnce()
    const [, entry] = mockEmit.mock.calls[0]
    const filters = (entry.metadata as Record<string, unknown>)?.filters as Record<string, string>
    expect(filters.user).toBe('user-1')
    expect(filters.action).toBe('candidate.*')
    expect(filters.from).toBe('2026-05-01')
    expect(filters.to).toBe('2026-05-20')
  })

  it('emits rowCount=0 when the DB returns no rows', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue([] as never)

    await GET(makeReq('http://localhost/api/export/audit'))

    const [, entry] = mockEmit.mock.calls[0]
    expect((entry.metadata as Record<string, unknown>)?.rowCount).toBe(0)
  })

  it('produces only the header line when there are no log rows', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue([] as never)

    const res = await GET(makeReq('http://localhost/api/export/audit'))
    const body = await res.text()

    // Only the header + trailing CRLF = two CRLF-delimited tokens, second empty
    const lines = body.split('\r\n')
    expect(lines[0]).toMatch(/^created_at,/)
    expect(lines[1]).toBe('')
  })

  it('emits filters.user undefined when no user param supplied', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockWithTenant.mockResolvedValue([] as never)

    await GET(makeReq('http://localhost/api/export/audit'))

    const [, entry] = mockEmit.mock.calls[0]
    const filters = (entry.metadata as Record<string, unknown>)?.filters as Record<string, unknown>
    expect(filters.user).toBeUndefined()
    expect(filters.action).toBeUndefined()
  })
})
