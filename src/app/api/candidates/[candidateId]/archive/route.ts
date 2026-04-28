import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { archiveCandidate } from '@/actions/candidates'

registerRoute('POST', '/api/candidates/{candidateId}/archive', {
  scope: 'write',
  summary: 'Archive (soft-delete) a candidate',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (_req, ctx) => {
    const { candidateId } = await ctx.params
    await archiveCandidate(candidateId)
    return Response.json({ ok: true })
  }
)
