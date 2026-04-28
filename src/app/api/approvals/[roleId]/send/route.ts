import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { sendShortlistForApproval } from '@/actions/approvals'

registerRoute('POST', '/api/approvals/{roleId}/send', {
  scope: 'write',
  summary: 'Send shortlist for hiring manager approval',
  params: [{ name: 'roleId', in: 'path', required: true, description: 'Role UUID' }],
  tags: ['approvals'],
})

export const POST = withApiAuth<{ roleId: string }>(
  'write',
  async (_req, ctx) => {
    const { roleId } = await ctx.params
    const result = await sendShortlistForApproval(roleId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
