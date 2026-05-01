'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import { notes } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'

const BodySchema = z.string().min(1, 'Note cannot be empty').max(5000, 'Note too long (max 5000 chars)')

export type NoteActionResult = { success: true } | { success: false; error: string }

// ---------------------------------------------------------------------------
// createNote — insert a new note for a candidate
// ---------------------------------------------------------------------------
export async function createNote(
  candidateId: string,
  body: string,
  isShareable: boolean = false
): Promise<NoteActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  if (userRole === 'viewer') {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const validated = BodySchema.safeParse(body)
  if (!validated.success) {
    return { success: false, error: validated.error.flatten().formErrors[0] ?? 'Invalid note body' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx.insert(notes).values({
      tenantId,
      candidateId,
      authorId: userId,
      body: validated.data,
      isShareable,
    })
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// updateNote — edit the body of an existing note
// ---------------------------------------------------------------------------
export async function updateNote(
  noteId: string,
  candidateId: string,
  body: string,
  isShareable: boolean = false
): Promise<NoteActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  if (userRole === 'viewer') {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const validated = BodySchema.safeParse(body)
  if (!validated.success) {
    return { success: false, error: validated.error.flatten().formErrors[0] ?? 'Invalid note body' }
  }

  // Verify note exists, belongs to this tenant, and the user is allowed to edit
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: notes.id, authorId: notes.authorId, tenantId: notes.tenantId })
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.tenantId, tenantId)))
      .limit(1)
  )

  if (!existing) {
    return { success: false, error: 'Note not found' }
  }

  // Only the author or an admin may edit
  const isAuthor = existing.authorId === userId
  const isAdmin = userRole === 'admin'
  if (!isAuthor && !isAdmin) {
    return { success: false, error: 'Forbidden: you can only edit your own notes' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(notes)
      .set({ body: validated.data, isShareable, updatedAt: new Date(), isEdited: true })
      .where(and(eq(notes.id, noteId), eq(notes.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// deleteNote — remove a note; author or admin only
// ---------------------------------------------------------------------------
export async function deleteNote(
  noteId: string,
  candidateId: string
): Promise<NoteActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  // Verify note belongs to this tenant
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: notes.id, authorId: notes.authorId })
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.tenantId, tenantId)))
      .limit(1)
  )

  if (!existing) {
    return { success: false, error: 'Note not found' }
  }

  // Only the author or an admin may delete
  const isAuthor = existing.authorId === userId
  const isAdmin = userRole === 'admin'
  if (!isAuthor && !isAdmin) {
    return { success: false, error: 'Forbidden: you can only delete your own notes' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(notes)
      .where(and(eq(notes.id, noteId), eq(notes.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}
