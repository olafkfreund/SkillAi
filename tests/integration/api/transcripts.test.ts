/**
 * Integration tests for transcript API routes
 *
 * Mocks auth, DB (withTenant), and the background trigger.
 * Tests: upload, status, full fetch, candidate list.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Auth mock ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CANDIDATE_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const ROLE_ID = 'cccccccc-0000-0000-0000-000000000003'
const TRANSCRIPT_ID = 'dddddddd-0000-0000-0000-000000000004'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { tenantId: TENANT_ID, id: 'user-1', role: 'recruiter' },
  }),
}))

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
    })
  ),
}))

// ── Transcript parser mock ────────────────────────────────────────────────────
vi.mock('@/lib/parsers/transcript', () => ({
  parseTranscriptFile: vi.fn().mockResolvedValue({
    rawText: '[Interviewer]: Tell me about TypeScript.\n[Alice]: I love it.',
    cues: [
      { speaker: 'Interviewer', timestamp: 0, text: 'Tell me about TypeScript.' },
      { speaker: 'Alice', timestamp: 5000, text: 'I love it.' },
    ],
  }),
}))

// ── Background trigger mock ───────────────────────────────────────────────────
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn((fn: () => void) => fn()) }
})

vi.mock('@/lib/ai/transcript-analysis', () => ({
  triggerTranscriptAnalysis: vi.fn().mockResolvedValue(undefined),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost'), init)
}

function chainableMock(returnValue: unknown) {
  const m: Record<string, unknown> = {}
  const methods = ['from', 'where', 'limit', 'offset', 'leftJoin', 'orderBy', 'returning', 'values', 'set']
  methods.forEach((method) => {
    m[method] = vi.fn().mockReturnValue(m)
  })
  // Terminal: awaiting resolves to returnValue
  m[Symbol.iterator as unknown as string] = undefined
  // Make it thenable
  ;(m as Promise<unknown> & Record<string, unknown>).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(returnValue).then(resolve)
  return m
}

// ── Upload route tests ────────────────────────────────────────────────────────
describe('POST /api/transcripts/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: TRANSCRIPT_ID }]),
      }),
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/transcripts/upload/route')
    const req = makeRequest('http://localhost/api/transcripts/upload', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when candidateId is missing', async () => {
    const { POST } = await import('@/app/api/transcripts/upload/route')
    const formData = new FormData()
    formData.set('roleId', ROLE_ID)
    formData.set('text', 'Some transcript text')
    formData.set('platform', 'zoom')

    const req = makeRequest('http://localhost/api/transcripts/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when both file and text are missing', async () => {
    const { POST } = await import('@/app/api/transcripts/upload/route')
    const formData = new FormData()
    formData.set('candidateId', CANDIDATE_ID)
    formData.set('roleId', ROLE_ID)
    formData.set('platform', 'zoom')

    const req = makeRequest('http://localhost/api/transcripts/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('accepts text paste and returns transcriptId', async () => {
    const { POST } = await import('@/app/api/transcripts/upload/route')
    const formData = new FormData()
    formData.set('candidateId', CANDIDATE_ID)
    formData.set('roleId', ROLE_ID)
    formData.set('platform', 'zoom')
    formData.set('text', 'Alice: I love TypeScript.')

    const req = makeRequest('http://localhost/api/transcripts/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transcriptId).toBe(TRANSCRIPT_ID)
  })

  it('accepts file upload and returns transcriptId', async () => {
    const { POST } = await import('@/app/api/transcripts/upload/route')

    // jsdom's FormData does not properly serialize File objects through
    // NextRequest body. Spy on formData() to return a controlled result.
    const fakeFile = {
      name: 'transcript.vtt',
      type: 'text/vtt',
      size: 50,
      arrayBuffer: async () => Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n<v Alice>Hello'),
    }
    const fakeFormData = {
      get: (key: string) =>
        ({ candidateId: CANDIDATE_ID, roleId: ROLE_ID, platform: 'zoom',
           packId: null, text: null, interviewDate: null, file: fakeFile }[key] ?? null),
    }

    const req = makeRequest('http://localhost/api/transcripts/upload', { method: 'POST' })
    vi.spyOn(req, 'formData').mockResolvedValueOnce(fakeFormData as unknown as FormData)

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transcriptId).toBeDefined()
  })
})

// ── Status route tests ────────────────────────────────────────────────────────
describe('GET /api/transcripts/[transcriptId]/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValueOnce(null)

    const { GET } = await import('@/app/api/transcripts/[transcriptId]/status/route')
    const req = makeRequest(`http://localhost/api/transcripts/${TRANSCRIPT_ID}/status`)
    const res = await GET(req, { params: Promise.resolve({ transcriptId: TRANSCRIPT_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when transcript not found', async () => {
    mockSelect.mockReturnValue(chainableMock([]))
    const { GET } = await import('@/app/api/transcripts/[transcriptId]/status/route')
    const req = makeRequest(`http://localhost/api/transcripts/${TRANSCRIPT_ID}/status`)
    const res = await GET(req, { params: Promise.resolve({ transcriptId: TRANSCRIPT_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns analysisStatus when transcript found', async () => {
    mockSelect.mockReturnValue(
      chainableMock([{ analysisStatus: 'complete', errorMessage: null }])
    )
    const { GET } = await import('@/app/api/transcripts/[transcriptId]/status/route')
    const req = makeRequest(`http://localhost/api/transcripts/${TRANSCRIPT_ID}/status`)
    const res = await GET(req, { params: Promise.resolve({ transcriptId: TRANSCRIPT_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.analysisStatus).toBe('complete')
  })
})

// ── Full transcript fetch tests ───────────────────────────────────────────────
describe('GET /api/transcripts/[transcriptId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValueOnce(null)

    const { GET } = await import('@/app/api/transcripts/[transcriptId]/route')
    const req = makeRequest(`http://localhost/api/transcripts/${TRANSCRIPT_ID}`)
    const res = await GET(req, { params: Promise.resolve({ transcriptId: TRANSCRIPT_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when transcript not found', async () => {
    mockSelect.mockReturnValue(chainableMock([]))
    const { GET } = await import('@/app/api/transcripts/[transcriptId]/route')
    const req = makeRequest(`http://localhost/api/transcripts/${TRANSCRIPT_ID}`)
    const res = await GET(req, { params: Promise.resolve({ transcriptId: TRANSCRIPT_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns transcript with analysis when found', async () => {
    const mockTranscript = {
      id: TRANSCRIPT_ID,
      candidateId: CANDIDATE_ID,
      roleId: ROLE_ID,
      rawTranscriptText: '[Alice]: TypeScript is great.',
      analysisStatus: 'complete',
      analysis: { overallScore: 82 },
    }
    mockSelect.mockReturnValue(chainableMock([mockTranscript]))

    const { GET } = await import('@/app/api/transcripts/[transcriptId]/route')
    const req = makeRequest(`http://localhost/api/transcripts/${TRANSCRIPT_ID}`)
    const res = await GET(req, { params: Promise.resolve({ transcriptId: TRANSCRIPT_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(TRANSCRIPT_ID)
  })
})

// ── Candidate transcripts list tests ─────────────────────────────────────────
describe('GET /api/candidates/[candidateId]/transcripts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValueOnce(null)

    const { GET } = await import('@/app/api/candidates/[candidateId]/transcripts/route')
    const req = makeRequest(`http://localhost/api/candidates/${CANDIDATE_ID}/transcripts`)
    const res = await GET(req, { params: Promise.resolve({ candidateId: CANDIDATE_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns empty array when no transcripts', async () => {
    mockSelect.mockReturnValue(chainableMock([]))
    const { GET } = await import('@/app/api/candidates/[candidateId]/transcripts/route')
    const req = makeRequest(`http://localhost/api/candidates/${CANDIDATE_ID}/transcripts`)
    const res = await GET(req, { params: Promise.resolve({ candidateId: CANDIDATE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transcripts).toEqual([])
  })

  it('returns list of transcripts for candidate', async () => {
    const mockList = [
      { id: TRANSCRIPT_ID, analysisStatus: 'complete', createdAt: new Date() },
    ]
    mockSelect.mockReturnValue(chainableMock(mockList))

    const { GET } = await import('@/app/api/candidates/[candidateId]/transcripts/route')
    const req = makeRequest(`http://localhost/api/candidates/${CANDIDATE_ID}/transcripts`)
    const res = await GET(req, { params: Promise.resolve({ candidateId: CANDIDATE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transcripts).toHaveLength(1)
    expect(body.transcripts[0].id).toBe(TRANSCRIPT_ID)
  })
})
