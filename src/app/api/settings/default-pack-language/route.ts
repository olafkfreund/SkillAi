import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getDefaultPackLanguage, saveDefaultPackLanguage } from '@/actions/settings'

export const DefaultPackLanguageBodySchema = z.object({
  language: z.string().min(2).max(10),
})

registerRoute('GET', '/api/settings/default-pack-language', {
  scope: 'read',
  summary: 'Get the default interview pack language',
  tags: ['settings'],
})

registerRoute('PUT', '/api/settings/default-pack-language', {
  scope: 'admin',
  summary: 'Set the default interview pack language',
  requestSchema: DefaultPackLanguageBodySchema,
  tags: ['settings'],
})

export const GET = withApiAuth(
  'read',
  async (_req, ctx) => {
    const data = await getDefaultPackLanguage(ctx.tenantId)
    return Response.json({ ok: true, data })
  }
)

export const PUT = withApiAuth(
  'admin',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = DefaultPackLanguageBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await saveDefaultPackLanguage(parsed.data.language)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
