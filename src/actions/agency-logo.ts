'use server'

import { extname } from 'path'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { agencies } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { getActionContext } from '@/lib/auth/action-context'
import { validateLogoFile, persistLogo, deleteLogo } from '@/lib/branding/store'
import { writeAuditLog } from '@/lib/audit'

// ---------------------------------------------------------------------------
// uploadAgencyLogo
// ---------------------------------------------------------------------------

/**
 * Server action: upload (or replace) the logo for an agency.
 *
 * Reads `agencyId` and `file` from the FormData.
 * The tenant ID is always sourced from the authenticated session — never from
 * client-supplied FormData fields.
 *
 * Sequence:
 * 1. Authenticate + authorise (recruiter minimum)
 * 2. Validate the uploaded file (magic-byte check, 2 MB limit, PNG/JPEG/WebP only)
 * 3. Fetch the agency to confirm ownership and capture any existing logo_path
 * 4. Persist the new logo file to disk
 * 5. Update agencies.logo_path in the DB
 * 6. Best-effort delete the old logo file (if one existed)
 * 7. Audit-log the event
 */
export async function uploadAgencyLogo(
  formData: FormData
): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const agencyId = formData.get('agencyId')
  if (typeof agencyId !== 'string' || !agencyId) {
    return { success: false, error: 'Missing agencyId' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: 'Missing or invalid file' }
  }

  const ext = extname(file.name)
  const buf = Buffer.from(await file.arrayBuffer())

  const validation = await validateLogoFile(buf, ext)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  // Fetch the agency to confirm it belongs to this tenant and get the old logo path.
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: agencies.id, logoPath: agencies.logoPath })
      .from(agencies)
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
      .limit(1)
  )

  if (!existing) {
    return { success: false, error: 'Agency not found' }
  }

  const oldLogoPath = existing.logoPath ?? null

  // Persist new logo — tenantId comes from the session, never from the client.
  const newLogoPath = await persistLogo(buf, tenantId, ext)

  // Update the DB record.
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(agencies)
      .set({ logoPath: newLogoPath })
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
  })

  // Best-effort delete the old logo after the DB is committed.
  if (oldLogoPath) {
    await deleteLogo(oldLogoPath)
  }

  await writeAuditLog(tenantId, {
    action: 'agency.logo_uploaded',
    entityType: 'agency',
    entityId: agencyId,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// removeAgencyLogo
// ---------------------------------------------------------------------------

/**
 * Server action: remove the logo from an agency.
 *
 * Clears agencies.logo_path and best-effort deletes the file from disk.
 */
export async function removeAgencyLogo(
  agencyId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // Fetch the agency to confirm ownership and capture the current logo path.
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: agencies.id, logoPath: agencies.logoPath })
      .from(agencies)
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
      .limit(1)
  )

  if (!existing) {
    return { success: false, error: 'Agency not found' }
  }

  const oldLogoPath = existing.logoPath ?? null

  // Clear the column.
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(agencies)
      .set({ logoPath: null })
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
  })

  // Best-effort delete the file after the DB is committed.
  if (oldLogoPath) {
    await deleteLogo(oldLogoPath)
  }

  await writeAuditLog(tenantId, {
    action: 'agency.logo_removed',
    entityType: 'agency',
    entityId: agencyId,
  })

  return { success: true }
}
