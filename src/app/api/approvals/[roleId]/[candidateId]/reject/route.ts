import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { rejectCandidate } from '@/actions/approvals'

export const RejectBodySchema = z.object({
  comment: z.string().max(1000).optional(),
})

registerRoute('POST', '/api/approvals/{roleId}/{candidateId}/reject', {
  scope: 'write',
  summary: 'Reject a candidate for a role',
  params: [
    { name: 'roleId', in: 'path', required: true },
    { name: 'candidateId', in: 'path', required: true },
  ],
  requestSchema: RejectBodySchema,
  tags: ['approvals'],
})

export const POST = withApiAuth<{ roleId: string; candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { roleId, candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = RejectBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await rejectCandidate(roleId, candidateId, parsed.data.comment)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
