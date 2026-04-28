import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { removeRoleManager } from '@/actions/role-managers'

registerRoute('DELETE', '/api/roles/{roleId}/managers/{userId}', {
  scope: 'write',
  summary: 'Remove a manager from a role',
  params: [
    { name: 'roleId', in: 'path', required: true },
    { name: 'userId', in: 'path', required: true },
  ],
  tags: ['roles'],
})

export const DELETE = withApiAuth<{ roleId: string; userId: string }>(
  'write',
  async (_req, ctx) => {
    const { roleId, userId } = await ctx.params
    const result = await removeRoleManager(roleId, userId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
