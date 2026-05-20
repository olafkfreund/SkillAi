/**
 * Unit tests for src/actions/roles.ts archive / unarchive / hard-delete.
 *
 * Covers:
 *   - archiveRole — happy path + audit shape
 *   - unarchiveRole — happy path + auth gate + role gate + audit shape
 *   - deleteRoleHard — admin gate, typed-confirm, cascade across child tables,
 *     audit redaction, tombstone audit with metadata
 *
 * Mocks:
 *   @/db (withTenant)                — controls DB interaction
 *   @/lib/auth/action-context        — synthetic context
 *   @/lib/audit (writeAuditLog)      — spy to verify audit emission
 *   next/cache (revalidatePath)      — silenced
 *   next/navigation (redirect)       — silenced (archiveRole calls it)
 *   @/lib/ai/role-tags               — silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER_ID   = 'bbbbbbbb-0000-4000-8000-000000000002'
const ROLE_ID   = 'cccccccc-0000-4000-8000-000000000003'
const ROLE_TITLE = 'Senior Backend Engineer'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// redirect throws a NEXT_REDIRECT — we use a unique error to catch it in tests
class RedirectError extends Error {
  digest = 'NEXT_REDIRECT'
}
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new RedirectError(`redirect:${path}`)
  }),
}))
vi.mock('next/server', () => ({ after: vi.fn((fn: () => void) => fn?.()) }))
vi.mock('@/lib/ai/role-tags', () => ({ extractRoleTags: vi.fn().mockResolvedValue([]) }))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({ writeAuditLog: mockWriteAuditLog }))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

// ── DB mock harness ───────────────────────────────────────────────────────────

const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
const mockExecute = vi.fn().mockResolvedValue(undefined)
const setCalls: Array<{ payload: unknown; table: unknown }> = []
const deleteCalls: unknown[] = []

// We control select call sequence to mock the existence-check (returns role),
// the packs query (interviewPacks where roleId=...), and the transcripts query.
let selectCallCount = 0

// Configurable per-test fixtures
type RoleFixture = { id: string; title: string; isActive?: boolean } | null
let roleRow: RoleFixture = { id: ROLE_ID, title: ROLE_TITLE, isActive: true }
let packIds: string[] = []
let transcriptIds: string[] = []

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject)
  chain.catch = (reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).catch(reject)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(rows))
  return chain
}

function buildTx() {
  return {
    select: vi.fn(() => {
      selectCallCount++
      // 1st select: load role row
      if (selectCallCount === 1) {
        return makeSelectChain(roleRow ? [roleRow] : [])
      }
      // 2nd select: pack rows for this role (deleteRoleHard cascade)
      if (selectCallCount === 2) {
        return makeSelectChain(packIds.map((id) => ({ id })))
      }
      // 3rd select: transcript rows for this role (deleteRoleHard cascade)
      if (selectCallCount === 3) {
        return makeSelectChain(transcriptIds.map((id) => ({ id })))
      }
      return makeSelectChain([])
    }),
    delete: vi.fn((tbl: unknown) => {
      deleteCalls.push(tbl)
      return { where: mockDeleteWhere }
    }),
    update: vi.fn((tbl: unknown) => ({
      set: (payload: unknown) => {
        setCalls.push({ payload, table: tbl })
        return { where: mockUpdateWhere }
      },
    })),
    execute: mockExecute,
  }
}

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = buildTx()
      return fn(tx)
    }
  ),
}))

// Distinct table tokens so we can tell delete-targets apart.
const SCHEMA_TOKENS = {
  roles: { __t: 'roles', id: 'id', tenantId: 'tenant_id', title: 'title', isActive: 'is_active' },
  scores: { __t: 'scores', roleId: 'role_id' },
  roleManagers: { __t: 'role_managers', roleId: 'role_id' },
  roleSubmissions: { __t: 'role_submissions', roleId: 'role_id' },
  candidateRoleApprovals: { __t: 'candidate_role_approvals', roleId: 'role_id' },
  interviewPacks: { __t: 'interview_packs', id: 'id', roleId: 'role_id' },
  interviewQuestions: { __t: 'interview_questions', packId: 'pack_id' },
  codeChallenges: { __t: 'code_challenges', packId: 'pack_id' },
  interviewTranscripts: { __t: 'interview_transcripts', id: 'id', roleId: 'role_id' },
  transcriptAnalyses: { __t: 'transcript_analyses', transcriptId: 'transcript_id' },
  interviewSlots: { __t: 'interview_slots', roleId: 'role_id' },
  auditLogs: { __t: 'audit_logs', entityType: 'entity_type', entityId: 'entity_id' },
}

vi.mock('@/db/schema', () => SCHEMA_TOKENS)

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings,
      values,
    }),
    { raw: (s: string) => ({ type: 'sql-raw', s }) }
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function adminCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'admin' as const }
}

function viewerCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const }
}

function resetState() {
  vi.clearAllMocks()
  selectCallCount = 0
  setCalls.length = 0
  deleteCalls.length = 0
  roleRow = { id: ROLE_ID, title: ROLE_TITLE, isActive: true }
  packIds = []
  transcriptIds = []
  mockDeleteWhere.mockResolvedValue(undefined)
  mockUpdateWhere.mockResolvedValue(undefined)
  mockExecute.mockResolvedValue(undefined)
}

// ── archiveRole ───────────────────────────────────────────────────────────────

describe('archiveRole', () => {
  beforeEach(() => {
    resetState()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('archives the role and emits a role.archived audit with entityLabel', async () => {
    const { archiveRole } = await import('@/actions/roles')

    // archiveRole calls redirect() which throws — catch it so the rest runs
    try {
      await archiveRole(ROLE_ID)
    } catch (err) {
      if (!(err instanceof RedirectError)) throw err
    }

    // An update on roles must have run with isActive=false
    const archiveSet = setCalls.find(
      (c) => (c.payload as Record<string, unknown>).isActive === false
    )
    expect(archiveSet).toBeDefined()

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'role.archived',
        entityType: 'role',
        entityId: ROLE_ID,
        entityLabel: ROLE_TITLE,
      })
    )
  })

  it('throws when there is no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { archiveRole } = await import('@/actions/roles')

    await expect(archiveRole(ROLE_ID)).rejects.toThrow(/unauthorized/i)
  })

  it('throws when the role does not exist', async () => {
    roleRow = null
    const { archiveRole } = await import('@/actions/roles')

    await expect(archiveRole(ROLE_ID)).rejects.toThrow(/not found/i)
  })
})

// ── unarchiveRole ─────────────────────────────────────────────────────────────

describe('unarchiveRole', () => {
  beforeEach(() => {
    resetState()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    roleRow = { id: ROLE_ID, title: ROLE_TITLE, isActive: false }
  })

  it('flips isActive back to true and emits a role.unarchived audit row', async () => {
    const { unarchiveRole } = await import('@/actions/roles')

    const result = await unarchiveRole(ROLE_ID)

    expect(result.ok).toBe(true)

    const unarchiveSet = setCalls.find(
      (c) => (c.payload as Record<string, unknown>).isActive === true
    )
    expect(unarchiveSet).toBeDefined()

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'role.unarchived',
        entityType: 'role',
        entityId: ROLE_ID,
        entityLabel: ROLE_TITLE,
      })
    )
  })

  it('returns Unauthorized when there is no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { unarchiveRole } = await import('@/actions/roles')

    const result = await unarchiveRole(ROLE_ID)

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns Forbidden for viewer role', async () => {
    mockGetActionContext.mockResolvedValue(viewerCtx())
    const { unarchiveRole } = await import('@/actions/roles')

    const result = await unarchiveRole(ROLE_ID)

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns role-not-found when role does not exist for tenant', async () => {
    roleRow = null
    const { unarchiveRole } = await import('@/actions/roles')

    const result = await unarchiveRole(ROLE_ID)

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/not found/i)
  })

  it('allows admin role (recruiter+) to unarchive', async () => {
    mockGetActionContext.mockResolvedValue(adminCtx())
    const { unarchiveRole } = await import('@/actions/roles')

    const result = await unarchiveRole(ROLE_ID)

    expect(result.ok).toBe(true)
  })
})

// ── deleteRoleHard ────────────────────────────────────────────────────────────

describe('deleteRoleHard', () => {
  beforeEach(() => {
    resetState()
    mockGetActionContext.mockResolvedValue(adminCtx())
    roleRow = { id: ROLE_ID, title: ROLE_TITLE, isActive: true }
  })

  // ── Authorization ──────────────────────────────────────────────────────────

  it('returns Unauthorized when there is no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns Forbidden for recruiter role (admin-only)', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  it('returns Forbidden for viewer role', async () => {
    mockGetActionContext.mockResolvedValue(viewerCtx())
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/forbidden/i)
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  it('rejects an invalid UUID for roleId', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: 'not-a-uuid', typedConfirmation: ROLE_TITLE })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/UUID/i)
  })

  it('rejects empty typedConfirmation', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: '' })

    expect(result.ok).toBe(false)
  })

  // ── Role lookup + typed-confirm ────────────────────────────────────────────

  it('returns role-not-found when role does not exist', async () => {
    roleRow = null
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/not found/i)
  })

  it('rejects when typedConfirmation does not match role.title', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: 'Wrong Title' })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/does not match/i)
  })

  it('rejects when typedConfirmation differs only in case (case-sensitive)', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({
      roleId: ROLE_ID,
      typedConfirmation: ROLE_TITLE.toUpperCase(),
    })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/does not match/i)
  })

  // ── Happy path + cascade ───────────────────────────────────────────────────

  it('succeeds when admin provides the exact role title', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    const result = await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(result.ok).toBe(true)
  })

  it('cascades deletes across all direct child tables of roles', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    // Every direct-child table token should appear in the delete calls list,
    // plus the roles row itself.
    const tokens = deleteCalls.map((t) => (t as { __t?: string }).__t)
    expect(tokens).toContain('interview_transcripts')
    expect(tokens).toContain('interview_packs')
    expect(tokens).toContain('scores')
    expect(tokens).toContain('role_managers')
    expect(tokens).toContain('role_submissions')
    expect(tokens).toContain('candidate_role_approvals')
    expect(tokens).toContain('roles')
  })

  it('cascades to grandchildren of interview_packs (interview_questions + code_challenges)', async () => {
    packIds = ['pack-1', 'pack-2']
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    const tokens = deleteCalls.map((t) => (t as { __t?: string }).__t)
    expect(tokens).toContain('interview_questions')
    expect(tokens).toContain('code_challenges')
  })

  it('cascades to grandchildren of interview_transcripts (transcript_analyses)', async () => {
    transcriptIds = ['transcript-1']
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    const tokens = deleteCalls.map((t) => (t as { __t?: string }).__t)
    expect(tokens).toContain('transcript_analyses')
  })

  it('issues SET NULL on interview_slots.role_id (preserves slot, untethers role)', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    const slotsUpdate = setCalls.find(
      (c) =>
        (c.table as { __t?: string }).__t === 'interview_slots' &&
        (c.payload as Record<string, unknown>).roleId === null
    )
    expect(slotsUpdate).toBeDefined()
  })

  // ── Audit redaction ────────────────────────────────────────────────────────

  it('redacts audit_logs rows pointing at this role (entityLabel + metadata)', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    const auditRedact = setCalls.find(
      (c) =>
        (c.table as { __t?: string }).__t === 'audit_logs' &&
        (c.payload as Record<string, unknown>).entityLabel === '[redacted-hard-delete]'
    )
    expect(auditRedact).toBeDefined()
    const meta = (auditRedact!.payload as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.redacted_hard_delete).toBe(true)
    expect(typeof meta.redacted_at).toBe('string')
  })

  it('does NOT delete audit_logs rows — only updates them', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    const tokens = deleteCalls.map((t) => (t as { __t?: string }).__t)
    expect(tokens).not.toContain('audit_logs')
  })

  it('issues a tx.execute call to redact ai_usage rows referencing this role', async () => {
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(mockExecute).toHaveBeenCalled()
    const callArg = mockExecute.mock.calls[0]?.[0] as
      | { type: string; strings: TemplateStringsArray | string[]; values: unknown[] }
      | undefined
    expect(callArg).toBeDefined()
    const rawSql = (callArg!.strings as readonly string[]).join('?')
    expect(rawSql).toMatch(/ai_usage/i)
    expect(rawSql).toMatch(/role_redacted_hard_delete/i)
    expect(callArg!.values).toContain(ROLE_ID)
  })

  // ── Tombstone audit ────────────────────────────────────────────────────────

  it('writes a role.deleted_hard tombstone audit row with cascadeCounts metadata', async () => {
    packIds = ['pack-1']
    transcriptIds = ['transcript-1']
    const { deleteRoleHard } = await import('@/actions/roles')

    await deleteRoleHard({ roleId: ROLE_ID, typedConfirmation: ROLE_TITLE })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'role.deleted_hard',
        entityType: 'role',
        entityId: ROLE_ID,
        entityLabel: '[deleted-hard]',
        metadata: expect.objectContaining({
          roleId: ROLE_ID,
          roleTitle: ROLE_TITLE,
          cascadeCounts: expect.objectContaining({
            interviewPacks: 1,
            interviewQuestions: 1,
            codeChallenges: 1,
            interviewTranscripts: 1,
            transcriptAnalyses: 1,
          }),
          deletedBy: USER_ID,
        }),
      })
    )
  })
})
