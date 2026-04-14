'use server'

import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { agencies } from '@/db/schema'
import { redirect } from 'next/navigation'
import { getActionContext } from '@/lib/auth/action-context'

const AgencySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  notes: z.string().optional(),
})

export async function createAgency(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  const parsed = AgencySchema.safeParse({
    name: formData.get('name'),
    contactEmail: formData.get('contactEmail') || undefined,
    contactPhone: formData.get('contactPhone') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { name, contactEmail, notes, contactPhone } = parsed.data

  await withTenant(tenantId, async (tx) => {
    await tx.insert(agencies).values({
      tenantId,
      name,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      notes: notes || null,
    })
  })

  redirect('/dashboard/agencies')
}

export async function updateAgency(
  agencyId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  const parsed = AgencySchema.safeParse({
    name: formData.get('name'),
    contactEmail: formData.get('contactEmail') || undefined,
    contactPhone: formData.get('contactPhone') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { name, contactEmail, notes, contactPhone } = parsed.data

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(agencies)
      .set({
        name,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        notes: notes || null,
      })
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
  })

  redirect(`/dashboard/agencies/${agencyId}`)
}

export async function archiveAgency(agencyId: string): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  // Load the agency first to check system flag — system agencies cannot be archived
  const [existing] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: agencies.id, isSystem: agencies.isSystem })
      .from(agencies)
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
      .limit(1)
  )

  if (!existing) {
    throw new Error('Agency not found')
  }

  if (existing.isSystem) {
    throw new Error('System agencies cannot be archived')
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(agencies)
      .set({ isActive: false })
      .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
  })

  redirect('/dashboard/agencies')
}
