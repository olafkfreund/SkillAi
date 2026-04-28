import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { enrichCandidate } from '@/actions/enrichment'

registerRoute('POST', '/api/candidates/{candidateId}/enrichment/trigger', {
  scope: 'write',
  summary: 'Trigger web enrichment for a candidate',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (_req, ctx) => {
    const { candidateId } = await ctx.params
    const result = await enrichCandidate(candidateId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true, data: result })
  }
)
