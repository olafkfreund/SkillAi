'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { withTenant } from '@/db'
import { users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'
import type { User } from '@/db/schema/users'

// ---------------------------------------------------------------------------
// Update profile
// ---------------------------------------------------------------------------

export type ProfileState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

const ProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
})

export async function updateProfile(
  _prev: ProfileState | null,
  formData: FormData
): Promise<ProfileState> {
  const session = await auth()
  if (!session?.user.tenantId || !session.user.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try { requireRole(session.user.role, 'viewer') } catch {
    return { success: false, error: 'You must be logged in to update your profile' }
  }

  const parsed = ProfileSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  await withTenant(session.user.tenantId, async (tx) => {
    await tx
      .update(users)
      .set({ name: parsed.data.name })
      .where(
        and(
          eq(users.id, session.user.id),
          eq(users.tenantId, session.user.tenantId)
        )
      )
  })

  revalidatePath('/dashboard/profile')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

export type PasswordState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export async function changePassword(
  _prev: PasswordState | null,
  formData: FormData
): Promise<PasswordState> {
  const session = await auth()
  if (!session?.user.tenantId || !session.user.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try { requireRole(session.user.role, 'viewer') } catch {
    return { success: false, error: 'You must be logged in to change your password' }
  }

  const parsed = PasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { currentPassword, newPassword } = parsed.data

  // Fetch current user to verify password — use withTenant for RLS
  const [user] = await withTenant(session.user.tenantId, async (tx) =>
    tx
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(
        and(
          eq(users.id, session.user.id),
          eq(users.tenantId, session.user.tenantId)
        )
      )
      .limit(1)
  )

  if (!user) return { success: false, error: 'User not found' }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return { success: false, error: 'Current password is incorrect' }

  const newHash = await bcrypt.hash(newPassword, 12)

  await withTenant(session.user.tenantId, async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: newHash })
      .where(
        and(
          eq(users.id, session.user.id),
          eq(users.tenantId, session.user.tenantId)
        )
      )
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// List tenant users (admin only)
// ---------------------------------------------------------------------------

export async function listTenantUsers(): Promise<User[]> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return []
  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return []
  }

  return withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(users.createdAt)
  )
}

// ---------------------------------------------------------------------------
// Update user role (admin only)
// ---------------------------------------------------------------------------

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const session = await auth()
  if (!session?.user.tenantId) return

  requireRole(session.user.role, 'admin')

  if (userId === session.user.id) {
    throw new Error('You cannot change your own role')
  }

  await withTenant(session.user.tenantId, async (tx) => {
    await tx
      .update(users)
      .set({ role })
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenantId, session.user.tenantId)
        )
      )
  })

  revalidatePath('/settings')
}

// ---------------------------------------------------------------------------
// Deactivate user (admin only)
// ---------------------------------------------------------------------------

export async function deactivateUser(userId: string): Promise<void> {
  const session = await auth()
  if (!session?.user.tenantId) return

  requireRole(session.user.role, 'admin')

  if (userId === session.user.id) {
    throw new Error('You cannot deactivate your own account')
  }

  await withTenant(session.user.tenantId, async (tx) => {
    await tx
      .update(users)
      .set({ isActive: false })
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenantId, session.user.tenantId)
        )
      )
  })

  revalidatePath('/settings')
}
