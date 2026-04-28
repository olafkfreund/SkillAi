import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { approveAllRemaining } from '@/actions/approvals'

export const ApproveAllBodySchema = z.object({
  comment: z.string().max(1000).optional(),
})

registerRoute('POST', '/api/approvals/{roleId}/approve-all', {
  scope: 'write',
  summary: 'Approve all remaining pending candidates for a role',
  params: [{ name: 'roleId', in: 'path', required: true }],
  requestSchema: ApproveAllBodySchema,
  tags: ['approvals'],
})

export const POST = withApiAuth<{ roleId: string }>(
  'write',
  async (req, ctx) => {
    const { roleId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = ApproveAllBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await approveAllRemaining(roleId, parsed.data.comment)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
