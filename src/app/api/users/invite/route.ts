import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { createInvitation } from '@/actions/invitations'

export const InviteUserBodySchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  role: z.enum(['admin', 'recruiter', 'viewer']).default('recruiter'),
})

registerRoute('POST', '/api/users/invite', {
  scope: 'admin',
  summary: 'Create a user invitation link',
  requestSchema: InviteUserBodySchema,
  tags: ['users'],
})

export const POST = withApiAuth(
  'admin',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = InviteUserBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    // Build FormData to match server action interface
    const formData = new FormData()
    if (parsed.data.email) formData.set('email', parsed.data.email)
    formData.set('role', parsed.data.role)

    const result = await createInvitation(null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true, data: { inviteUrl: result.inviteUrl } })
  }
)
