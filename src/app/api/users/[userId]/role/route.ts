import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { updateUserRole } from '@/actions/users'

export const UpdateUserRoleBodySchema = z.object({
  role: z.enum(['admin', 'recruiter', 'hiring_manager', 'viewer']),
})

registerRoute('PATCH', '/api/users/{userId}/role', {
  scope: 'admin',
  summary: 'Update a user role',
  params: [{ name: 'userId', in: 'path', required: true }],
  requestSchema: UpdateUserRoleBodySchema,
  tags: ['users'],
})

export const PATCH = withApiAuth<{ userId: string }>(
  'admin',
  async (req, ctx) => {
    const { userId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = UpdateUserRoleBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const result = await updateUserRole(userId, parsed.data.role)
    if (!result.ok) {
      // 403 for auth/role/last-admin/self-demote failures; 404 for unknown user.
      const status = result.error === 'User not found' ? 404 : 403
      return Response.json({ ok: false, error: result.error }, { status })
    }
    return Response.json({ ok: true })
  }
)
