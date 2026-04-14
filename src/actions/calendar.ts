'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db, withTenant } from '@/db'
import { interviewSlots, calendarConnections } from '@/db/schema'
import { syncSlotToCalendars, deleteSlotFromCalendars } from '@/lib/calendar/sync'
import { getActionContext } from '@/lib/auth/action-context'
import { writeAuditLog } from '@/lib/audit'
import { parseIcsFile } from '@/lib/ics-parser'
import type { InterviewSlot } from '@/db/schema/interview-slots'

const CreateSlotSchema = z.object({
  candidateId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  // ISO date-time string from the form
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  location: z.string().max(500).optional(),
  meetingUrl: z.string().url().optional().or(z.literal('')),
  slotNotes: z.string().max(2000).optional(),
  syncToCalendar: z.boolean().default(false),
})

export type CreateSlotState =
  | { success: true; slotId: string }
  | { success: false; error: string }

export async function createInterviewSlot(
  data: z.infer<typeof CreateSlotSchema>
): Promise<CreateSlotState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId } = ctx

  const parsed = CreateSlotSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { candidateId, roleId, title, scheduledAt, durationMinutes, location, meetingUrl, slotNotes, syncToCalendar } =
    parsed.data

  const scheduledDate = new Date(scheduledAt)

  let slotId: string

  try {
    const [inserted] = await withTenant(tenantId, async (tx) =>
      tx
        .insert(interviewSlots)
        .values({
          tenantId,
          candidateId,
          roleId: roleId ?? null,
          title,
          scheduledAt: scheduledDate,
          durationMinutes,
          location: location || null,
          meetingUrl: meetingUrl || null,
          slotNotes: slotNotes || null,
          status: 'scheduled',
          createdBy: userId,
        })
        .returning({ id: interviewSlots.id })
    )

    slotId = inserted.id
  } catch {
    return { success: false, error: 'Failed to create interview slot' }
  }

  // Sync to connected calendars if requested
  if (syncToCalendar) {
    try {
      const calendarEvent = {
        title,
        startAt: scheduledDate,
        durationMinutes,
        location: location || undefined,
        meetingUrl: meetingUrl || undefined,
      }

      const { googleEventId, microsoftEventId } = await syncSlotToCalendars(userId, calendarEvent)

      if (googleEventId || microsoftEventId) {
        await withTenant(tenantId, async (tx) =>
          tx
            .update(interviewSlots)
            .set({
              googleEventId: googleEventId ?? null,
              microsoftEventId: microsoftEventId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(interviewSlots.id, slotId))
        )
      }
    } catch {
      // Calendar sync failure is non-fatal — slot was created successfully
    }
  }

  await writeAuditLog(tenantId, {
    action: 'interview_slot.created',
    entityType: 'interview_slot',
    entityId: slotId,
    entityLabel: title,
    metadata: { candidateId, scheduledAt: scheduledDate.toISOString() },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return { success: true, slotId }
}

/**
 * Update an existing interview slot. Re-syncs to connected calendars by
 * deleting the old event and creating a new one with the updated details.
 * Cancelled slots cannot be edited.
 */
const UpdateSlotSchema = CreateSlotSchema.extend({
  slotId: z.string().uuid(),
})

export async function updateInterviewSlot(
  data: z.infer<typeof UpdateSlotSchema>
): Promise<CreateSlotState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId } = ctx

  const parsed = UpdateSlotSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const {
    slotId,
    candidateId,
    roleId,
    title,
    scheduledAt,
    durationMinutes,
    location,
    meetingUrl,
    slotNotes,
    syncToCalendar,
  } = parsed.data

  // Load existing slot — verify ownership + get calendar event IDs
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(interviewSlots)
      .where(and(eq(interviewSlots.id, slotId), eq(interviewSlots.tenantId, tenantId)))
      .limit(1)
  )

  if (!existing) return { success: false, error: 'Slot not found' }
  if (existing.status === 'cancelled') {
    return { success: false, error: 'Cannot edit a cancelled interview' }
  }

  const scheduledDate = new Date(scheduledAt)

  // Decide whether to resync calendar events:
  // - If user requests sync, delete the old event(s) (if any) and create new
  // - If user does NOT request sync but old events exist, drop them (they're now stale)
  let newGoogleEventId: string | null = existing.googleEventId
  let newMicrosoftEventId: string | null = existing.microsoftEventId

  const hadCalendarEvents = !!(existing.googleEventId || existing.microsoftEventId)
  if (syncToCalendar || hadCalendarEvents) {
    // Drop the old events first (non-fatal)
    try {
      await deleteSlotFromCalendars(userId, existing.googleEventId, existing.microsoftEventId)
    } catch {
      // ignore — we'll overwrite the IDs below
    }
    newGoogleEventId = null
    newMicrosoftEventId = null

    // Create fresh events if the user wants ongoing sync
    if (syncToCalendar) {
      try {
        const calendarEvent = {
          title,
          startAt: scheduledDate,
          durationMinutes,
          location: location || undefined,
          meetingUrl: meetingUrl || undefined,
        }
        const result = await syncSlotToCalendars(userId, calendarEvent)
        newGoogleEventId = result.googleEventId ?? null
        newMicrosoftEventId = result.microsoftEventId ?? null
      } catch {
        // Calendar sync failure is non-fatal
      }
    }
  }

  try {
    await withTenant(tenantId, async (tx) =>
      tx
        .update(interviewSlots)
        .set({
          roleId: roleId ?? null,
          title,
          scheduledAt: scheduledDate,
          durationMinutes,
          location: location || null,
          meetingUrl: meetingUrl || null,
          slotNotes: slotNotes || null,
          googleEventId: newGoogleEventId,
          microsoftEventId: newMicrosoftEventId,
          updatedAt: new Date(),
        })
        .where(eq(interviewSlots.id, slotId))
    )
  } catch {
    return { success: false, error: 'Failed to update interview slot' }
  }

  await writeAuditLog(tenantId, {
    action: 'interview_slot.updated',
    entityType: 'interview_slot',
    entityId: slotId,
    entityLabel: title,
    metadata: { candidateId, scheduledAt: scheduledDate.toISOString() },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return { success: true, slotId }
}

export async function cancelInterviewSlot(
  slotId: string,
  candidateId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId } = ctx

  // Fetch slot to verify ownership and get calendar event IDs
  const [slot] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(interviewSlots)
      .where(and(eq(interviewSlots.id, slotId), eq(interviewSlots.tenantId, tenantId)))
      .limit(1)
  )

  if (!slot) return { success: false, error: 'Slot not found' }

  // Remove calendar events
  try {
    await deleteSlotFromCalendars(userId, slot.googleEventId, slot.microsoftEventId)
  } catch {
    // Non-fatal — continue with DB update
  }

  await withTenant(tenantId, async (tx) =>
    tx
      .update(interviewSlots)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(interviewSlots.id, slotId))
  )

  await writeAuditLog(tenantId, {
    action: 'interview_slot.cancelled',
    entityType: 'interview_slot',
    entityId: slotId,
    entityLabel: slot.title,
    metadata: { candidateId },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return { success: true }
}

// Server function (not action) — fetch slots for a candidate profile page.
export async function getSlots(tenantId: string, candidateId: string): Promise<InterviewSlot[]> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(interviewSlots)
      .where(eq(interviewSlots.candidateId, candidateId))
      .orderBy(desc(interviewSlots.scheduledAt))
  )
}

