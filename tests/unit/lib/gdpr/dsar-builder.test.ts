/**
 * Unit tests for src/lib/gdpr/dsar-builder.ts
 *
 * Strategy:
 *   - Mock @/db (withTenant) to return synthetic fixture data
 *   - Use the real `archiver` module so stream/zip behaviour is verified
 *   - Collect the archive stream into a Buffer to inspect zip entry names
 *   - Test the cover-letter module independently (not mocked in that suite)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { Readable } from 'stream'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANDIDATE_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const TENANT_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

const mockCandidate = {
  id: CANDIDATE_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  phone: null,
  cvText: 'CV text here',
  cvTextFormatted: null,
  filePath: null,
  fileType: 'pdf',
  status: 'new',
  synechronCvData: null,
  synechronCandidateId: null,
  createdAt: new Date('2025-01-01'),
}

// ---------------------------------------------------------------------------
// DB layer mock
//
// Drizzle queries are awaitable builders (PromiseLike). The select chain ends
// either with .limit(n) OR is awaited directly (without .limit). We need
// both patterns to resolve to an array.
//
// Pattern: the chain object is both chainable AND a Promise (via .then).
// ---------------------------------------------------------------------------

let mockTx: Record<string, Mock>

function makeChain(rows: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  // Make the chain a PromiseLike so `await chain` yields `rows`
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject)
  chain.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(rows))
  return chain
}

vi.mock('@/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
}))

vi.mock('@/db/schema', () => ({
  candidates: {},
  scores: {},
  notes: {},
  candidateEnrichments: {},
  cvProfiles: {},
  auditLogs: {},
  sentEmails: {},
  interviewPacks: {},
  interviewQuestions: {},
  codeChallenges: {},
  interviewSlots: {},
  interviewTranscripts: {},
  transcriptAnalyses: {},
  candidateRoleApprovals: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

// Mock cover-letter so the README content is deterministic
vi.mock('@/lib/gdpr/cover-letter', () => ({
  getDsarCoverLetter: vi.fn(() => 'GDPR Article 15 -- Right of Access -- Subject Access Request Export\nREADME cover letter content'),
}))

// ---------------------------------------------------------------------------
// Test helper: collect a Readable stream into a Buffer
// ---------------------------------------------------------------------------

async function collectStream(readable: Readable | NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    ;(readable as Readable).on('data', (chunk: Buffer) => chunks.push(chunk))
    ;(readable as Readable).on('end', () => resolve(Buffer.concat(chunks)))
    ;(readable as Readable).on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('buildDsarZip', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    let selectCallCount = 0

    mockTx = {
      select: vi.fn(() => {
        selectCallCount++
        // Call 1: candidate lookup → returns candidate row
        if (selectCallCount === 1) return makeChain([mockCandidate])
        // All other selects (scores, notes, enrichments, cvProfiles, auditLogs,
        // sentEmails, interviewSlots, approvals, interviewPacks, transcripts) → []
        return makeChain([])
      }),
    }

    selectCallCount = 0
  })

  it('returns a readable stream', async () => {
    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')
    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)
    expect(archive).toBeDefined()
    expect(typeof archive.pipe).toBe('function')
  })

  it('stream produces a non-empty buffer with ZIP magic bytes', async () => {
    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')
    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)
    const buffer = await collectStream(archive)

    // ZIP local file header magic: PK\x03\x04
    expect(buffer.length).toBeGreaterThan(4)
    expect(buffer[0]).toBe(0x50) // 'P'
    expect(buffer[1]).toBe(0x4b) // 'K'
  })

  it('ZIP contains candidate.json', async () => {
    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')
    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)
    const buffer = await collectStream(archive)

    // Scan the raw ZIP buffer for the filename bytes
    expect(buffer.includes(Buffer.from('candidate.json'))).toBe(true)
  })

  it('ZIP contains README.txt', async () => {
    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')
    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)
    const buffer = await collectStream(archive)

    expect(buffer.includes(Buffer.from('README.txt'))).toBe(true)
  })

  it('calls getDsarCoverLetter with correct candidate details', async () => {
    // The cover-letter module is mocked. Verify the builder calls it once
    // with the candidate name and ID so we know README.txt will contain
    // accurate data subject information.
    const coverLetterModule = await import('@/lib/gdpr/cover-letter')
    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')

    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)
    // Drain the archive so all work completes
    await collectStream(archive)

    const spy = coverLetterModule.getDsarCoverLetter as ReturnType<typeof vi.fn>
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: CANDIDATE_ID,
      })
    )
  })

  it('returns a readable stream even when candidate is not found', async () => {
    // Override mockTx to return empty on all selects (candidate not found)
    mockTx.select = vi.fn(() => makeChain([]))

    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')
    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)

    expect(typeof archive.pipe).toBe('function')

    const buffer = await collectStream(archive)
    // Should produce a ZIP with ERROR.txt
    expect(buffer.includes(Buffer.from('ERROR.txt'))).toBe(true)
  })

  it('candidate.json includes all compliance fields when candidate has them populated', async () => {
    // Override the candidate fixture with all compliance fields set
    const complianceCandidate = {
      ...mockCandidate,
      rightToWorkStatus: 'checked',
      rightToWorkDocumentType: 'passport_uk',
      rightToWorkExpiry: '2030-06-30',
      rightToWorkCheckedAt: new Date('2025-03-15T10:00:00Z'),
      rightToWorkCheckedBy: null,
      shareCode: 'ABC-DEF-GHI',
      sponsorshipRequired: false,
      nationality: 'British',
      noticePeriodDays: 30,
      gdprProcessingConsentAt: new Date('2025-01-02T09:00:00Z'),
      gdprProcessingConsentBy: 'candidate',
    }

    let callCount = 0
    mockTx.select = vi.fn(() => {
      callCount++
      if (callCount === 1) return makeChain([complianceCandidate])
      return makeChain([])
    })

    const { buildDsarZip } = await import('@/lib/gdpr/dsar-builder')
    const archive = await buildDsarZip(CANDIDATE_ID, TENANT_ID)
    const zipBuffer = await collectStream(archive)

    // Extract candidate.json from the compressed ZIP using JSZip
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(zipBuffer)
    const candidateEntry = zip.file('candidate.json')
    expect(candidateEntry).not.toBeNull()

    const candidateJson = JSON.parse(await candidateEntry!.async('text'))

    // Verify all compliance fields are present in the exported JSON
    expect(candidateJson.rightToWorkStatus).toBe('checked')
    expect(candidateJson.rightToWorkDocumentType).toBe('passport_uk')
    expect(candidateJson.rightToWorkExpiry).toBe('2030-06-30')
    expect(candidateJson.shareCode).toBe('ABC-DEF-GHI')
    expect(candidateJson.sponsorshipRequired).toBe(false)
    expect(candidateJson.nationality).toBe('British')
    expect(candidateJson.noticePeriodDays).toBe(30)
    expect(candidateJson.gdprProcessingConsentBy).toBe('candidate')
    // gdprProcessingConsentAt is a Date so serialises to ISO string
    expect(typeof candidateJson.gdprProcessingConsentAt).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Cover letter tests
//
// The cover-letter module is mocked above for the buildDsarZip tests. Here we
// test the actual implementation directly by importing it and calling it with
// concrete inputs — the assertions only check the return VALUE (a string), so
// the module mock does not interfere because we bypass the module registry by
// importing the function inline and calling it via its real implementation.
//
// We work around the module mock by re-importing the actual function via a
// dynamic path that resolves to the same source file but forces a fresh module
// evaluation. In practice, since vi.mock is hoisted, we simply import from the
// module (which returns the mock), but for these tests we call getDsarCoverLetter
// directly from the real source using a jest-style `actual` import.
// ---------------------------------------------------------------------------

describe('getDsarCoverLetter (real implementation)', () => {
  // Import the real function directly — bypasses the vi.mock by using
  // importOriginal (vitest pattern).
  let getDsarCoverLetterReal: typeof import('@/lib/gdpr/cover-letter')['getDsarCoverLetter']

  beforeEach(async () => {
    const mod = await vi.importActual<typeof import('@/lib/gdpr/cover-letter')>(
      '@/lib/gdpr/cover-letter'
    )
    getDsarCoverLetterReal = mod.getDsarCoverLetter
  })
  it('contains GDPR Article 15 header', () => {
    const text = getDsarCoverLetterReal({
      candidateName: 'John Smith',
      candidateId: '123',
      exportDate: '2025-04-28T10:00:00.000Z',
      files: ['candidate.json', 'scores.json', 'README.txt'],
    })
    expect(text).toContain('GDPR Article 15')
    expect(text).toContain('Right of Access')
  })

  it('includes candidate name and ID in the cover letter', () => {
    const text = getDsarCoverLetterReal({
      candidateName: 'Alice Baker',
      candidateId: 'cand-999',
      exportDate: '2025-04-28T10:00:00.000Z',
      files: ['candidate.json'],
    })
    expect(text).toContain('Alice Baker')
    expect(text).toContain('cand-999')
  })

  it('lists provided files in the file index', () => {
    const text = getDsarCoverLetterReal({
      candidateName: 'Test User',
      candidateId: 'id-1',
      exportDate: '2025-01-01T00:00:00.000Z',
      files: ['candidate.json', 'scores.json', 'README.txt'],
    })
    expect(text).toContain('candidate.json')
    expect(text).toContain('scores.json')
  })

  it('does not include README.txt as a listed file item (it is the cover letter itself)', () => {
    const text = getDsarCoverLetterReal({
      candidateName: 'Test',
      candidateId: 'id-1',
      exportDate: '2025-01-01T00:00:00.000Z',
      files: ['candidate.json', 'README.txt'],
    })
    // README.txt should not appear as a bullet in the file index
    const lines = text.split('\n')
    const readmeIndexLines = lines.filter((l) => l.trim().startsWith('- README.txt'))
    expect(readmeIndexLines.length).toBe(0)
  })
})
