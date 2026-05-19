/**
 * Unit tests for src/lib/calendar/sync-loop.ts — runCalendarSync()
 *
 * Strategy:
 *   - Mock @/db (db.select chain + withTenant) to return synthetic data
 *   - Mock @/lib/calendar/list-google-events and list-microsoft-events
 *   - Mock @/lib/audit to capture audit calls without side-effects
 *   - Mock @/lib/crypto to pass through plaintext (no real encryption in tests)
 *   - No real DB, calendar API, or file system touched
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER_ID = 'bbbbbbbb-0000-4000-8000-000000000002'
const CONN_ID = 'cccccccc-0000-4000-8000-000000000003'
const SLOT_ID = 'dddddddd-0000-4000-8000-000000000004'
const GOOGLE_EVENT_ID = 'google-event-abc123'

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// Tracks calls to the bare db.select() chain (used for calendarConnections and users)
let mockDbSelectImpl: Mock

// Tracks the transaction callback passed to withTenant
let mockTxImpl: Record<string, Mock>

// Chainable drizzle-like query builder
function makeChain(rows: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  chain.then = (resolve: (v: unknown) => void, _reject?: (e: unknown) => void) =>
    Promise.resolve(rows).then(resolve)
  chain.catch = (_reject: (e: unknown) => void) => Promise.resolve(rows)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(rows))
  chain.select = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  return chain
}

// ---------------------------------------------------------------------------
// Mocks — declared before any imports of the module under test
// ---------------------------------------------------------------------------

vi.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelectImpl(...args),
    update: vi.fn(() => makeChain([])),
  },
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockTxImpl)
  ),
}))

vi.mock('@/db/schema', () => ({
  calendarConnections: { id: 'id', userId: 'user_id', provider: 'provider' },
  interviewSlots: {
    id: 'id',
    tenantId: 'tenant_id',
    createdBy: 'created_by',
    googleEventId: 'google_event_id',
    microsoftEventId: 'microsoft_event_id',
    status: 'status',
    scheduledAt: 'scheduled_at',
    durationMinutes: 'duration_minutes',
    updatedAt: 'updated_at',
    title: 'title',
  },
  users: { id: 'id', tenantId: 'tenant_id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNotNull: vi.fn(() => ({ type: 'isNotNull' })),
}))

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
}))

const mockWriteAuditLog = vi.fn()
vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockListGoogleEvents = vi.fn()
vi.mock('@/lib/calendar/list-google-events', () => ({
  listGoogleEvents: (...args: unknown[]) => mockListGoogleEvents(...args),
}))

const mockListMicrosoftEvents = vi.fn()
vi.mock('@/lib/calendar/list-microsoft-events', () => ({
  listMicrosoftEvents: (...args: unknown[]) => mockListMicrosoftEvents(...args),
}))

// ---------------------------------------------------------------------------
// Import module under test AFTER all mocks are declared
// ---------------------------------------------------------------------------

import { runCalendarSync } from '@/lib/calendar/sync-loop'

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeConnection(overrides: Partial<{
  id: string
  userId: string
  provider: string
  accessToken: string
  refreshToken: string | null
  tokenExpiry: Date | null
  calendarId: string | null
}> = {}) {
  return {
    id: CONN_ID,
    userId: USER_ID,
    provider: 'google',
    accessToken: 'enc:tok-access',
    refreshToken: 'enc:tok-refresh',
    tokenExpiry: null,
    calendarId: 'primary',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeSlot(overrides: Partial<{
  id: string
  tenantId: string
  createdBy: string
  googleEventId: string | null
  microsoftEventId: string | null
  status: string
  scheduledAt: Date
  durationMinutes: number
  updatedAt: Date
  title: string
}> = {}) {
  return {
    id: SLOT_ID,
    tenantId: TENANT_ID,
    candidateId: 'cand-id',
    roleId: null,
    interviewerId: null,
    createdBy: USER_ID,
    googleEventId: GOOGLE_EVENT_ID,
    microsoftEventId: null,
    status: 'scheduled',
    scheduledAt: new Date('2026-05-01T10:00:00Z'),
    durationMinutes: 60,
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    title: 'Interview',
    location: null,
    meetingUrl: null,
    slotNotes: null,
    createdAt: new Date('2026-04-01'),
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<{
  eventId: string
  start: Date | null
  end: Date | null
  status: string
  updated: Date
  summary: string | null
}> = {}) {
  return {
    eventId: GOOGLE_EVENT_ID,
    start: new Date('2026-05-01T10:00:00Z'),
    end: new Date('2026-05-01T11:00:00Z'),
    status: 'confirmed',
    updated: new Date('2026-04-01T00:00:00Z'),
    summary: 'Interview',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// beforeEach — reset mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Default: bare db.select() call count tracks:
  //   1st call = calendarConnections query → connections list
  //   2nd call = users query → user with tenantId
  let selectCallCount = 0
  mockDbSelectImpl = vi.fn(() => {
    selectCallCount++
    const callIndex = selectCallCount
    return makeChain(
      callIndex === 1
        ? [makeConnection()] // calendarConnections
        : [{ tenantId: TENANT_ID }] // users
    )
  })

  // Default: withTenant tx has a select that returns one slot + empty update
  mockTxImpl = {
    select: vi.fn(() => makeChain([makeSlot()])),
    update: vi.fn(() => makeChain([])),
  }

  // Default: listGoogleEvents returns matching snapshot (no change)
  mockListGoogleEvents.mockResolvedValue({
    events: [makeSnapshot()],
    refreshedToken: null,
  })

  mockWriteAuditLog.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runCalendarSync', () => {
  it('1. no connections → returns all-zero summary, no audit calls', async () => {
    // Override: first db.select returns empty connections
    mockDbSelectImpl = vi.fn(() => makeChain([]))

    const summary = await runCalendarSync()

    expect(summary).toEqual({
      totalConnections: 0,
      processedConnections: 0,
      syncedSlots: 0,
      rescheduledCount: 0,
      cancelledCount: 0,
      errors: [],
    })
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('2. connection with no slots → counts unchanged, no errors', async () => {
    // tx.select returns empty slots array
    mockTxImpl.select = vi.fn(() => makeChain([]))

    const summary = await runCalendarSync()

    expect(summary.totalConnections).toBe(1)
    expect(summary.processedConnections).toBe(1)
    expect(summary.rescheduledCount).toBe(0)
    expect(summary.cancelledCount).toBe(0)
    expect(summary.errors).toHaveLength(0)
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('3. reschedule detected — event start changed → slot updated + audit fired', async () => {
    // Use a date 7 days in the future so the past-event skip (event.start < now-1d) never fires
    const newStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const newEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000)
    // Event snapshot has a different start than the slot
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot({
        start: newStart,
        end: newEnd,
        // updated slightly newer than slot.updatedAt
        updated: new Date('2026-04-02T00:00:00Z'),
      })],
      refreshedToken: null,
    })

    const summary = await runCalendarSync()

    expect(summary.rescheduledCount).toBe(1)
    expect(summary.cancelledCount).toBe(0)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'interview_slot.rescheduled_external' })
    )
  })

  it('4. cancellation when event id missing from returned list → slot cancelled', async () => {
    // Return events list that does NOT contain the slot's eventId
    mockListGoogleEvents.mockResolvedValue({
      events: [],
      refreshedToken: null,
    })

    const summary = await runCalendarSync()

    expect(summary.cancelledCount).toBe(1)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'interview_slot.cancelled_external' })
    )
  })

  it('5. cancellation when event status=cancelled → slot cancelled', async () => {
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot({ status: 'cancelled' })],
      refreshedToken: null,
    })

    const summary = await runCalendarSync()

    expect(summary.cancelledCount).toBe(1)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'interview_slot.cancelled_external' })
    )
  })

  it('6. conflict resolution — slot.updatedAt > event.updated → skip (no write, no audit)', async () => {
    // slot.updatedAt is in the future relative to event.updated
    const slotUpdatedAt = new Date('2026-04-10T00:00:00Z')
    const eventUpdated = new Date('2026-04-05T00:00:00Z') // older than slot
    const newStart = new Date('2026-05-03T09:00:00Z') // start changed

    mockTxImpl.select = vi.fn(() => makeChain([
      makeSlot({ updatedAt: slotUpdatedAt }),
    ]))
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot({ start: newStart, updated: eventUpdated })],
      refreshedToken: null,
    })

    const summary = await runCalendarSync()

    expect(summary.rescheduledCount).toBe(0)
    expect(summary.cancelledCount).toBe(0)
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
    // update should not be called on the transaction
    expect(mockTxImpl.update).not.toHaveBeenCalled()
  })

  it('7. past event skip — event.start < now() - 1d → skip entirely', async () => {
    const pastStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    const pastEnd = new Date(pastStart.getTime() + 60 * 60 * 1000)
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot({
        start: pastStart,
        end: pastEnd,
        updated: new Date('2026-04-02T00:00:00Z'),
      })],
      refreshedToken: null,
    })

    const summary = await runCalendarSync()

    expect(summary.rescheduledCount).toBe(0)
    expect(summary.cancelledCount).toBe(0)
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('8. failure isolation — first connection throws, second still processed', async () => {
    const conn1 = makeConnection({ id: 'conn-1', userId: 'user-1' })
    const conn2 = makeConnection({ id: 'conn-2', userId: 'user-2' })

    let selectCallCount = 0
    mockDbSelectImpl = vi.fn(() => {
      selectCallCount++
      if (selectCallCount === 1) return makeChain([conn1, conn2]) // connections
      // users queries — both resolve to the same tenant for simplicity
      return makeChain([{ tenantId: TENANT_ID }])
    })

    // First connection throws during listGoogleEvents
    let googleCallCount = 0
    mockListGoogleEvents.mockImplementation(async () => {
      googleCallCount++
      if (googleCallCount === 1) throw new Error('API timeout')
      return { events: [], refreshedToken: null }
    })

    // Both connections have slots
    mockTxImpl.select = vi.fn(() => makeChain([makeSlot()]))

    const summary = await runCalendarSync()

    expect(summary.totalConnections).toBe(2)
    expect(summary.errors).toHaveLength(1)
    expect(summary.errors[0].connectionId).toBe('conn-1')
    expect(summary.errors[0].error).toContain('API timeout')
    // Second connection should have been processed
    expect(summary.processedConnections).toBe(1)
  })

  it('9. token refresh persistence — refreshedToken returned → DB update called', async () => {
    const newToken = { accessToken: 'new-access-token', expiresAt: new Date('2026-05-01') }
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot()],
      refreshedToken: newToken,
    })

    const { db } = await import('@/db')
    const { encrypt } = await import('@/lib/crypto')

    await runCalendarSync()

    // db.update should have been called to persist the refreshed token
    expect(db.update).toHaveBeenCalledWith(
      expect.anything() // calendarConnections table
    )
    // The encrypted new token should be passed to set()
    expect(encrypt).toHaveBeenCalledWith(newToken.accessToken)
  })

  it('10. idempotency — running twice with no changes produces zero updates/audits', async () => {
    // Event matches slot exactly (same start, same duration) and updated is older
    // than slot.updatedAt so the conflict-resolution skip fires.
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot({
        start: new Date('2026-05-01T10:00:00Z'),
        end: new Date('2026-05-01T11:00:00Z'),
        status: 'confirmed',
        updated: new Date('2026-03-01T00:00:00Z'), // older than slot.updatedAt — SkillAI wins
      })],
      refreshedToken: null,
    })

    // Reset the select mock so it works correctly for BOTH runCalendarSync calls
    // without sharing closure state across calls.
    function makeSelectImpl() {
      let callCount = 0
      return vi.fn(() => {
        callCount++
        return makeChain(callCount === 1 ? [makeConnection()] : [{ tenantId: TENANT_ID }])
      })
    }
    mockDbSelectImpl = makeSelectImpl()

    const summary1 = await runCalendarSync()

    // Reset select impl for the second call
    mockDbSelectImpl = makeSelectImpl()
    vi.clearAllMocks()
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockListGoogleEvents.mockResolvedValue({
      events: [makeSnapshot({
        start: new Date('2026-05-01T10:00:00Z'),
        end: new Date('2026-05-01T11:00:00Z'),
        status: 'confirmed',
        updated: new Date('2026-03-01T00:00:00Z'),
      })],
      refreshedToken: null,
    })

    const summary2 = await runCalendarSync()

    expect(summary1.rescheduledCount).toBe(0)
    expect(summary1.cancelledCount).toBe(0)
    expect(summary2.rescheduledCount).toBe(0)
    expect(summary2.cancelledCount).toBe(0)
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
    expect(mockTxImpl.update).not.toHaveBeenCalled()
  })
})
