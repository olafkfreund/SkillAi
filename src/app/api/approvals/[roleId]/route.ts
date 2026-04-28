import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getApprovalsForRole } from '@/actions/approvals'

registerRoute('GET', '/api/approvals/{roleId}', {
  scope: 'read',
  summary: 'Get approvals for a role',
  params: [{ name: 'roleId', in: 'path', required: true, description: 'Role UUID' }],
  tags: ['approvals'],
})

export const GET = withApiAuth<{ roleId: string }>(
  'read',
  async (_req, ctx) => {
    const { roleId } = await ctx.params
    const data = await getApprovalsForRole(roleId)
    return Response.json({ ok: true, data })
  }
)
