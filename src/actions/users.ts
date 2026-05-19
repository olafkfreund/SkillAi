'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { withTenant } from '@/db'
import { users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/auth/require-role'
import { getActionContext } from '@/lib/auth/action-context'
import { emitAudit } from '@/lib/audit-middleware'
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
    newPassword: z.string().min(12, 'New password must be at least 12 characters'),
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
      .set({
        passwordHash: newHash,
        lastPasswordChangeAt: new Date(),
        passwordResetRequired: false,
      })
      .where(
        and(
          eq(users.id, session.user.id),
          eq(users.tenantId, session.user.tenantId)
        )
      )
  })

  emitAudit(session.user.tenantId, {
    action: 'user.password_changed',
    entityType: 'user',
    entityId: session.user.id,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// List tenant users (admin only)
// ---------------------------------------------------------------------------

export async function listTenantUsers(): Promise<User[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId, userRole } = ctx

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

// ---------------------------------------------------------------------------
// Create user directly (admin only) — bypasses invitation flow.
// User is created with passwordResetRequired=true so the middleware will
// force them to /settings#change-password on first login.
// ---------------------------------------------------------------------------

const CreateUserDirectSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email must be 255 characters or fewer'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  role: z.enum(['admin', 'recruiter', 'hiring_manager', 'viewer']),
  tempPassword: z
    .string()
    .min(12, 'Temporary password must be at least 12 characters')
    .max(128, 'Temporary password must be 128 characters or fewer'),
})

export async function createUserDirect(
  formData: FormData
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }

  try {
    requireRole(ctx.userRole, 'admin')
  } catch {
    return { ok: false, error: 'Forbidden: admins only' }
  }

  const parsed = CreateUserDirectSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    role: formData.get('role'),
    tempPassword: formData.get('tempPassword'),
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Validation failed',
    }
  }

  // Check email uniqueness within tenant
  const existing = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, parsed.data.email),
          eq(users.tenantId, ctx.tenantId)
        )
      )
      .limit(1)
  )
  if (existing.length > 0) {
    return { ok: false, error: 'A user with this email already exists in this tenant.' }
  }

  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 12)

  const inserted = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .insert(users)
      .values({
        tenantId: ctx.tenantId,
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash,
        passwordResetRequired: true,
        isActive: true,
      })
      .returning({ id: users.id })
  )

  const created = inserted[0]
  if (!created) {
    return { ok: false, error: 'Failed to create user' }
  }

  emitAudit(ctx.tenantId, {
    action: 'user.created',
    entityType: 'user',
    entityId: created.id,
    entityLabel: parsed.data.email,
    metadata: { createdVia: 'manual', role: parsed.data.role },
  })

  revalidatePath('/settings')

  return { ok: true, userId: created.id }
}
