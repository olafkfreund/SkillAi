import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateNote, deleteNote } from '@/actions/notes'

export const UpdateNoteBodySchema = z.object({
  candidateId: z.string().uuid(),
  body: z.string().min(1).max(5000),
})

registerRoute('PATCH', '/api/notes/{noteId}', {
  scope: 'write',
  summary: 'Update a note',
  params: [{ name: 'noteId', in: 'path', required: true }],
  requestSchema: UpdateNoteBodySchema,
  tags: ['notes'],
})

registerRoute('DELETE', '/api/notes/{noteId}', {
  scope: 'write',
  summary: 'Delete a note',
  params: [{ name: 'noteId', in: 'path', required: true }],
  tags: ['notes'],
})

export const PATCH = withApiAuth<{ noteId: string }>(
  'write',
  async (req, ctx) => {
    const { noteId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = UpdateNoteBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await updateNote(noteId, parsed.data.candidateId, parsed.data.body)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)

export const DELETE = withApiAuth<{ noteId: string }>(
  'write',
  async (req, ctx) => {
    const { noteId } = await ctx.params
    // candidateId required for revalidatePath in the server action
    const body = await req.json().catch(() => ({}))
    const candidateId = typeof body?.candidateId === 'string' ? body.candidateId : ''
    const result = await deleteNote(noteId, candidateId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
