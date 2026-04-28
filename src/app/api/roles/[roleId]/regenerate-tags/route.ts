import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { regenerateRoleTags } from '@/actions/roles'

registerRoute('POST', '/api/roles/{roleId}/regenerate-tags', {
  scope: 'write',
  summary: 'Regenerate AI tags for a role',
  params: [{ name: 'roleId', in: 'path', required: true }],
  tags: ['roles'],
})

export const POST = withApiAuth<{ roleId: string }>(
  'write',
  async (_req, ctx) => {
    const { roleId } = await ctx.params
    const result = await regenerateRoleTags(roleId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
