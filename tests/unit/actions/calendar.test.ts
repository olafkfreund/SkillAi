/**
 * Unit tests for src/actions/calendar.ts
 *
 * Covers the *action* layer only. The sync-loop (runCalendarSync) is already
 * covered in tests/unit/lib/calendar/sync-loop.test.ts — we do NOT duplicate
 * that here.
 *
 * Actions under test:
 *   createInterviewSlot   — happy path, auth guard, validation guard, calendar
 *                           sync non-fatal failure.
 *   updateInterviewSlot   — happy path, slot-not-found, cancelled-slot guard.
 *   cancelInterviewSlot   — happy path, slot-not-found, auth guard.
 *   disconnectCalendar    — happy path (deletes row), no-ctx guard.
 *   getCalendarConnections — happy path for connected / empty.
 *   importIcsSlots        — happy path, auth guard, empty-file guard,
 *                           oversized-file guard, no-events guard, past-event skip.
 *
 * Mocks:
 *   @/db                            — db (direct delete/select), withTenant
 *   @/db/schema                     — interviewSlots, calendarConnections stubs
 *   drizzle-orm                     — eq / and / desc pass-throughs
 *   @/lib/auth/action-context       — getActionContext
 *   @/lib/audit                     — writeAuditLog
 *   @/lib/calendar/sync             — syncSlotToCalendars, deleteSlotFromCalendars
 *   @/lib/ics-parser                — parseIcsFile
 *   next/cache                      — revalidatePath silenced
 *   next/server                     — after silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID      = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CANDIDATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ROLE_ID      = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SLOT_ID      = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

// ── DB mock helpers ────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then    = resolved.then.bind(resolved)
  c.catch   = resolved.catch.bind(resolved)
  c.from    = vi.fn(() => c)
  c.where   = vi.fn(() => c)
  c.limit   = vi.fn(() => Promise.resolve(rows))
  c.orderBy = vi.fn(() => c)
  return c
}

// Per-test mutable state — each withTenant select call can return different rows
type SelectFactory = () => ReturnType<typeof makeSelectChain>
let selectFactory: SelectFactory

// Captured mutation calls
const mockInsertValues          = vi.fn()
const mockInsertReturning       = vi.fn()
const mockUpdateSet             = vi.fn()
const mockUpdateWhere           = vi.fn()
const mockUpdateReturning       = vi.fn()
const mockDeleteWhere           = vi.fn()
// direct db.* calls (disconnectCalendar, getCalendarConnections)
const mockDbDeleteWhere         = vi.fn()
const mockDbSelectChainRows     = vi.fn().mockReturnValue([])

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => {
      const rows = mockDbSelectChainRows()
      return makeSelectChain(rows)
    }),
    delete: vi.fn(() => ({
      where: (...args: unknown[]) => {
        mockDbDeleteWhere(...args)
        return Promise.resolve()
      },
    })),
  },
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => selectFactory()),

        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return {
              returning: (...rargs: unknown[]) => {
                mockInsertReturning(...rargs)
                return Promise.resolve([{ id: SLOT_ID }])
              },
            }
          },
        })),

        update: vi.fn(() => ({
          set: (...args: unknown[]) => {
            mockUpdateSet(...args)
            return {
              where: (...wargs: unknown[]) => {
                mockUpdateWhere(...wargs)
                return {
                  returning: (...rargs: unknown[]) => {
                    mockUpdateReturning(...rargs)
                    return Promise.resolve()
                  },
                }
              },
            }
          },
        })),

        delete: vi.fn(() => ({
          where: (...wargs: unknown[]) => {
            mockDeleteWhere(...wargs)
            return Promise.resolve()
          },
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  interviewSlots: {
    id:                 'id',
    tenantId:           'tenant_id',
    candidateId:        'candidate_id',
    roleId:             'role_id',
    title:              'title',
    scheduledAt:        'scheduled_at',
    durationMinutes:    'duration_minutes',
    location:           'location',
    meetingUrl:         'meeting_url',
    slotNotes:          'slot_notes',
    status:             'status',
    createdBy:          'created_by',
    googleEventId:      'google_event_id',
    microsoftEventId:   'microsoft_event_id',
    updatedAt:          'updated_at',
  },
  calendarConnections: {
    id:       'id',
    userId:   'user_id',
    provider: 'provider',
    tenantId: 'tenant_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:   vi.fn(() => ({ type: 'eq' })),
  and:  vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn(() => ({ type: 'desc' })),
  or:   vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

const mockSyncSlotToCalendars    = vi.fn()
const mockDeleteSlotFromCalendars = vi.fn()
vi.mock('@/lib/calendar/sync', () => ({
  syncSlotToCalendars:     (...args: unknown[]) => mockSyncSlotToCalendars(...args),
  deleteSlotFromCalendars: (...args: unknown[]) => mockDeleteSlotFromCalendars(...args),
}))

const mockParseIcsFile = vi.fn()
vi.mock('@/lib/ics-parser', () => ({
  parseIcsFile: (...args: unknown[]) => mockParseIcsFile(...args),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({
  after: vi.fn((fn: () => void) => {
    try { fn() } catch {}
  }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function adminCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'admin' as const }
}

function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    id:               SLOT_ID,
    tenantId:         TENANT_ID,
    candidateId:      CANDIDATE_ID,
    roleId:           ROLE_ID,
    title:            'Technical Interview',
    scheduledAt:      new Date('2026-06-15T10:00:00Z'),
    durationMinutes:  60,
    location:         null,
    meetingUrl:       null,
    slotNotes:        null,
    status:           'scheduled',
    createdBy:        USER_ID,
    googleEventId:    null,
    microsoftEventId: null,
    updatedAt:        new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  }
}

const BASE_SLOT_INPUT = {
  candidateId:     CANDIDATE_ID,
  roleId:          ROLE_ID,
  title:           'Technical Interview',
  scheduledAt:     '2026-06-15T10:00:00+00:00',
  durationMinutes: 60,
  syncToCalendar:  false,
}

// ── createInterviewSlot ────────────────────────────────────────────────────────

describe('createInterviewSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = () => makeSelectChain([makeSlot()])
    mockSyncSlotToCalendars.mockResolvedValue({ googleEventId: null, microsoftEventId: null })
    mockDeleteSlotFromCalendars.mockResolvedValue(undefined)
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { createInterviewSlot } = await import('@/actions/calendar')

    const result = await createInterviewSlot(BASE_SLOT_INPUT)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when scheduledAt is missing', async () => {
    const { createInterviewSlot } = await import('@/actions/calendar')

    const result = await createInterviewSlot({
      ...BASE_SLOT_INPUT,
      scheduledAt: '',
    })

    expect(result.success).toBe(false)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('returns error when title is empty', async () => {
    const { createInterviewSlot } = await import('@/actions/calendar')

    const result = await createInterviewSlot({
      ...BASE_SLOT_INPUT,
      title: '',
    })

    expect(result.success).toBe(false)
  })

  it('inserts slot row and returns slotId on happy path', async () => {
    const { createInterviewSlot } = await import('@/actions/calendar')

    const result = await createInterviewSlot(BASE_SLOT_INPUT)

    expect(result.success).toBe(true)
    expect((result as { success: true; slotId: string }).slotId).toBe(SLOT_ID)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.candidateId).toBe(CANDIDATE_ID)
    expect(insertArg.status).toBe('scheduled')
    expect(insertArg.createdBy).toBe(USER_ID)
  })

  it('writes interview_slot.created audit log on happy path', async () => {
    const { createInterviewSlot } = await import('@/actions/calendar')

    await createInterviewSlot(BASE_SLOT_INPUT)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'interview_slot.created',
        entityType: 'interview_slot',
        entityId: SLOT_ID,
      })
    )
  })

  it('does not call syncSlotToCalendars when syncToCalendar=false', async () => {
    const { createInterviewSlot } = await import('@/actions/calendar')

    await createInterviewSlot({ ...BASE_SLOT_INPUT, syncToCalendar: false })

    expect(mockSyncSlotToCalendars).not.toHaveBeenCalled()
  })

  it('calls syncSlotToCalendars when syncToCalendar=true and stores returned event IDs', async () => {
    mockSyncSlotToCalendars.mockResolvedValue({
      googleEventId:    'google-evt-123',
      microsoftEventId: null,
    })
    const { createInterviewSlot } = await import('@/actions/calendar')

    const result = await createInterviewSlot({ ...BASE_SLOT_INPUT, syncToCalendar: true })

    expect(result.success).toBe(true)
    expect(mockSyncSlotToCalendars).toHaveBeenCalledTimes(1)
    // Second withTenant call stores the calendar IDs
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ googleEventId: 'google-evt-123', microsoftEventId: null })
    )
  })

  it('still succeeds when calendar sync throws (non-fatal)', async () => {
    mockSyncSlotToCalendars.mockRejectedValue(new Error('Google token expired'))
    const { createInterviewSlot } = await import('@/actions/calendar')

    const result = await createInterviewSlot({ ...BASE_SLOT_INPUT, syncToCalendar: true })

    // Calendar failure is swallowed — the slot was still created
    expect(result.success).toBe(true)
  })
})

// ── updateInterviewSlot ────────────────────────────────────────────────────────

describe('updateInterviewSlot', () => {
  const UPDATE_INPUT = {
    slotId:          SLOT_ID,
    candidateId:     CANDIDATE_ID,
    roleId:          ROLE_ID,
    title:           'Updated Interview',
    scheduledAt:     '2026-07-10T14:00:00+00:00',
    durationMinutes: 90,
    syncToCalendar:  false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    // First select returns the existing slot
    selectFactory = () => makeSelectChain([makeSlot()])
    mockSyncSlotToCalendars.mockResolvedValue({ googleEventId: null, microsoftEventId: null })
    mockDeleteSlotFromCalendars.mockResolvedValue(undefined)
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { updateInterviewSlot } = await import('@/actions/calendar')

    const result = await updateInterviewSlot(UPDATE_INPUT)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns slot-not-found error when slot does not exist', async () => {
    selectFactory = () => makeSelectChain([])  // no slot row
    const { updateInterviewSlot } = await import('@/actions/calendar')

    const result = await updateInterviewSlot(UPDATE_INPUT)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/not found/i)
  })

  it('returns error when slot is cancelled', async () => {
    selectFactory = () => makeSelectChain([makeSlot({ status: 'cancelled' })])
    const { updateInterviewSlot } = await import('@/actions/calendar')

    const result = await updateInterviewSlot(UPDATE_INPUT)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/cancelled/i)
  })

  it('updates slot and writes audit log on happy path', async () => {
    const { updateInterviewSlot } = await import('@/actions/calendar')

    const result = await updateInterviewSlot(UPDATE_INPUT)

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.title).toBe('Updated Interview')

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'interview_slot.updated',
        entityType: 'interview_slot',
        entityId: SLOT_ID,
      })
    )
  })

  it('deletes old calendar events when slot previously had a googleEventId', async () => {
    selectFactory = () =>
      makeSelectChain([makeSlot({ googleEventId: 'old-google-event-id' })])
    const { updateInterviewSlot } = await import('@/actions/calendar')

    await updateInterviewSlot({ ...UPDATE_INPUT, syncToCalendar: false })

    // Existing calendar event should be deleted even if user did not request new sync
    expect(mockDeleteSlotFromCalendars).toHaveBeenCalledTimes(1)
  })
})

// ── cancelInterviewSlot ────────────────────────────────────────────────────────

describe('cancelInterviewSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = () => makeSelectChain([makeSlot()])
    mockDeleteSlotFromCalendars.mockResolvedValue(undefined)
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { cancelInterviewSlot } = await import('@/actions/calendar')

    const result = await cancelInterviewSlot(SLOT_ID, CANDIDATE_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns slot-not-found error when slot does not exist', async () => {
    selectFactory = () => makeSelectChain([])
    const { cancelInterviewSlot } = await import('@/actions/calendar')

    const result = await cancelInterviewSlot(SLOT_ID, CANDIDATE_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('sets status=cancelled and writes audit log on happy path', async () => {
    const { cancelInterviewSlot } = await import('@/actions/calendar')

    const result = await cancelInterviewSlot(SLOT_ID, CANDIDATE_ID)

    expect(result.success).toBe(true)
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    )
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'interview_slot.cancelled',
        entityType: 'interview_slot',
        entityId: SLOT_ID,
      })
    )
  })

  it('still cancels even when deleteSlotFromCalendars throws (non-fatal)', async () => {
    mockDeleteSlotFromCalendars.mockRejectedValue(new Error('API error'))
    const { cancelInterviewSlot } = await import('@/actions/calendar')

    const result = await cancelInterviewSlot(SLOT_ID, CANDIDATE_ID)

    // Calendar deletion failure is non-fatal
    expect(result.success).toBe(true)
  })
})

// ── disconnectCalendar ─────────────────────────────────────────────────────────

describe('disconnectCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
  })

  it('silently returns when no action context (no crash)', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { disconnectCalendar } = await import('@/actions/calendar')

    // Should not throw
    await expect(disconnectCalendar('google')).resolves.toBeUndefined()
    expect(mockDbDeleteWhere).not.toHaveBeenCalled()
  })

  it('deletes the calendar connection row for the specified provider', async () => {
    const { disconnectCalendar } = await import('@/actions/calendar')

    await disconnectCalendar('google')

    expect(mockDbDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('works for microsoft provider', async () => {
    const { disconnectCalendar } = await import('@/actions/calendar')

    await disconnectCalendar('microsoft')

    expect(mockDbDeleteWhere).toHaveBeenCalledTimes(1)
  })
})

// ── getCalendarConnections ─────────────────────────────────────────────────────

describe('getCalendarConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns {google: true, microsoft: false} when only google is connected', async () => {
    mockDbSelectChainRows.mockReturnValue([{ provider: 'google' }])
    const { getCalendarConnections } = await import('@/actions/calendar')

    const result = await getCalendarConnections(USER_ID)

    expect(result.google).toBe(true)
    expect(result.microsoft).toBe(false)
  })

  it('returns {google: false, microsoft: false} when no connections exist', async () => {
    mockDbSelectChainRows.mockReturnValue([])
    const { getCalendarConnections } = await import('@/actions/calendar')

    const result = await getCalendarConnections(USER_ID)

    expect(result.google).toBe(false)
    expect(result.microsoft).toBe(false)
  })

  it('returns {google: true, microsoft: true} when both are connected', async () => {
    mockDbSelectChainRows.mockReturnValue([
      { provider: 'google' },
      { provider: 'microsoft' },
    ])
    const { getCalendarConnections } = await import('@/actions/calendar')

    const result = await getCalendarConnections(USER_ID)

    expect(result.google).toBe(true)
    expect(result.microsoft).toBe(true)
  })
})

// ── importIcsSlots ─────────────────────────────────────────────────────────────

describe('importIcsSlots', () => {
  const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const PAST_DATE   = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  function makeParsedEvent(overrides: Partial<{
    summary: string
    start: Date
    durationMinutes: number
    location: string | null
    meetingUrl: string | null
    description: string | null
  }> = {}) {
    return {
      summary:         'Technical Screen',
      start:           FUTURE_DATE,
      durationMinutes: 60,
      location:        null,
      meetingUrl:      null,
      description:     null,
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    selectFactory = () => makeSelectChain([])
    mockParseIcsFile.mockReturnValue([makeParsedEvent()])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { importIcsSlots } = await import('@/actions/calendar')

    const result = await importIcsSlots(CANDIDATE_ID, null, 'BEGIN:VCALENDAR\nEND:VCALENDAR')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when file content is empty', async () => {
    const { importIcsSlots } = await import('@/actions/calendar')

    const result = await importIcsSlots(CANDIDATE_ID, null, '')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/empty/i)
  })

  it('returns error when file content exceeds 500 KB', async () => {
    const { importIcsSlots } = await import('@/actions/calendar')
    const oversized = 'X'.repeat(500 * 1024 + 1)

    const result = await importIcsSlots(CANDIDATE_ID, null, oversized)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/too large/i)
  })

  it('returns error when no valid events are found in file', async () => {
    mockParseIcsFile.mockReturnValue([])
    const { importIcsSlots } = await import('@/actions/calendar')

    const result = await importIcsSlots(CANDIDATE_ID, null, 'BEGIN:VCALENDAR\nEND:VCALENDAR')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/no valid events/i)
  })

  it('imports future events and returns correct counts', async () => {
    mockParseIcsFile.mockReturnValue([
      makeParsedEvent({ start: FUTURE_DATE }),
      makeParsedEvent({ summary: 'Second Interview', start: new Date(FUTURE_DATE.getTime() + 86400000) }),
    ])
    const { importIcsSlots } = await import('@/actions/calendar')

    const result = await importIcsSlots(CANDIDATE_ID, null, 'BEGIN:VCALENDAR\nEND:VCALENDAR')

    expect(result.success).toBe(true)
    const r = result as { success: true; imported: number; skipped: number }
    expect(r.imported).toBe(2)
    expect(r.skipped).toBe(0)
    expect(mockInsertValues).toHaveBeenCalledTimes(2)
  })

  it('skips past events and counts them as skipped', async () => {
    mockParseIcsFile.mockReturnValue([
      makeParsedEvent({ start: PAST_DATE }),     // past — should skip
      makeParsedEvent({ start: FUTURE_DATE }),   // future — should import
    ])
    const { importIcsSlots } = await import('@/actions/calendar')

    const result = await importIcsSlots(CANDIDATE_ID, null, 'BEGIN:VCALENDAR\nEND:VCALENDAR')

    expect(result.success).toBe(true)
    const r = result as { success: true; imported: number; skipped: number }
    expect(r.imported).toBe(1)
    expect(r.skipped).toBe(1)
  })

  it('associates the roleId with inserted slots when provided', async () => {
    const { importIcsSlots } = await import('@/actions/calendar')

    await importIcsSlots(CANDIDATE_ID, ROLE_ID, 'BEGIN:VCALENDAR\nEND:VCALENDAR')

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.roleId).toBe(ROLE_ID)
  })
})
