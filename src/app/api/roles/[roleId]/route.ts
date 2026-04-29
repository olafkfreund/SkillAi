import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateRole } from '@/actions/roles'

export const UpdateRoleBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10),
  requirements: z.string().min(10),
  customerId: z.string().uuid().optional(),
  customerRoleId: z.string().max(100).trim().optional(),
  frameworkLevelId: z.string().max(50).optional(),
  frameworkLevelLabel: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  languageRequirements: z.string().optional(),
  targetFillDate: z.string().optional(),
  cutoffDate: z.string().optional(),
  customerPortalPath: z.string().max(500).optional(),
  customerDayRate: z.coerce.number().min(0).optional(),
  rateCurrency: z.string().max(3).optional(),
  priorityKeywords: z.array(z.string()).max(15).optional(),
})

registerRoute('PATCH', '/api/roles/{roleId}', {
  scope: 'write',
  summary: 'Update an existing role',
  params: [{ name: 'roleId', in: 'path', required: true }],
  requestSchema: UpdateRoleBodySchema,
  tags: ['roles'],
})

export const PATCH = withApiAuth<{ roleId: string }>(
  'write',
  async (req, ctx) => {
    const { roleId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = UpdateRoleBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    const formData = new FormData()
    const data = parsed.data
    formData.set('title', data.title)
    formData.set('description', data.description)
    formData.set('requirements', data.requirements)
    if (data.customerId) formData.set('customerId', data.customerId)
    if (data.customerRoleId !== undefined) formData.set('customerRoleId', data.customerRoleId)
    if (data.frameworkLevelId) formData.set('frameworkLevelId', data.frameworkLevelId)
    if (data.frameworkLevelLabel) formData.set('frameworkLevelLabel', data.frameworkLevelLabel)
    if (data.country) formData.set('country', data.country)
    if (data.city) formData.set('city', data.city)
    if (data.workMode) formData.set('workMode', data.workMode)
    if (data.languageRequirements) formData.set('languageRequirements', data.languageRequirements)
    if (data.targetFillDate) formData.set('targetFillDate', data.targetFillDate)
    if (data.cutoffDate) formData.set('cutoffDate', data.cutoffDate)
    if (data.customerPortalPath) formData.set('customerPortalPath', data.customerPortalPath)
    if (data.customerDayRate !== undefined) formData.set('customerDayRate', String(data.customerDayRate))
    if (data.rateCurrency) formData.set('rateCurrency', data.rateCurrency)
    if (data.priorityKeywords) formData.set('priorityKeywords', JSON.stringify(data.priorityKeywords))

    const result = await updateRole(roleId, null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
