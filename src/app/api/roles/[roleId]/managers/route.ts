import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getRoleManagers, assignRoleManagers } from '@/actions/role-managers'

export const AssignManagersBodySchema = z.object({
  userIds: z.array(z.string().uuid()),
  primaryUserId: z.string().uuid().optional(),
})

registerRoute('GET', '/api/roles/{roleId}/managers', {
  scope: 'read',
  summary: 'Get managers assigned to a role',
  params: [{ name: 'roleId', in: 'path', required: true }],
  tags: ['roles'],
})

registerRoute('POST', '/api/roles/{roleId}/managers', {
  scope: 'write',
  summary: 'Assign managers to a role (replaces existing set)',
  params: [{ name: 'roleId', in: 'path', required: true }],
  requestSchema: AssignManagersBodySchema,
  tags: ['roles'],
})

export const GET = withApiAuth<{ roleId: string }>(
  'read',
  async (_req, ctx) => {
    const { roleId } = await ctx.params
    const data = await getRoleManagers(roleId)
    return Response.json({ ok: true, data })
  }
)

export const POST = withApiAuth<{ roleId: string }>(
  'write',
  async (req, ctx) => {
    const { roleId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = AssignManagersBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await assignRoleManagers(roleId, parsed.data.userIds, parsed.data.primaryUserId)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)