// Disconnect a calendar provider for the current user.
export async function disconnectCalendar(
  provider: 'google' | 'microsoft'
): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) return
  const { userId } = ctx

  await db
    .delete(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.provider, provider)
      )
    )

  revalidatePath('/dashboard/settings')
}

// Check which calendar providers are connected for the current user.
export async function getCalendarConnections(
  userId: string
): Promise<{ google: boolean; microsoft: boolean }> {
  const connections = await db
    .select({ provider: calendarConnections.provider })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))

  const providers = new Set(connections.map((c) => c.provider))
  return {
    google: providers.has('google'),
    microsoft: providers.has('microsoft'),
  }
}

// ---------------------------------------------------------------------------
// ICS file import
// ---------------------------------------------------------------------------

export type IcsImportResult =
  | { success: true; imported: number; skipped: number }
  | { success: false; error: string }

/** Maximum ICS file size accepted (500 KB as character count). */
const MAX_ICS_CHARS = 500 * 1024

/** Maximum number of events processed from a single file. */
const MAX_EVENTS = 50

/**
 * Parse an ICS file's text content and insert valid future events as
 * interview slots for the given candidate.
 *
 * @param candidateId - UUID of the target candidate
 * @param roleId      - UUID of an associated role, or null
 * @param fileContent - Raw text of the uploaded .ics file
 */
export async function importIcsSlots(
  candidateId: string,
  roleId: string | null,
  fileContent: string
): Promise<IcsImportResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId } = ctx

  if (!fileContent || fileContent.length === 0) {
    return { success: false, error: 'File is empty' }
  }
  if (fileContent.length > MAX_ICS_CHARS) {
    return { success: false, error: 'File is too large (max 500 KB)' }
  }

  const events = parseIcsFile(fileContent)

  if (events.length === 0) {
    return { success: false, error: 'No valid events found in file' }
  }

  const now = new Date()
  let imported = 0
  let skipped = 0

  for (const event of events.slice(0, MAX_EVENTS)) {
    // Skip events that are already in the past
    if (event.start <= now) {
      skipped++
      continue
    }

    try {
      await withTenant(tenantId, async (tx) =>
        tx.insert(interviewSlots).values({
          tenantId,
          candidateId,
          roleId: roleId ?? null,
          title: event.summary,
          scheduledAt: event.start,
          durationMinutes: event.durationMinutes,
          location: event.location ?? null,
          meetingUrl: event.meetingUrl ?? null,
          slotNotes: event.description ? 'Imported from calendar file' : null,
          status: 'scheduled',
          createdBy: userId,
        })
      )
      imported++
    } catch {
      skipped++
    }
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return { success: true, imported, skipped }
}
