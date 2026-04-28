import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { removeApiKey } from '@/actions/settings'

registerRoute('DELETE', '/api/settings/api-keys/{provider}', {
  scope: 'admin',
  summary: 'Remove a configured API key',
  params: [{ name: 'provider', in: 'path', required: true, description: 'Key name, e.g. anthropic_api_key' }],
  tags: ['settings'],
})

export const DELETE = withApiAuth<{ provider: string }>(
  'admin',
  async (_req, ctx) => {
    const { provider } = await ctx.params

    const formData = new FormData()
    formData.set('key', provider)

    const result = await removeApiKey(null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
