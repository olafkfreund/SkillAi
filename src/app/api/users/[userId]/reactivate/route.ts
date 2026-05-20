import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { reactivateUser } from '@/actions/users'

registerRoute('POST', '/api/users/{userId}/reactivate', {
  scope: 'admin',
  summary: 'Reactivate a previously deactivated user account',
  params: [{ name: 'userId', in: 'path', required: true }],
  tags: ['users'],
})

export const POST = withApiAuth<{ userId: string }>(
  'admin',
  async (_req, ctx) => {
    const { userId } = await ctx.params
    await reactivateUser(userId)
    return Response.json({ ok: true })
  }
)
