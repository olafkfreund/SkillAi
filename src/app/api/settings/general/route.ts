import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getGeneralSettings, saveGeneralSetting } from '@/actions/settings'

export const SaveGeneralSettingBodySchema = z.object({
  key: z.enum(['default_ai_model', 'max_upload_mb']),
  value: z.string().min(1).max(50),
})

registerRoute('GET', '/api/settings/general', {
  scope: 'read',
  summary: 'Get general (non-secret) tenant settings',
  tags: ['settings'],
})

registerRoute('PATCH', '/api/settings/general', {
  scope: 'admin',
  summary: 'Save a general tenant setting',
  requestSchema: SaveGeneralSettingBodySchema,
  tags: ['settings'],
})

export const GET = withApiAuth(
  'read',
  async (_req, ctx) => {
    const data = await getGeneralSettings(ctx.tenantId)
    return Response.json({ ok: true, data })
  }
)

export const PATCH = withApiAuth(
  'admin',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = SaveGeneralSettingBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    const formData = new FormData()
    formData.set('value', parsed.data.value)

    const result = await saveGeneralSetting(parsed.data.key, null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
