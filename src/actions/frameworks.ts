'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { customerFrameworks, roles } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'
import type { FrameworkLevel } from '@/db/schema/customer-frameworks'

async function getTenantId(): Promise<string | null> {
  const headersList = await headers()
  return headersList.get('x-tenant-id')
}

async function getUserRole(): Promise<UserRole | undefined> {
  const headersList = await headers()
  return (headersList.get('x-user-role') as UserRole | null) ?? undefined
}

const FrameworkLevelSchema = z.object({
  id: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(500).default(''),
  order: z.number().int(),
})

const SaveFrameworkSchema = z.object({
  name: z.string().min(1, 'Framework name is required').max(200),
  description: z.string().max(2000).optional(),
  levels: z.array(FrameworkLevelSchema).min(1, 'At least one level is required'),
})

export type FrameworkState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function saveCustomerFramework(
  customerId: string,
  _prev: FrameworkState | null,
  formData: FormData
): Promise<FrameworkState> {
  const tenantId = await getTenantId()
  const userRole = await getUserRole()

  if (!tenantId) return { success: false, error: 'Not authenticated' }

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const levelsRaw = formData.get('levels')
  let parsedLevels: FrameworkLevel[]
  try {
    parsedLevels = JSON.parse(levelsRaw as string)
  } catch {
    return { success: false, error: 'Invalid levels data' }
  }

  const parsed = SaveFrameworkSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    levels: parsedLevels,
  })

  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(customerFrameworks)
      .values({
        tenantId,
        customerId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        levels: parsed.data.levels,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerFrameworks.customerId,
        set: {
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          levels: parsed.data.levels,
          updatedAt: new Date(),
        },
      })
  })

  revalidatePath(`/dashboard/customers/${customerId}`)
  return { success: true }
}

export async function deleteCustomerFramework(customerId: string): Promise<void> {
  const tenantId = await getTenantId()
  const userRole = await getUserRole()

  if (!tenantId) return

  try {
    requireRole(userRole, 'admin')
  } catch {
    throw new Error('Forbidden: admins only')
  }

  await withTenant(tenantId, async (tx) => {
    // Clear framework level from any roles using this customer's framework
    await tx
      .update(roles)
      .set({ frameworkLevelId: null, frameworkLevelLabel: null })
      .where(and(eq(roles.customerId, customerId), eq(roles.tenantId, tenantId)))

    await tx
      .delete(customerFrameworks)
      .where(and(eq(customerFrameworks.customerId, customerId), eq(customerFrameworks.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/customers/${customerId}`)
  redirect(`/dashboard/customers/${customerId}`)
}

export async function getCustomerFramework(
  customerId: string,
  tenantId: string
): Promise<typeof customerFrameworks.$inferSelect | null> {
  const [framework] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(customerFrameworks)
      .where(and(eq(customerFrameworks.customerId, customerId), eq(customerFrameworks.tenantId, tenantId)))
      .limit(1)
  )
  return framework ?? null
}
