'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { extractRoleTags } from '@/lib/ai/role-tags'
import { getActionContext } from '@/lib/auth/action-context'

// Preprocess priorityKeywords: form sends a JSON-stringified array via FormData.
// Accepts an actual array (programmatic call) OR a JSON string (FormData);
// invalid/empty strings normalise to [].
const priorityKeywordsField = z.preprocess(
  (raw) => {
    if (Array.isArray(raw)) return raw
    if (typeof raw !== 'string') return []
    if (raw.trim() === '') return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },
  z.array(z.string().min(2).max(120)).max(15).default([])
)

const CreateRoleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  customerId: z.string().uuid().optional().or(z.literal('')),
  frameworkLevelId: z.string().max(50).optional().or(z.literal('')),
  frameworkLevelLabel: z.string().max(200).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional().or(z.literal('')),
  languageRequirements: z.string().optional().or(z.literal('')),
  targetFillDate: z.string().optional().or(z.literal('')),
  cutoffDate: z.string().optional().or(z.literal('')),
  customerPortalPath: z.string().max(500).optional().or(z.literal('')),
  customerDayRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).toUpperCase().optional().or(z.literal('')),
  priorityKeywords: priorityKeywordsField,
}).refine(
  (data) => {
    const hasRate = typeof data.customerDayRate === 'number'
    if (hasRate && (!data.rateCurrency || data.rateCurrency === '')) return false
    return true
  },
  { message: 'Currency is required when a rate is set', path: ['rateCurrency'] }
)

export type CreateRoleState =
  | { success: true; roleId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createRole(
  _prev: CreateRoleState | null,
  formData: FormData
): Promise<CreateRoleState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

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
    country: formData.get('country') || undefined,
    city: formData.get('city') || undefined,
    workMode: formData.get('workMode') || undefined,
    languageRequirements: formData.get('languageRequirements') || undefined,
    targetFillDate: formData.get('targetFillDate') || undefined,
    cutoffDate: formData.get('cutoffDate') || undefined,
    customerPortalPath: formData.get('customerPortalPath') || undefined,
    customerDayRate: formData.get('customerDayRate') || undefined,
    rateCurrency: formData.get('rateCurrency') || undefined,
    priorityKeywords: formData.get('priorityKeywords') ?? undefined,
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
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        workMode: (parsed.data.workMode as 'remote' | 'hybrid' | 'onsite') || null,
        languageRequirements: parsed.data.languageRequirements
          ? parsed.data.languageRequirements.split(',').map((l) => l.trim()).filter(Boolean)
          : [],
        targetFillDate: parsed.data.targetFillDate || null,
        cutoffDate: parsed.data.cutoffDate || null,
        customerPortalPath: parsed.data.customerPortalPath || null,
        customerDayRate: typeof parsed.data.customerDayRate === 'number' ? String(parsed.data.customerDayRate) : null,
        rateCurrency: parsed.data.rateCurrency || null,
        priorityKeywords: parsed.data.priorityKeywords,
        priorityKeywordsUpdatedAt: parsed.data.priorityKeywords.length > 0 ? new Date() : null,
        isActive: true,
      })
      .returning({ id: roles.id })
  })

  after(async () => {
    await _saveRoleTags(role.id, tenantId, parsed.data.title, parsed.data.description, parsed.data.requirements)
  })

  // Audit: role created
  await writeAuditLog(tenantId, {
    action: 'role.created',
    entityType: 'role',
    entityId: role.id,
    entityLabel: parsed.data.title,
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
  country: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional().or(z.literal('')),
  languageRequirements: z.string().optional().or(z.literal('')),
  targetFillDate: z.string().optional().or(z.literal('')),
  cutoffDate: z.string().optional().or(z.literal('')),
  customerPortalPath: z.string().max(500).optional().or(z.literal('')),
  customerDayRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).toUpperCase().optional().or(z.literal('')),
  priorityKeywords: priorityKeywordsField,
}).refine(
  (data) => {
    const hasRate = typeof data.customerDayRate === 'number'
    if (hasRate && (!data.rateCurrency || data.rateCurrency === '')) return false
    return true
  },
  { message: 'Currency is required when a rate is set', path: ['rateCurrency'] }
)

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
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

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
    country: formData.get('country') || undefined,
    city: formData.get('city') || undefined,
    workMode: formData.get('workMode') || undefined,
    languageRequirements: formData.get('languageRequirements') || undefined,
    targetFillDate: formData.get('targetFillDate') || undefined,
    cutoffDate: formData.get('cutoffDate') || undefined,
    customerPortalPath: formData.get('customerPortalPath') || undefined,
    customerDayRate: formData.get('customerDayRate') || undefined,
    rateCurrency: formData.get('rateCurrency') || undefined,
    priorityKeywords: formData.get('priorityKeywords') ?? undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // Load existing role so we can diff priorityKeywords and only bump
  // priorityKeywordsUpdatedAt when the set actually changes.
  const [existingRole] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        title: roles.title,
        priorityKeywords: roles.priorityKeywords,
      })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!existingRole) {
    return { success: false, error: 'Role not found' }
  }

  const oldKeywords = existingRole.priorityKeywords ?? []
  const newKeywords = parsed.data.priorityKeywords
  const oldSet = new Set(oldKeywords)
  const newSet = new Set(newKeywords)
  const added = newKeywords.filter((k) => !oldSet.has(k))
  const removed = oldKeywords.filter((k) => !newSet.has(k))
  const keywordsChanged = added.length > 0 || removed.length > 0

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
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        workMode: (parsed.data.workMode as 'remote' | 'hybrid' | 'onsite') || null,
        languageRequirements: parsed.data.languageRequirements
          ? parsed.data.languageRequirements.split(',').map((l) => l.trim()).filter(Boolean)
          : [],
        targetFillDate: parsed.data.targetFillDate || null,
        cutoffDate: parsed.data.cutoffDate || null,
        customerPortalPath: parsed.data.customerPortalPath || null,
        customerDayRate: typeof parsed.data.customerDayRate === 'number' ? String(parsed.data.customerDayRate) : null,
        rateCurrency: parsed.data.rateCurrency || null,
        priorityKeywords: newKeywords,
        ...(keywordsChanged ? { priorityKeywordsUpdatedAt: new Date() } : {}),
      })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
  })

  // Audit: only emit when priorityKeywords actually changed. Mirrors the
  // existing pattern in createRole / archiveRole (writeAuditLog with
  // action / entityType / entityId / entityLabel + optional metadata).
  if (keywordsChanged) {
    await writeAuditLog(tenantId, {
      action: 'role.updated',
      entityType: 'role',
      entityId: roleId,
      entityLabel: parsed.data.title,
      metadata: { field: 'priorityKeywords', added, removed },
    })
  }

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
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

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
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(roles)
      .set({ isActive: false })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
  })

  // Audit: role archived
  await writeAuditLog(tenantId, {
    action: 'role.archived',
    entityType: 'role',
    entityId: roleId,
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
