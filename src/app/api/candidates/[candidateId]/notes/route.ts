import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { db, withTenant } from '@/db'
import { notes } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

registerRoute('GET', '/api/candidates/{candidateId}/notes', {
  scope: 'read',
  summary: 'Get notes for a candidate',
  params: [{ name: 'candidateId', in: 'path', required: true }],
  tags: ['candidates', 'notes'],
})

export const GET = withApiAuth<{ candidateId: string }>(
  'read',
  async (_req, ctx) => {
    const { candidateId } = await ctx.params
    const { tenantId } = ctx

    const data = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(notes)
        .where(and(eq(notes.candidateId, candidateId), eq(notes.tenantId, tenantId)))
        .orderBy(desc(notes.createdAt))
    )

    return Response.json({ ok: true, data })
  }
)
