import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { listTenantUsers } from '@/actions/users'

registerRoute('GET', '/api/users', {
  scope: 'read',
  summary: 'List all users in the tenant',
  tags: ['users'],
})

export const GET = withApiAuth(
  'read',
  async (_req, _ctx) => {
    const data = await listTenantUsers()
    return Response.json({ ok: true, data })
  }
)
