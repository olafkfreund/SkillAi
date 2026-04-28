import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { dismissProfile } from '@/actions/enrichment'

export const DismissProfileBodySchema = z.object({
  url: z.string().url(),
})

registerRoute('POST', '/api/candidates/{candidateId}/enrichment/dismiss', {
  scope: 'write',
  summary: 'Dismiss a suggested profile for a candidate',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  requestSchema: DismissProfileBodySchema,
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = DismissProfileBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await dismissProfile(candidateId, parsed.data.url)
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
