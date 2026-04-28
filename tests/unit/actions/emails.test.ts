/**
 * Unit tests for src/actions/emails.ts — sendCandidateEmail and helpers.
 *
 * Mocks: @/db (withTenant), @/lib/auth/action-context, @/lib/audit,
 *        @/lib/email/sender, @/lib/email/seed-templates, next/cache.
 * No real DB, no real SMTP.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const ACTOR_ID  = 'bbbbbbbb-0000-0000-0000-000000000002'
const CAND_ID   = 'cccccccc-0000-0000-0000-000000000003'
const TPL_ID    = 'dddddddd-0000-0000-0000-000000000004'
const SENT_ID   = 'eeeeeeee-0000-0000-0000-000000000005'

// ── next/cache mock ────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Audit mock ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

// ── seed-templates mock ────────────────────────────────────────────────────────
vi.mock('@/lib/email/seed-templates', () => ({
  seedDefaultTemplates: vi.fn().mockResolvedValue(undefined),
}))

// ── action-context mock ────────────────────────────────────────────────────────
const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// ── DB mock — mirrors role-managers.test.ts pattern ───────────────────────────
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

// ── Sender mock ────────────────────────────────────────────────────────────────
const mockSenderSend = vi.fn()
const mockGetSenderForTenant = vi.fn()

vi.mock('@/lib/email/sender', () => ({
  getSenderForTenant: (...args: unknown[]) => mockGetSenderForTenant(...args),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = [
    'from', 'where', 'limit', 'offset', 'leftJoin', 'innerJoin',
    'orderBy', 'returning', 'values', 'set', 'onConflictDoNothing',
    'onConflictDoUpdate',
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
    tenantId: TENANT_ID, userId: ACTOR_ID, userRole: 'recruiter',
  })
}

function asAdmin() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID, userId: ACTOR_ID, userRole: 'admin',
  })
}

function asViewer() {
  mockGetActionContext.mockResolvedValue({
    tenantId: TENANT_ID, userId: ACTOR_ID, userRole: 'viewer',
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sendCandidateEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asRecruiter()
    mockSenderSend.mockResolvedValue({ ok: true })
    mockGetSenderForTenant.mockResolvedValue({ send: mockSenderSend })
  })

  it('happy path: resolves template, sends, inserts sent_email row, returns sentEmailId', async () => {
    // 1. candidate lookup
    mockSelect.mockReturnValueOnce(chainableMock([{
      id: CAND_ID, firstName: 'Alice', lastName: 'Smith',
      email: 'alice@example.com', tenantId: TENANT_ID,
    }]))
    // 2. template lookup
    mockSelect.mockReturnValueOnce(chainableMock([{
      id: TPL_ID, name: 'Screening Invite',
      subject: 'Hello {{candidate.firstName}}', body: '<p>Hi {{candidate.firstName}}</p>',
    }]))
    // 3. scores + role join
    mockSelect.mockReturnValueOnce(chainableMock([{ roleTitle: 'Engineer', customerId: null }]))
    // 4. recruiter name
    mockSelect.mockReturnValueOnce(chainableMock([{ name: 'Bob Recruiter' }]))
    // 5. tenant name
    mockSelect.mockReturnValueOnce(chainableMock([{ name: 'Acme Corp' }]))
    // 6. smtp settings read
    mockSelect.mockReturnValueOnce(chainableMock([
      { key: 'smtp_from_email', value: 'noreply@acme.com' },
      { key: 'smtp_from_name', value: 'Acme Recruiting' },
    ]))
    // 7. insert sent_emails row
    mockInsert.mockReturnValueOnce(chainableMock([{ id: SENT_ID }]))

    const { sendCandidateEmail } = await import('@/actions/emails')
    const result = await sendCandidateEmail({ candidateId: CAND_ID, templateId: TPL_ID })

    expect(result).toEqual({ success: true, sentEmailId: SENT_ID })
    expect(mockGetSenderForTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(mockSenderSend).toHaveBeenCalledOnce()
  })

  it('returns error when candidate has no email address', async () => {
    mockSelect.mockReturnValueOnce(chainableMock([{
      id: CAND_ID, firstName: 'No', lastName: 'Email',
      email: null, tenantId: TENANT_ID,
    }]))

    const { sendCandidateEmail } = await import('@/actions/emails')
    const result = await sendCandidateEmail({ candidateId: CAND_ID, templateId: TPL_ID })

    expect(result).toEqual({ success: false, error: 'No email on file' })
    expect(mockSenderSend).not.toHaveBeenCalled()
  })

  it('returns error when template is not found', async () => {
    // candidate found
    mockSelect.mockReturnValueOnce(chainableMock([{
      id: CAND_ID, firstName: 'Alice', lastName: 'Smith',
      email: 'alice@example.com', tenantId: TENANT_ID,
    }]))
    // template not found
    mockSelect.mockReturnValueOnce(chainableMock([]))

    const { sendCandidateEmail } = await import('@/actions/emails')
    const result = await sendCandidateEmail({ candidateId: CAND_ID, templateId: 'no-such-id' })

    expect(result).toEqual({ success: false, error: 'Template not found' })
    expect(mockSenderSend).not.toHaveBeenCalled()
  })

  it('returns error when SMTP is not configured', async () => {
    mockGetSenderForTenant.mockResolvedValue(null)

    mockSelect.mockReturnValueOnce(chainableMock([{
      id: CAND_ID, firstName: 'Alice', lastName: 'Smith',
      email: 'alice@example.com', tenantId: TENANT_ID,
    }]))
    mockSelect.mockReturnValueOnce(chainableMock([{
      id: TPL_ID, name: 'Tpl', subject: 'Hi', body: '<p>Hi</p>',
    }]))
    // scores, recruiter, tenant reads
    mockSelect.mockReturnValue(chainableMock([]))

    const { sendCandidateEmail } = await import('@/actions/emails')
    const result = await sendCandidateEmail({ candidateId: CAND_ID, templateId: TPL_ID })

    expect(result).toEqual({ success: false, error: 'SMTP not configured' })
  })

  it('inserts failed sent_emails row and returns error when sender fails', async () => {
    mockSenderSend.mockResolvedValue({ ok: false, error: 'Connection refused' })

    mockSelect.mockReturnValueOnce(chainableMock([{
      id: CAND_ID, firstName: 'Alice', lastName: 'Smith',
      email: 'alice@example.com', tenantId: TENANT_ID,
    }]))
    mockSelect.mockReturnValueOnce(chainableMock([{
      id: TPL_ID, name: 'Tpl', subject: 'Hi', body: '<p>Hi</p>',
    }]))
    // scores, recruiter, tenant, smtp reads
    mockSelect.mockReturnValueOnce(chainableMock([]))
    mockSelect.mockReturnValueOnce(chainableMock([{ name: 'Bob' }]))
    mockSelect.mockReturnValueOnce(chainableMock([{ name: 'Acme' }]))
    mockSelect.mockReturnValueOnce(chainableMock([
      { key: 'smtp_from_email', value: 'noreply@acme.com' },
    ]))
    // insert returns a row even on failure
    mockInsert.mockReturnValueOnce(chainableMock([{ id: SENT_ID }]))

    const { sendCandidateEmail } = await import('@/actions/emails')
    const result = await sendCandidateEmail({ candidateId: CAND_ID, templateId: TPL_ID })

    // Row was inserted regardless
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(result).toEqual({ success: false, error: 'Connection refused' })
  })

  it('returns Forbidden for viewer role', async () => {
    asViewer()
    const { sendCandidateEmail } = await import('@/actions/emails')
    const result = await sendCandidateEmail({ candidateId: CAND_ID, templateId: TPL_ID })
    expect(result).toEqual({ success: false, error: expect.stringContaining('Forbidden') })
  })
})

describe('listSentEmailsForCandidate', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns empty array for viewer (insufficient role)', async () => {
    asViewer()
    const { listSentEmailsForCandidate } = await import('@/actions/emails')
    const result = await listSentEmailsForCandidate(CAND_ID)
    expect(result).toEqual([])
  })

  it('returns rows for recruiter', async () => {
    asRecruiter()
    const rows = [{ id: SENT_ID, recipientEmail: 'alice@example.com' }]
    mockSelect.mockReturnValueOnce(chainableMock(rows))

    const { listSentEmailsForCandidate } = await import('@/actions/emails')
    const result = await listSentEmailsForCandidate(CAND_ID)
    expect(result).toEqual(rows)
  })
})

describe('seedTemplatesForCurrentTenant', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('refuses non-admin callers', async () => {
    asRecruiter()
    const { seedTemplatesForCurrentTenant } = await import('@/actions/emails')
    const result = await seedTemplatesForCurrentTenant()
    expect(result).toEqual({ success: false, error: 'Forbidden: admins only' })
  })

  it('calls seedDefaultTemplates for admin user', async () => {
    asAdmin()
    const { seedTemplatesForCurrentTenant } = await import('@/actions/emails')
    const { seedDefaultTemplates } = await import('@/lib/email/seed-templates')

    const result = await seedTemplatesForCurrentTenant()
    expect(result).toEqual({ success: true })
    expect(seedDefaultTemplates).toHaveBeenCalledWith(TENANT_ID)
  })
})
