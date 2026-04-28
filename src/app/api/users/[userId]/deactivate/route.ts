import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { deactivateUser } from '@/actions/users'

registerRoute('POST', '/api/users/{userId}/deactivate', {
  scope: 'admin',
  summary: 'Deactivate a user account',
  params: [{ name: 'userId', in: 'path', required: true }],
  tags: ['users'],
})

export const POST = withApiAuth<{ userId: string }>(
  'admin',
  async (_req, ctx) => {
    const { userId } = await ctx.params
    await deactivateUser(userId)
    return Response.json({ ok: true })
  }
)
