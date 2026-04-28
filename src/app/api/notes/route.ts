import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { createNote } from '@/actions/notes'

export const CreateNoteBodySchema = z.object({
  candidateId: z.string().uuid(),
  body: z.string().min(1).max(5000),
})

registerRoute('POST', '/api/notes', {
  scope: 'write',
  summary: 'Create a note for a candidate',
  requestSchema: CreateNoteBodySchema,
  tags: ['notes'],
})

export const POST = withApiAuth(
  'write',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = CreateNoteBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await createNote(parsed.data.candidateId, parsed.data.body)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
