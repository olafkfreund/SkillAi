'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { extractRoleTags } from '@/lib/ai/role-tags'
import type { UserRole } from '@/lib/auth/types'

const CreateRoleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  customerId: z.string().uuid().optional().or(z.literal('')),
  frameworkLevelId: z.string().max(50).optional().or(z.literal('')),
  frameworkLevelLabel: z.string().max(200).optional().or(z.literal('')),
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
    customerId: formData.get('customerId') || undefined,
    frameworkLevelId: formData.get('frameworkLevelId') || undefined,
    frameworkLevelLabel: formData.get('frameworkLevelLabel') || undefined,
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
        customerId: parsed.data.customerId || null,
        frameworkLevelId: parsed.data.frameworkLevelId || null,
        frameworkLevelLabel: parsed.data.frameworkLevelLabel || null,
        isActive: true,
      })
      .returning({ id: roles.id })
  })

  after(async () => {
    await _saveRoleTags(role.id, tenantId, parsed.data.title, parsed.data.description, parsed.data.requirements)
  })

  revalidatePath('/dashboard/roles')
  return { success: true, roleId: role.id }
}

// ---------------------------------------------------------------------------
// updateRole — edit an existing role's details
// ---------------------------------------------------------------------------

const UpdateRoleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  customerId: z.string().uuid().optional().or(z.literal('')),
  frameworkLevelId: z.string().max(50).optional().or(z.literal('')),
  frameworkLevelLabel: z.string().max(200).optional().or(z.literal('')),
})

export type UpdateRoleState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function updateRole(
  roleId: string,
  _prev: UpdateRoleState | null,
  formData: FormData
): Promise<UpdateRoleState> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return { success: false, error: 'Unauthorized' }

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const parsed = UpdateRoleSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    requirements: formData.get('requirements'),
    customerId: formData.get('customerId') || undefined,
    frameworkLevelId: formData.get('frameworkLevelId') || undefined,
    frameworkLevelLabel: formData.get('frameworkLevelLabel') || undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(roles)
      .set({
        title: parsed.data.title,
        description: parsed.data.description,
        requirements: parsed.data.requirements,
        customerId: parsed.data.customerId || null,
        frameworkLevelId: parsed.data.frameworkLevelId || null,
        frameworkLevelLabel: parsed.data.frameworkLevelLabel || null,
      })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
  })

  after(async () => {
    await _saveRoleTags(roleId, tenantId, parsed.data.title, parsed.data.description, parsed.data.requirements)
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  revalidatePath('/dashboard/roles')
  return { success: true }
}

// ---------------------------------------------------------------------------
// regenerateRoleTags — manually (re)run tag extraction for an existing role
// ---------------------------------------------------------------------------

export async function regenerateRoleTags(
  roleId: string
): Promise<{ success: boolean; error?: string }> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return { success: false, error: 'Unauthorized' }
  try { requireRole(userRole ?? undefined, 'recruiter') } catch {
    return { success: false, error: 'Forbidden' }
  }

  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select({ title: roles.title, description: roles.description, requirements: roles.requirements })
      .from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId))).limit(1)
  )
  if (!role) return { success: false, error: 'Role not found' }

  after(async () => {
    await _saveRoleTags(roleId, tenantId, role.title, role.description, role.requirements)
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// archiveRole — soft-delete a role by setting isActive=false
// ---------------------------------------------------------------------------

export async function archiveRole(roleId: string): Promise<void> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) throw new Error('Unauthorized')

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(roles)
      .set({ isActive: false })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
  })

  redirect('/dashboard/roles')
}

// ---------------------------------------------------------------------------
// _saveRoleTags — background helper: call Claude, write tags to DB
// ---------------------------------------------------------------------------

async function _saveRoleTags(
  roleId: string,
  tenantId: string,
  title: string,
  description: string,
  requirements: string
): Promise<void> {
  try {
    const tags = await extractRoleTags(title, description, requirements)
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(roles)
        .set({ keySkills: tags.keySkills, topRequirements: tags.topRequirements })
        .where(eq(roles.id, roleId))
    })
    revalidatePath(`/dashboard/roles/${roleId}`)
    revalidatePath('/dashboard/roles')
  } catch (err) {
    console.error(`Role tag extraction failed for ${roleId}:`, err)
  }
}
