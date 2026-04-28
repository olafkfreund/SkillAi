import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { archiveRole } from '@/actions/roles'

registerRoute('POST', '/api/roles/{roleId}/archive', {
  scope: 'write',
  summary: 'Archive (soft-delete) a role',
  params: [{ name: 'roleId', in: 'path', required: true }],
  tags: ['roles'],
})

export const POST = withApiAuth<{ roleId: string }>(
  'write',
  async (_req, ctx) => {
    const { roleId } = await ctx.params
    await archiveRole(roleId)
    return Response.json({ ok: true })
  }
)
