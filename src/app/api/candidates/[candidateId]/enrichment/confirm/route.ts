import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { confirmProfile } from '@/actions/enrichment'

export const ConfirmProfileBodySchema = z.object({
  url: z.string().url(),
})

registerRoute('POST', '/api/candidates/{candidateId}/enrichment/confirm', {
  scope: 'write',
  summary: 'Confirm a verified profile for a candidate',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  requestSchema: ConfirmProfileBodySchema,
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = ConfirmProfileBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await confirmProfile(candidateId, parsed.data.url)
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
