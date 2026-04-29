import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, users } from '@/db/schema'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { createRole } from '@/actions/roles'

// ---------------------------------------------------------------------------
// Session-based GET (existing — used by the Next.js UI)
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const result = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: roles.id,
        title: roles.title,
        description: roles.description,
        requirements: roles.requirements,
        customerRoleId: roles.customerRoleId,
        isActive: roles.isActive,
        createdAt: roles.createdAt,
        createdByName: users.name,
      })
      .from(roles)
      .leftJoin(users, eq(roles.createdBy, users.id))
      .where(eq(roles.isActive, true))
      .orderBy(desc(roles.createdAt))
  })

  return NextResponse.json(result)
}

// ---------------------------------------------------------------------------
// API-token-authed POST — create a role
// ---------------------------------------------------------------------------

export const CreateRoleBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10),
  requirements: z.string().min(10),
  customerId: z.string().uuid().optional(),
  customerRoleId: z.string().max(100).trim().optional(),
  frameworkLevelId: z.string().max(50).optional(),
  frameworkLevelLabel: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  languageRequirements: z.string().optional(),
  targetFillDate: z.string().optional(),
  cutoffDate: z.string().optional(),
  customerPortalPath: z.string().max(500).optional(),
  customerDayRate: z.coerce.number().min(0).optional(),
  rateCurrency: z.string().max(3).optional(),
  priorityKeywords: z.array(z.string()).max(15).optional(),
})

registerRoute('POST', '/api/roles', {
  scope: 'write',
  summary: 'Create a new role',
  requestSchema: CreateRoleBodySchema,
  tags: ['roles'],
})

export const POST = withApiAuth(
  'write',
  async (req, _ctx) => {
    const body = await req.json().catch(() => ({}))
    const parsed = CreateRoleBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    const formData = new FormData()
    const data = parsed.data
    formData.set('title', data.title)
    formData.set('description', data.description)
    formData.set('requirements', data.requirements)
    if (data.customerId) formData.set('customerId', data.customerId)
    if (data.customerRoleId !== undefined) formData.set('customerRoleId', data.customerRoleId)
    if (data.frameworkLevelId) formData.set('frameworkLevelId', data.frameworkLevelId)
    if (data.frameworkLevelLabel) formData.set('frameworkLevelLabel', data.frameworkLevelLabel)
    if (data.country) formData.set('country', data.country)
    if (data.city) formData.set('city', data.city)
    if (data.workMode) formData.set('workMode', data.workMode)
    if (data.languageRequirements) formData.set('languageRequirements', data.languageRequirements)
    if (data.targetFillDate) formData.set('targetFillDate', data.targetFillDate)
    if (data.cutoffDate) formData.set('cutoffDate', data.cutoffDate)
    if (data.customerPortalPath) formData.set('customerPortalPath', data.customerPortalPath)
    if (data.customerDayRate !== undefined) formData.set('customerDayRate', String(data.customerDayRate))
    if (data.rateCurrency) formData.set('rateCurrency', data.rateCurrency)
    if (data.priorityKeywords) formData.set('priorityKeywords', JSON.stringify(data.priorityKeywords))

    const result = await createRole(null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true, data: { roleId: result.roleId } }, { status: 201 })
  }
)
