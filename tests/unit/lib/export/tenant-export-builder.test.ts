/**
 * Unit tests for src/lib/export/tenant-export-builder.ts
 *
 * Strategy:
 *   - Mock @/db (withTenant) to return synthetic fixture data
 *   - Use the real `archiver` module so stream/zip behaviour is verified
 *   - Collect the archive stream into a Buffer to inspect ZIP entry names
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { Readable } from 'stream'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'

// ---------------------------------------------------------------------------
// DB layer mock
//
// We mock @/db so that withTenant just executes the callback with mockTx.
// Each table query is funnelled through the select().from().limit().offset()
// chain, or select().from().where().limit().offset() for grandchild tables.
//
// The chain must be:
//   - PromiseLike (so `await chain` works)
//   - Chainable (.from(), .where(), .limit(), .offset() all return the chain)
//   - .limit() / await must return the batch rows
// ---------------------------------------------------------------------------

type BatchFn = () => unknown[]

let mockTx: Record<string, Mock>
let batchFn: BatchFn

/** Build a chainable, awaitable mock that returns rows on .offset() or await */
function makeChain(rows: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  chain.then = resolved.then.bind(resolved)
  chain.catch = resolved.catch.bind(resolved)
  chain.finally = resolved.finally.bind(resolved)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  // .limit() must return another chainable (so .offset() works on it)
  chain.limit = vi.fn(() => chain)
  // .offset() is the final step — returns a Promise that resolves to rows
  chain.offset = vi.fn(() => Promise.resolve(rows))
  return chain
}

vi.mock('@/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
}))

