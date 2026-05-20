/**
 * Unit tests for src/actions/transcripts.ts
 *
 * Covers:
 *   uploadTranscript — auth gate, role gate (viewer blocked), required-field
 *     validation (missing candidateId/roleId), no content guard (no file + no
 *     paste), file-too-large guard, parse error surfaced, invalid interviewDate,
 *     happy path with pasted text (DB insert + triggerTranscriptAnalysis called),
 *     happy path with file upload (transcriptId returned).
 *
 * Mocks:
 *   @/db                                  — withTenant (returns transcript row on insert.returning)
 *   @/db/schema                           — interviewTranscripts stub
 *   drizzle-orm                           — eq pass-through (unused path, for completeness)
 *   @/lib/auth/action-context             — getActionContext
 *   @/lib/parsers/transcript              — parseTranscriptFile, sanitizeText, sanitizeCues
 *   @/lib/ai/transcript-analysis         — triggerTranscriptAnalysis
 *   next/server                           — after fires callback synchronously
 *
 * Note: requireRole is NOT mocked — the real pure implementation is used so that
 * role-gate tests exercise the actual rank comparison.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID     = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const CANDIDATE_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const ROLE_ID       = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const TRANSCRIPT_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'
const USER_ID       = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'

// ── Per-test state ────────────────────────────────────────────────────────────

const mockInsertValues  = vi.fn()
const mockReturning     = vi.fn()

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return {
              returning: (...rargs: unknown[]) => {
                mockReturning(...rargs)
                return Promise.resolve([{ id: TRANSCRIPT_ID }])
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
  interviewTranscripts: {
    id:        'id',
    tenantId:  'tenant_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockParseTranscriptFile = vi.fn()
const mockSanitizeText        = vi.fn((t: string) => t)
const mockSanitizeCues        = vi.fn((c: unknown[]) => c)

vi.mock('@/lib/parsers/transcript', () => ({
  parseTranscriptFile: (...args: unknown[]) => mockParseTranscriptFile(...args),
  sanitizeText:        (t: string)          => mockSanitizeText(t),
  sanitizeCues:        (c: unknown[])       => mockSanitizeCues(c),
  // TranscriptParseError is used by the action only for instanceof checks;
  // since we throw plain Error in tests, this is sufficient.
  TranscriptParseError: class TranscriptParseError extends Error {
    constructor(msg: string) { super(msg); this.name = 'TranscriptParseError' }
  },
}))

const mockTriggerTranscriptAnalysis = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/ai/transcript-analysis', () => ({
  triggerTranscriptAnalysis: (...args: unknown[]) => mockTriggerTranscriptAnalysis(...args),
}))

// after() fires the callback synchronously so we can assert on side effects
vi.mock('next/server', () => ({
  after: vi.fn((fn: () => void) => {
    try { fn() } catch {}
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function viewerCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'viewer' as const }
}

/** Default parse result for happy-path tests */
function successfulParseResult() {
  return {
    rawText: 'Interviewer: Tell me about yourself.\nCandidate: Sure.',
    cues: [
      { speaker: 'Interviewer', timestamp: 0, text: 'Tell me about yourself.' },
      { speaker: 'Candidate',   timestamp: 5000, text: 'Sure.' },
    ],
  }
}

/** Minimal valid FormData for uploadTranscript using paste */
function pasteFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('candidateId', CANDIDATE_ID)
  fd.set('roleId', ROLE_ID)
  fd.set('text', 'Candidate: Hello.\nInterviewer: Hi.')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

