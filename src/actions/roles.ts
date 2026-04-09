'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'

const CreateRoleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
})

export type CreateRoleState =
  | { success: true; roleId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createRole(
  _prev: CreateRoleState | null,
  formData: FormData
): Promise<CreateRoleState> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId || !userId) return { success: false, error: 'Unauthorized' }

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const parsed = CreateRoleSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    requirements: formData.get('requirements'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const [role] = await withTenant(tenantId, async (tx) => {
    return tx
      .insert(roles)
      .values({
        tenantId,
        title: parsed.data.title,
        description: parsed.data.description,
        requirements: parsed.data.requirements,
        createdBy: userId,
        isActive: true,
      })
      .returning({ id: roles.id })
  })

  revalidatePath('/dashboard/roles')
  return { success: true, roleId: role.id }
}
