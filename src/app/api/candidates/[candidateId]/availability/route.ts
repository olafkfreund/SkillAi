import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateCandidateAvailability } from '@/actions/candidates'

export const AvailabilityBodySchema = z.object({
  availabilityStatus: z.enum(['available', 'on_project', 'unavailable']),
  availableFrom: z.string().nullable().optional(),
})

registerRoute('POST', '/api/candidates/{candidateId}/availability', {
  scope: 'write',
  summary: 'Update candidate availability status',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  requestSchema: AvailabilityBodySchema,
  tags: ['candidates'],
})

export const POST = withApiAuth<{ candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = AvailabilityBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await updateCandidateAvailability(candidateId, {
      availabilityStatus: parsed.data.availabilityStatus,
      availableFrom: parsed.data.availableFrom ?? null,
    })
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
