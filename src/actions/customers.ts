'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { customers } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'
import { redirect } from 'next/navigation'

const CustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  website: z.string().max(500).optional(),
  notes: z.string().optional(),
})

export type CreateCustomerState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  customerId?: string
}

async function getTenantId(): Promise<string> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) throw new Error('Not authenticated')
  return tenantId
}

async function getUserRole(): Promise<UserRole | undefined> {
  const headersList = await headers()
  return (headersList.get('x-user-role') as UserRole | null) ?? undefined
}

export async function createCustomer(
  _prev: CreateCustomerState | null,
  formData: FormData
): Promise<CreateCustomerState> {
  const tenantId = await getTenantId()
  const userRole = await getUserRole()

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const parsed = CustomerSchema.safeParse({
    name: formData.get('name'),
    contactName: formData.get('contactName') || undefined,
    contactEmail: formData.get('contactEmail') || undefined,
    contactPhone: formData.get('contactPhone') || undefined,
    website: formData.get('website') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, contactName, contactEmail, contactPhone, website, notes } = parsed.data

  await withTenant(tenantId, async (tx) => {
    await tx.insert(customers).values({
      tenantId,
      name,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      website: website || null,
      notes: notes || null,
    })
  })

  redirect('/dashboard/customers')
}

export async function updateCustomer(
  customerId: string,
  _prev: CreateCustomerState | null,
  formData: FormData
): Promise<CreateCustomerState> {
  const tenantId = await getTenantId()
  const userRole = await getUserRole()

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const parsed = CustomerSchema.safeParse({
    name: formData.get('name'),
    contactName: formData.get('contactName') || undefined,
    contactEmail: formData.get('contactEmail') || undefined,
    contactPhone: formData.get('contactPhone') || undefined,
    website: formData.get('website') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, contactName, contactEmail, contactPhone, website, notes } = parsed.data

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(customers)
      .set({
        name,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        website: website || null,
        notes: notes || null,
      })
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/customers/${customerId}`)
  redirect(`/dashboard/customers/${customerId}`)
}

export async function archiveCustomer(customerId: string): Promise<void> {
  const tenantId = await getTenantId()
  const userRole = await getUserRole()

  try {
    requireRole(userRole, 'admin')
  } catch {
    throw new Error('Forbidden: admins only')
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(customers)
      .set({ isActive: false })
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
  })

  redirect('/dashboard/customers')
}