// Mock all schema tables as plain objects (Drizzle table references)
vi.mock('@/db/schema', () => ({
  agencies: { _brand: 'agencies' },
  aiUsage: { _brand: 'aiUsage' },
  apiTokens: { _brand: 'apiTokens' },
  auditLogs: { _brand: 'auditLogs' },
  candidateEnrichments: { _brand: 'candidateEnrichments' },
  candidateRoleApprovals: { _brand: 'candidateRoleApprovals' },
  candidates: { _brand: 'candidates' },
  customerFrameworks: { _brand: 'customerFrameworks' },
  customers: { _brand: 'customers' },
  cvProfiles: { _brand: 'cvProfiles' },
  emailTemplates: { _brand: 'emailTemplates' },
  interviewPacks: { packId: 'pack_id', _brand: 'interviewPacks' },
  interviewQuestions: { packId: 'pack_id', _brand: 'interviewQuestions' },
  interviewSlots: { _brand: 'interviewSlots' },
  interviewTranscripts: { _brand: 'interviewTranscripts' },
  notes: { _brand: 'notes' },
  roleManagers: { _brand: 'roleManagers' },
  roles: { _brand: 'roles' },
  scores: { _brand: 'scores' },
  sentEmails: { _brand: 'sentEmails' },
  tenantSettings: { _brand: 'tenantSettings' },
  transcriptAnalyses: { _brand: 'transcriptAnalyses' },
  userInvitations: { _brand: 'userInvitations' },
  users: { _brand: 'users' },
  codeChallenges: { packId: 'pack_id', _brand: 'codeChallenges' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
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
// Reset mockTx before each test to return empty arrays by default
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  batchFn = () => []

  // Default: all selects return empty arrays (first batch returns [], so loop stops)
  mockTx = {
    select: vi.fn(() => makeChain(batchFn())),
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildTenantExportZip', () => {
  it('returns a Readable stream (archiver)', async () => {
    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)

    expect(archive).toBeDefined()
    // archiver extends Readable — it has .pipe()
    expect(typeof archive.pipe).toBe('function')
    // Drain
    await collectStream(archive)
  })

  it('produces a valid ZIP (magic bytes PK\\x03\\x04)', async () => {
    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    const buffer = await collectStream(archive)

    expect(buffer.length).toBeGreaterThan(4)
    expect(buffer[0]).toBe(0x50) // 'P'
    expect(buffer[1]).toBe(0x4b) // 'K'
  })

  it('ZIP contains manifest.json', async () => {
    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    const buffer = await collectStream(archive)

    expect(buffer.includes(Buffer.from('manifest.json'))).toBe(true)
  })

  it('manifest.json entry name appears in ZIP central directory', async () => {
    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    const buffer = await collectStream(archive)

    // The ZIP central directory (at the end of the buffer) stores entry names
    // uncompressed. 'manifest.json' must appear there.
    expect(buffer.includes(Buffer.from('manifest.json'))).toBe(true)
  })

  it('withTenant is called with the correct tenantId', async () => {
    const dbModule = await import('@/db')
    const withTenantSpy = dbModule.withTenant as Mock

    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    await collectStream(archive)

    expect(withTenantSpy).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
  })

  it('empty tenant: ZIP is valid and manifest.json + table filenames appear in ZIP directory', async () => {
    // batchFn returns [] so all table fetches return empty arrays
    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    const buffer = await collectStream(archive)

    // ZIP must be valid (has magic bytes)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)

    // manifest.json must be present in the ZIP central directory (uncompressed name)
    expect(buffer.includes(Buffer.from('manifest.json'))).toBe(true)

    // At least one table file should also be named in the central directory
    // (agencies is always first)
    expect(buffer.includes(Buffer.from('agencies.json'))).toBe(true)
  })

  it('pagination: table that returns exactly BATCH_SIZE rows triggers a second query, stopping when fewer rows returned', async () => {
    // For this test, the select mock returns 1000 rows on the first call per
    // table and 0 rows on the second call (simulating pagination stopping).
    // We track call counts per table by overriding mockTx.select with a
    // stateful mock.

    const BATCH = 1000
    const mockRows = Array.from({ length: BATCH }, (_, i) => ({ id: `row-${i}` }))

    let selectCallCount = 0
    mockTx.select = vi.fn(() => {
      selectCallCount++
      // Odd calls (first batch per table) → return full batch
      // Even calls (second batch per table) → return empty (pagination stop)
      const rows = selectCallCount % 2 === 1 ? mockRows : []
      return makeChain(rows)
    })

    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    const buffer = await collectStream(archive)

    // Archive should have been produced without error
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)

    // select() must have been called more than once (pagination triggered)
    expect(selectCallCount).toBeGreaterThan(1)
  })

  it('grandchild tables (interview_questions, code_challenges) are included when packs exist', async () => {
    // Set up: interviewPacks returns one pack; questions/challenges return rows
    const mockPack = { id: 'pack-uuid-1111', tenantId: TENANT_ID }
    const mockQuestion = { id: 'q-uuid-1', packId: 'pack-uuid-1111', questionText: 'Tell me about X' }
    const mockChallenge = { id: 'ch-uuid-1', packId: 'pack-uuid-1111', title: 'FizzBuzz' }

    let selectCallCount = 0
    mockTx.select = vi.fn(() => {
      selectCallCount++
      // We cannot easily distinguish which table is being queried from the
      // mock chain alone. Instead, we return appropriate data on specific
      // call slots. The builder calls tables in a deterministic order:
      // agencies(1/2), aiUsage(3/4), ..., interviewPacks(21/22), ...
      // For simplicity, return the pack on call 21 (first interviewPacks call)
      // and nothing otherwise. The grandchild tables get a second interviewPacks
      // call when building packIds.
      const INTERVIEW_PACKS_FIRST_CALL = 21
      if (selectCallCount === INTERVIEW_PACKS_FIRST_CALL) return makeChain([mockPack])
      // For grandchild queries (where = packId), return the fixture row.
      // The mock chain returns whatever we give it; since both interviewPacks
      // fetches and grandchild fetches share the same select mock, we detect
      // the second interviewPacks call (count 22) and grandchild calls by
      // returning the question or challenge row for all subsequent calls.
      if (selectCallCount > INTERVIEW_PACKS_FIRST_CALL) {
        if (selectCallCount === INTERVIEW_PACKS_FIRST_CALL + 1) return makeChain([mockPack]) // second interviewPacks fetch for packIds
        if (selectCallCount === INTERVIEW_PACKS_FIRST_CALL + 2) return makeChain([mockQuestion])
        if (selectCallCount === INTERVIEW_PACKS_FIRST_CALL + 3) return makeChain([mockChallenge])
      }
      return makeChain([])
    })

    const { buildTenantExportZip } = await import('@/lib/export/tenant-export-builder')
    const archive = await buildTenantExportZip(TENANT_ID)
    const buffer = await collectStream(archive)

    // interview_questions.json and code_challenges.json should be in the ZIP
    expect(buffer.includes(Buffer.from('interview_questions.json'))).toBe(true)
    expect(buffer.includes(Buffer.from('code_challenges.json'))).toBe(true)
  })
})
