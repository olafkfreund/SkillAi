import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { removeCandidateFromRole } from '@/actions/scores'

export const RemoveScoreBodySchema = z.object({
  scoreId: z.string().uuid(),
  roleId: z.string().uuid(),
})

registerRoute('DELETE', '/api/scores', {
  scope: 'write',
  summary: 'Remove a candidate from a role (delete score)',
  requestSchema: RemoveScoreBodySchema,
  tags: ['scores'],
})

export const DELETE = withApiAuth(
  'write',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = RemoveScoreBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    await removeCandidateFromRole(parsed.data.scoreId, parsed.data.roleId)
    return Response.json({ ok: true })
  }
)
