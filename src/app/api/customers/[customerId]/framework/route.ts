import { z } from 'zod'
import { withApiAuth } from '@/lib/api/auth-middleware'
import { registerRoute } from '@/lib/api/openapi'
import { getCustomerFramework, saveCustomerFramework, deleteCustomerFramework } from '@/actions/frameworks'

const FrameworkLevelSchema = z.object({
  id: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(500).default(''),
  order: z.number().int(),
})

export const SaveFrameworkBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  levels: z.array(FrameworkLevelSchema).min(1),
})

registerRoute('GET', '/api/customers/{customerId}/framework', {
  scope: 'read',
  summary: 'Get the hiring framework for a customer',
  params: [{ name: 'customerId', in: 'path', required: true }],
  tags: ['customers'],
})

registerRoute('PUT', '/api/customers/{customerId}/framework', {
  scope: 'write',
  summary: 'Save or update the hiring framework for a customer',
  params: [{ name: 'customerId', in: 'path', required: true }],
  requestSchema: SaveFrameworkBodySchema,
  tags: ['customers'],
})

registerRoute('DELETE', '/api/customers/{customerId}/framework', {
  scope: 'write',
  summary: 'Delete the hiring framework for a customer',
  params: [{ name: 'customerId', in: 'path', required: true }],
  tags: ['customers'],
})

export const GET = withApiAuth<{ customerId: string }>(
  'read',
  async (_req, ctx) => {
    const { customerId } = await ctx.params
    const data = await getCustomerFramework(customerId, ctx.tenantId)
    return Response.json({ ok: true, data })
  }
)

export const PUT = withApiAuth<{ customerId: string }>(
  'write',
  async (req, ctx) => {
    const { customerId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = SaveFrameworkBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 })
    }

    const formData = new FormData()
    formData.set('name', parsed.data.name)
    if (parsed.data.description) formData.set('description', parsed.data.description)
    formData.set('levels', JSON.stringify(parsed.data.levels))

    const result = await saveCustomerFramework(customerId, null, formData)
    if (!result.success) {
      return Response.json({ ok: false, error: result.error }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
)

export const DELETE = withApiAuth<{ customerId: string }>(
  'write',
  async (_req, ctx) => {
    const { customerId } = await ctx.params
    // deleteCustomerFramework calls redirect() internally on success — we catch that
    try {
      await deleteCustomerFramework(customerId)
    } catch (err) {
      // Next.js redirect() throws an error with a NEXT_REDIRECT digest
      const e = err as { digest?: string }
      if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_REDIRECT')) {
        return Response.json({ ok: true })
      }
      throw err
    }
    return Response.json({ ok: true })
  }
)
