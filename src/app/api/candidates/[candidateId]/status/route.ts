import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateCandidateStatus } from '@/actions/candidates'

export const CandidateStatusBodySchema = z.object({
  status: z.enum(['new', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'rejected_by_customer']),
})

registerRoute('POST', '/api/candidates/{candidateId}/status', {
  scope: 'write',
  summary: 'Update candidate pipeline status',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  requestSchema: CandidateStatusBodySchema,
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = CandidateStatusBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    await updateCandidateStatus(candidateId, parsed.data.status)
    return Response.json({ ok: true })
  }
)
