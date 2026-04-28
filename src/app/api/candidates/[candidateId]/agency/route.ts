import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateCandidateAgency } from '@/actions/candidates'

export const AgencyBodySchema = z.object({
  agencyId: z.string().uuid().nullable(),
})

registerRoute('POST', '/api/candidates/{candidateId}/agency', {
  scope: 'write',
  summary: 'Assign or remove a candidate agency',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  requestSchema: AgencyBodySchema,
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = AgencyBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await updateCandidateAgency(candidateId, parsed.data.agencyId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
