'use server'

/**
 * Server actions for managing per-tenant email templates.
 *
 * CRUD for email_templates. Default templates (is_default=true) are seeded
 * by seedDefaultTemplates; user-created templates are always is_default=false.
 * Deletion of default templates is refused to protect system templates.
 *
 * All mutations are audit-logged.
 */

import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { emailTemplates } from '@/db/schema'
import type { EmailTemplateCategory } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import type { EmailTemplate } from '@/db/schema'

type ActionResult = { success: true } | { success: false; error: string }

// ---------------------------------------------------------------------------
// listEmailTemplates
// ---------------------------------------------------------------------------

/**
 * Returns all email templates for the current tenant, ordered by category
 * and name. Accessible to recruiters and above.
 */
export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return []
  }

  return withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.tenantId, tenantId))
      .orderBy(emailTemplates.category, emailTemplates.name)
  )
}

// ---------------------------------------------------------------------------
// getEmailTemplate
// ---------------------------------------------------------------------------

/**
 * Returns a single template by id. Returns null if not found or unauthorized.
 */
export async function getEmailTemplate(templateId: string): Promise<EmailTemplate | null> {
  const ctx = await getActionContext()
  if (!ctx) return null
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return null
  }

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.tenantId, tenantId)))
      .limit(1)
  )

  return row ?? null
}

// ---------------------------------------------------------------------------
// createEmailTemplate
// ---------------------------------------------------------------------------

/**
 * Creates a new user-defined email template. is_default is always false for
 * user-created templates. Returns the new template's id.
 */
export async function createEmailTemplate(input: {
  name: string
  category: EmailTemplateCategory
  subject: string
  body: string
}): Promise<{ success: true; templateId: string } | { success: false; error: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const [created] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(emailTemplates)
      .values({
        tenantId,
        name: input.name,
        category: input.category,
        subject: input.subject,
        body: input.body,
        isDefault: false,
      })
      .returning({ id: emailTemplates.id })
  )

  await writeAuditLog(tenantId, {
    action: 'email_template.created',
    entityType: 'email_template',
    entityId: created.id,
    entityLabel: input.name,
    metadata: { category: input.category },
  })

  return { success: true, templateId: created.id }
}

// ---------------------------------------------------------------------------
// updateEmailTemplate
// ---------------------------------------------------------------------------

/**
 * Updates name, subject, and/or body of a template. Allowed even for default
 * templates so tenants can customise the wording.
 */
export async function updateEmailTemplate(
  templateId: string,
  updates: { name?: string; subject?: string; body?: string }
): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Verify template belongs to this tenant
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: emailTemplates.id, name: emailTemplates.name })
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.tenantId, tenantId)))
      .limit(1)
  )
  if (!existing) return { success: false, error: 'Template not found' }

  const patch: Partial<{ name: string; subject: string; body: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  }
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.subject !== undefined) patch.subject = updates.subject
  if (updates.body !== undefined) patch.body = updates.body

  await withTenant(tenantId, async (tx) =>
    tx
      .update(emailTemplates)
      .set(patch)
      .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.tenantId, tenantId)))
  )

  await writeAuditLog(tenantId, {
    action: 'email_template.updated',
    entityType: 'email_template',
    entityId: templateId,
    entityLabel: updates.name ?? existing.name,
    metadata: { fields: Object.keys(updates) },
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// deleteEmailTemplate
// ---------------------------------------------------------------------------

/**
 * Deletes a template. Refuses deletion of system default templates.
 */
export async function deleteEmailTemplate(templateId: string): Promise<ActionResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: emailTemplates.id, name: emailTemplates.name, isDefault: emailTemplates.isDefault })
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.tenantId, tenantId)))
      .limit(1)
  )
  if (!existing) return { success: false, error: 'Template not found' }
  if (existing.isDefault) {
    return { success: false, error: 'Cannot delete a default template' }
  }

  await withTenant(tenantId, async (tx) =>
    tx
      .delete(emailTemplates)
      .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.tenantId, tenantId)))
  )

  await writeAuditLog(tenantId, {
    action: 'email_template.deleted',
    entityType: 'email_template',
    entityId: templateId,
    entityLabel: existing.name,
  })

  return { success: true }
}
