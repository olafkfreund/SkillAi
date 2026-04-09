'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db, withTenant } from '@/db'
import { interviewSlots, calendarConnections } from '@/db/schema'
import { syncSlotToCalendars, deleteSlotFromCalendars } from '@/lib/calendar/sync'
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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')

  if (!tenantId || !userId) return { success: false, error: 'Unauthorized' }

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

  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return { success: true, slotId }
}

export async function cancelInterviewSlot(
  slotId: string,
  candidateId: string
): Promise<{ success: boolean; error?: string }> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')

  if (!tenantId || !userId) return { success: false, error: 'Unauthorized' }

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
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  if (!userId) return

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
