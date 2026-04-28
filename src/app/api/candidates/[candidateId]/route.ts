import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateCandidateDetails } from '@/actions/candidates'

export const UpdateCandidateBodySchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().nullable().optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  languagesSpoken: z.string().optional(),
  willingToRelocate: z.enum(['true', 'false', '']).optional(),
  candidateRate: z.coerce.number().min(0).optional().or(z.literal('')),
  customerRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).optional(),
  availabilityStatus: z.enum(['available', 'on_project', 'unavailable']).optional(),
  availableFrom: z.string().optional(),
})

registerRoute('PATCH', '/api/candidates/{candidateId}', {
  scope: 'write',
  summary: 'Update candidate details',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  requestSchema: UpdateCandidateBodySchema,
  tags: ['candidates'],
})

export const PATCH = withApiAuth<{ candidateId: string }>(
  'write',
  async (req, ctx) => {
    const { candidateId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = UpdateCandidateBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    const formData = new FormData()
    const data = parsed.data
    formData.set('firstName', data.firstName)
    formData.set('lastName', data.lastName)
    if (data.email !== undefined) formData.set('email', data.email)
    if (data.phone !== undefined) formData.set('phone', data.phone)
    if (data.agencyId !== undefined) formData.set('agencyId', data.agencyId ?? '')
    if (data.country !== undefined) formData.set('country', data.country)
    if (data.city !== undefined) formData.set('city', data.city)
    if (data.languagesSpoken !== undefined) formData.set('languagesSpoken', data.languagesSpoken)
    if (data.willingToRelocate !== undefined) formData.set('willingToRelocate', data.willingToRelocate)
    if (data.candidateRate !== undefined) formData.set('candidateRate', String(data.candidateRate))
    if (data.customerRate !== undefined) formData.set('customerRate', String(data.customerRate))
    if (data.rateCurrency !== undefined) formData.set('rateCurrency', data.rateCurrency)
    if (data.availabilityStatus !== undefined) formData.set('availabilityStatus', data.availabilityStatus)
    if (data.availableFrom !== undefined) formData.set('availableFrom', data.availableFrom)

    const result = await updateCandidateDetails(candidateId, null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
