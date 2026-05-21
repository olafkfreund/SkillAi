'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import {
  roles,
  scores,
  roleManagers,
  roleSubmissions,
  candidateRoleApprovals,
  interviewPacks,
  interviewQuestions,
  codeChallenges,
  interviewTranscripts,
  transcriptAnalyses,
  interviewSlots,
  auditLogs,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { extractRoleTags } from '@/lib/ai/role-tags'
import { getActionContext } from '@/lib/auth/action-context'
import { triggerAutoMatch } from '@/actions/auto-match'

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
  customerRoleId: z.string().max(100).trim().optional().or(z.literal('')),
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
    customerRoleId: formData.get('customerRoleId') || undefined,
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
        customerRoleId: parsed.data.customerRoleId || null,
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

  // Auto-match epic #267 / issue #270: kick off the archive pre-filter +
  // top-3 Claude scoring as a background job so the recruiter sees suggested
  // candidates on the role detail page without manual action. Self-audits
  // (role.auto_match_started / _completed / _failed) and never throws —
  // outer catch is a safety net only.
  after(async () => {
    try {
      await triggerAutoMatch(role.id, tenantId)
    } catch (err) {
      console.error(`[auto-match] background failure for role ${role.id}:`, err)
    }
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
  customerRoleId: z.string().max(100).trim().optional().or(z.literal('')),
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
    customerRoleId: formData.get('customerRoleId') || undefined,
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
  // priorityKeywordsUpdatedAt when the set actually changes. Also used to
  // diff customerRoleId for audit emission.
  const [existingRole] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        title: roles.title,
        priorityKeywords: roles.priorityKeywords,
        customerRoleId: roles.customerRoleId,
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

  // Diff customerRoleId — empty string normalises to null for comparison so
  // '' → null transitions don't register as changes.
  const oldCustomerRoleId = existingRole.customerRoleId ?? null
  const newCustomerRoleId = parsed.data.customerRoleId || null
  const customerRoleIdChanged = oldCustomerRoleId !== newCustomerRoleId

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(roles)
      .set({
        title: parsed.data.title,
        description: parsed.data.description,
        requirements: parsed.data.requirements,
        customerId: parsed.data.customerId || null,
        customerRoleId: newCustomerRoleId,
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

  // Audit: emit when customerRoleId changes (set / cleared / replaced).
  // Reuses the existing 'role.updated' action — one row per changed field.
  if (customerRoleIdChanged) {
    await writeAuditLog(tenantId, {
      action: 'role.updated',
      entityType: 'role',
      entityId: roleId,
      entityLabel: parsed.data.title,
      metadata: { field: 'customerRoleId', from: oldCustomerRoleId, to: newCustomerRoleId },
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
// archiveRole — soft-delete a role by setting isActive=false (DEC-008)
// ---------------------------------------------------------------------------

export async function archiveRole(roleId: string): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  // Load the role first so we can capture the title for the audit entry.
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ title: roles.title })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!existing) {
    throw new Error('Role not found')
  }

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
    entityLabel: existing.title,
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  revalidatePath('/dashboard/roles')
  redirect('/dashboard/roles')
}

// ---------------------------------------------------------------------------
// unarchiveRole — flip an archived role back to isActive=true (DEC-008)
// ---------------------------------------------------------------------------

export type UnarchiveRoleResult =
  | { ok: true }
  | { ok: false; error: string }

export async function unarchiveRole(roleId: string): Promise<UnarchiveRoleResult> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { ok: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Load the role first so we can capture the title for the audit entry and
  // verify the role exists / belongs to this tenant.
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ title: roles.title, isActive: roles.isActive })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!existing) {
    return { ok: false, error: 'Role not found' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(roles)
      .set({ isActive: true })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
  })

  // Audit: role unarchived
  await writeAuditLog(tenantId, {
    action: 'role.unarchived',
    entityType: 'role',
    entityId: roleId,
    entityLabel: existing.title,
  })

  revalidatePath(`/dashboard/roles/${roleId}`)
  revalidatePath('/dashboard/roles')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// deleteRoleHard — admin-only hard-delete of a role + cascade across all
// FK-referencing child tables. Mirrors DEC-011 candidate-erasure pattern:
//   • explicit transactional deletes in FK dependency order (not DB cascade)
//   • typed-name confirmation (role.title, case-sensitive)
//   • audit_logs rows for this role are redacted (NOT deleted) — preserves
//     the action trail without the entityLabel PII
//   • ai_usage rows whose metadata.roleId points at this role are redacted
//     in place (NULL the roleId in metadata, keep cost aggregates)
//   • a tombstone `role.deleted_hard` audit row is written after commit
// ---------------------------------------------------------------------------

const DeleteRoleHardSchema = z.object({
  roleId: z.string().uuid('roleId must be a valid UUID'),
  typedConfirmation: z.string().min(1, 'Confirmation title is required'),
})

export type DeleteRoleHardInput = z.infer<typeof DeleteRoleHardSchema>

export type DeleteRoleHardResult =
  | { ok: true }
  | { ok: false; error: string }

export async function deleteRoleHard(
  input: DeleteRoleHardInput
): Promise<DeleteRoleHardResult> {
  // 1. Validate input
  const parsed = DeleteRoleHardSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }
  const { roleId, typedConfirmation } = parsed.data

  // 2. Action context
  const ctx = await getActionContext()
  if (!ctx) {
    return { ok: false, error: 'Unauthorized' }
  }
  const { tenantId, userId, userRole } = ctx

  // 3. Admin-only gate
  try {
    requireRole(userRole ?? undefined, 'admin')
  } catch {
    return { ok: false, error: 'Forbidden: admin role required' }
  }

  // 4. Load role to verify existence + capture title for confirmation check
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: roles.id, title: roles.title })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!existing) {
    return { ok: false, error: 'Role not found' }
  }

  // 5. Typed-confirmation must match role.title exactly (case-sensitive)
  if (typedConfirmation !== existing.title) {
    return { ok: false, error: 'Confirmation does not match role title' }
  }

  // 6. Cascade delete inside a single transaction.
  // Order follows FK dependency: grandchildren of interview_packs and
  // interview_transcripts first; then direct children of roles; then SET NULL
  // on interview_slots.role_id; then audit redaction; then the roles row.
  const cascadeCounts = {
    interviewQuestions: 0,
    codeChallenges: 0,
    transcriptAnalyses: 0,
    interviewPacks: 0,
    interviewTranscripts: 0,
    scores: 0,
    roleManagers: 0,
    roleSubmissions: 0,
    candidateRoleApprovals: 0,
    interviewSlotsNulled: 0,
  }

  await withTenant(tenantId, async (tx) => {
    // ---- Grand-children of interview_packs ---------------------------------
    const packRows = await tx
      .select({ id: interviewPacks.id })
      .from(interviewPacks)
      .where(eq(interviewPacks.roleId, roleId))
    const packIds = packRows.map((p) => p.id)
    cascadeCounts.interviewPacks = packIds.length

    if (packIds.length > 0) {
      for (const pid of packIds) {
        await tx.delete(interviewQuestions).where(eq(interviewQuestions.packId, pid))
        cascadeCounts.interviewQuestions += 1
        await tx.delete(codeChallenges).where(eq(codeChallenges.packId, pid))
        cascadeCounts.codeChallenges += 1
      }
    }

    // ---- Grand-children of interview_transcripts ---------------------------
    const transcriptRows = await tx
      .select({ id: interviewTranscripts.id })
      .from(interviewTranscripts)
      .where(eq(interviewTranscripts.roleId, roleId))
    const transcriptIds = transcriptRows.map((t) => t.id)
    cascadeCounts.interviewTranscripts = transcriptIds.length

    if (transcriptIds.length > 0) {
      for (const tid of transcriptIds) {
        await tx
          .delete(transcriptAnalyses)
          .where(eq(transcriptAnalyses.transcriptId, tid))
        cascadeCounts.transcriptAnalyses += 1
      }
    }

    // ---- Direct children of roles (FK → role_id, ON DELETE CASCADE in DB) --
    // We delete explicitly so the cascade order is visible in code per DEC-011.

    // interview_transcripts (after their analyses are gone)
    await tx
      .delete(interviewTranscripts)
      .where(eq(interviewTranscripts.roleId, roleId))

    // interview_packs (after their questions + challenges are gone)
    await tx.delete(interviewPacks).where(eq(interviewPacks.roleId, roleId))

    // scores
    await tx.delete(scores).where(eq(scores.roleId, roleId))
    cascadeCounts.scores = 1 // count is approximate — exact row count not needed for audit

    // candidate_role_approvals
    await tx
      .delete(candidateRoleApprovals)
      .where(eq(candidateRoleApprovals.roleId, roleId))
    cascadeCounts.candidateRoleApprovals = 1

    // role_submissions
    await tx
      .delete(roleSubmissions)
      .where(eq(roleSubmissions.roleId, roleId))
    cascadeCounts.roleSubmissions = 1

    // role_managers
    await tx.delete(roleManagers).where(eq(roleManagers.roleId, roleId))
    cascadeCounts.roleManagers = 1

    // ---- SET NULL on interview_slots.role_id -------------------------------
    // Slots are calendar entries owned by the candidate; the role link is
    // ON DELETE SET NULL in the schema. Preserve the slot but untether it.
    await tx
      .update(interviewSlots)
      .set({ roleId: null })
      .where(eq(interviewSlots.roleId, roleId))
    cascadeCounts.interviewSlotsNulled = 1

    // ---- Redact ai_usage rows referencing this role in metadata ------------
    // ai_usage rows are cost-tracking records — aggregates remain useful, but
    // metadata.roleId points at a now-deleted role. NULL the field in place
    // (redaction-not-deletion, mirrors DEC-011 audit-log handling).
    await tx.execute(sql`
      UPDATE ai_usage
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{roleId}',
        'null'::jsonb
      ) || jsonb_build_object(
        'role_redacted_hard_delete', true,
        'role_redacted_at', NOW()::text
      )
      WHERE tenant_id = ${tenantId}::uuid
        AND metadata->>'roleId' = ${roleId}
    `)

    // ---- Redact audit_logs rows for this role — RETAIN, redact PII ---------
    await tx
      .update(auditLogs)
      .set({
        entityLabel: '[redacted-hard-delete]',
        metadata: {
          redacted_hard_delete: true,
          redacted_at: new Date().toISOString(),
        },
      })
      .where(
        and(
          eq(auditLogs.entityType, 'role'),
          eq(auditLogs.entityId, roleId)
        )
      )

    // ---- Delete the role row (last) ----------------------------------------
    await tx
      .delete(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
  })

  // 7. Tombstone audit entry
  await writeAuditLog(tenantId, {
    action: 'role.deleted_hard',
    entityType: 'role',
    entityId: roleId,
    entityLabel: '[deleted-hard]',
    metadata: {
      roleId,
      roleTitle: existing.title,
      cascadeCounts,
      deletedAt: new Date().toISOString(),
      deletedBy: userId,
    },
  })

  // 8. Invalidate caches
  revalidatePath('/dashboard/roles')

  return { ok: true }
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
    const tags = await extractRoleTags(title, description, requirements, tenantId, roleId)
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
