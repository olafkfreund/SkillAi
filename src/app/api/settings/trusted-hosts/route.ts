import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getTrustedHosts, saveTrustedHosts } from '@/actions/settings'

export const TrustedHostsBodySchema = z.object({
  hostnames: z.array(z.string()),
})

registerRoute('GET', '/api/settings/trusted-hosts', {
  scope: 'read',
  summary: 'Get trusted hostnames list',
  tags: ['settings'],
})

registerRoute('PUT', '/api/settings/trusted-hosts', {
  scope: 'admin',
  summary: 'Replace the trusted hostnames list',
  requestSchema: TrustedHostsBodySchema,
  tags: ['settings'],
})

export const GET = withApiAuth(
  'read',
  async (_req, ctx) => {
    const data = await getTrustedHosts(ctx.tenantId)
    return Response.json({ ok: true, data })
  }
)

export const PUT = withApiAuth(
  'admin',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = TrustedHostsBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await saveTrustedHosts(parsed.data.hostnames)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