/** Minimal valid FormData for uploadTranscript using a file */
function fileFormData(file: File, overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('candidateId', CANDIDATE_ID)
  fd.set('roleId', ROLE_ID)
  fd.set('file', file)
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

function fakeTxtFile(content = 'Speaker: text', sizeOverride?: number) {
  const body = sizeOverride ? 'x'.repeat(sizeOverride) : content
  return new File([body], 'transcript.txt', { type: 'text/plain' })
}

// ── uploadTranscript ──────────────────────────────────────────────────────────

describe('uploadTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    mockParseTranscriptFile.mockResolvedValue(successfulParseResult())
  })

  // ── Auth checks ──────────────────────────────────────────────────────────────

  it('returns Unauthorised when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { uploadTranscript } = await import('@/actions/transcripts')

    const result = await uploadTranscript(null, pasteFormData())

    expect(result.success).toBe(false)
    // The action uses British spelling "Unauthorised"
    expect((result as { success: false; error: string }).error).toMatch(/unauthori[sz]ed/i)
  })

  it('returns Insufficient permissions when role is viewer', async () => {
    mockGetActionContext.mockResolvedValue(viewerCtx())
    const { uploadTranscript } = await import('@/actions/transcripts')

    const result = await uploadTranscript(null, pasteFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/insufficient permissions/i)
  })

  // ── Required-field validation ─────────────────────────────────────────────────

  it('returns error when candidateId is missing', async () => {
    const { uploadTranscript } = await import('@/actions/transcripts')
    const fd = pasteFormData()
    fd.delete('candidateId')

    const result = await uploadTranscript(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/candidateid.*roleid/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns error when roleId is missing', async () => {
    const { uploadTranscript } = await import('@/actions/transcripts')
    const fd = pasteFormData()
    fd.delete('roleId')

    const result = await uploadTranscript(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/candidateid.*roleid/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns error when neither file nor pasted text is provided', async () => {
    const { uploadTranscript } = await import('@/actions/transcripts')
    const fd = new FormData()
    fd.set('candidateId', CANDIDATE_ID)
    fd.set('roleId', ROLE_ID)
    // No file, no text

    const result = await uploadTranscript(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/upload a file or paste/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── File validation ───────────────────────────────────────────────────────────

  it('returns error when file exceeds 5 MB', async () => {
    const bigFile = fakeTxtFile('', 5 * 1024 * 1024 + 1)
    const { uploadTranscript } = await import('@/actions/transcripts')

    const result = await uploadTranscript(null, fileFormData(bigFile))

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/5 mb/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── Parse error ───────────────────────────────────────────────────────────────

  it('surfaces parse error message when parseTranscriptFile throws', async () => {
    mockParseTranscriptFile.mockRejectedValue(new Error('Malformed VTT header'))
    const { uploadTranscript } = await import('@/actions/transcripts')

    const result = await uploadTranscript(null, pasteFormData())

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/failed to parse transcript/i)
    expect((result as { success: false; error: string }).error).toContain('Malformed VTT header')
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── Date validation ───────────────────────────────────────────────────────────

  it('returns error for invalid interviewDate format', async () => {
    const { uploadTranscript } = await import('@/actions/transcripts')
    const fd = pasteFormData({ interviewDate: 'not-a-date' })

    const result = await uploadTranscript(null, fd)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid interviewdate/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  // ── Happy path: paste ─────────────────────────────────────────────────────────

  it('inserts transcript row and returns transcriptId on paste happy path', async () => {
    const { uploadTranscript } = await import('@/actions/transcripts')

    const result = await uploadTranscript(null, pasteFormData())

    expect(result.success).toBe(true)
    expect((result as { success: true; transcriptId: string }).transcriptId).toBe(TRANSCRIPT_ID)

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.tenantId).toBe(TENANT_ID)
    expect(arg.candidateId).toBe(CANDIDATE_ID)
    expect(arg.roleId).toBe(ROLE_ID)
    expect(arg.analysisStatus).toBe('pending')
    expect(arg.sourceFormat).toBe('paste')
  })

  it('calls triggerTranscriptAnalysis with transcriptId and tenantId after insert', async () => {
    const { uploadTranscript } = await import('@/actions/transcripts')

    await uploadTranscript(null, pasteFormData())

    // after() fires synchronously in tests; allow micro-task queue to drain
    await new Promise((r) => setTimeout(r, 0))

    expect(mockTriggerTranscriptAnalysis).toHaveBeenCalledWith(TRANSCRIPT_ID, TENANT_ID)
  })

  // ── Happy path: file upload ───────────────────────────────────────────────────

  it('inserts transcript row and returns transcriptId on file upload happy path', async () => {
    const file = fakeTxtFile()
    const { uploadTranscript } = await import('@/actions/transcripts')

    const result = await uploadTranscript(null, fileFormData(file))

    expect(result.success).toBe(true)
    expect((result as { success: true; transcriptId: string }).transcriptId).toBe(TRANSCRIPT_ID)

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const arg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(arg.analysisStatus).toBe('pending')
    // .txt file → sourceFormat 'txt'
    expect(arg.sourceFormat).toBe('txt')
  })
})
