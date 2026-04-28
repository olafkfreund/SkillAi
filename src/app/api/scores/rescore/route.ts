import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { rescoreCandidate } from '@/actions/scores'

export const RescoreBodySchema = z.object({
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
})

registerRoute('POST', '/api/scores/rescore', {
  scope: 'write',
  summary: 'Re-score a candidate against a role',
  requestSchema: RescoreBodySchema,
  tags: ['scores'],
})

export const POST = withApiAuth(
  'write',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = RescoreBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await rescoreCandidate(parsed.data.candidateId, parsed.data.roleId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
