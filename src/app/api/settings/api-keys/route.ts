import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getConfiguredKeys, saveApiKey } from '@/actions/settings'

export const SaveApiKeyBodySchema = z.object({
  key: z.enum([
    'anthropic_api_key',
    'google_ai_api_key',
    'openai_api_key',
    'brave_search_api_key',
    'github_token',
  ]),
  value: z.string().min(1).max(500),
})

registerRoute('GET', '/api/settings/api-keys', {
  scope: 'admin',
  summary: 'List which API keys have been configured (names only, no values)',
  tags: ['settings'],
})

registerRoute('POST', '/api/settings/api-keys', {
  scope: 'admin',
  summary: 'Save or update an API key',
  requestSchema: SaveApiKeyBodySchema,
  tags: ['settings'],
})

export const GET = withApiAuth(
  'admin',
  async (_req, ctx) => {
    const data = await getConfiguredKeys(ctx.tenantId)
    return Response.json({ ok: true, data })
  }
)

export const POST = withApiAuth(
  'admin',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = SaveApiKeyBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    const formData = new FormData()
    formData.set('key', parsed.data.key)
    formData.set('value', parsed.data.value)

    const result = await saveApiKey(null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
