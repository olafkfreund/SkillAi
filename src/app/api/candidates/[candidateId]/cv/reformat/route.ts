import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { reformatCv } from '@/actions/cv-reformat'

registerRoute('POST', '/api/candidates/{candidateId}/cv/reformat', {
  scope: 'write',
  summary: 'Reformat a candidate CV with AI (Claude Haiku)',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (_req, ctx) => {
    const { candidateId } = await ctx.params
    const result = await reformatCv(candidateId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
