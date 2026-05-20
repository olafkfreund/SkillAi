'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, inArray, isNull, lt, gt, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db, withTenant } from '@/db'
import { users, userInvitations } from '@/db/schema'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/auth/require-role'
import { getActionContext } from '@/lib/auth/action-context'
import { emitAudit } from '@/lib/audit-middleware'
import type { UserRole } from '@/lib/auth/types'
import type { User } from '@/db/schema/users'

// ---------------------------------------------------------------------------
// Filter types for listTenantUsers
// ---------------------------------------------------------------------------

export type UserStatusFilter = 'active' | 'deactivated' | 'all'
export type UserLastLoginFilter = 'any' | '7d' | '30d' | 'never'

export interface UserFilters {
  roles?: UserRole[]
  status?: UserStatusFilter
  lastLogin?: UserLastLoginFilter
  pendingInviteOnly?: boolean
}

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
// List tenant users (admin only) — supports optional filter params
// ---------------------------------------------------------------------------

export async function listTenantUsers(filters?: UserFilters): Promise<User[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return []
  }

  // Build base query conditions
  const conditions: ReturnType<typeof eq>[] = [eq(users.tenantId, tenantId)]

  // Status filter: active / deactivated / all (default: all)
  const statusFilter = filters?.status ?? 'all'
  if (statusFilter === 'active') {
    conditions.push(eq(users.isActive, true))
  } else if (statusFilter === 'deactivated') {
    conditions.push(eq(users.isActive, false))
  }

  // Role filter: multi-select (admin | recruiter | hiring_manager | viewer)
  const roleFilter = filters?.roles
  if (roleFilter && roleFilter.length > 0) {
    conditions.push(inArray(users.role, roleFilter))
  }

  // Fetch matching users
  let results = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(users.createdAt)
  )

  // Pending invite only: keep users who have at least one un-redeemed, non-expired invitation.
  // This is a separate check against userInvitations (no RLS) keyed by user email.
  if (filters?.pendingInviteOnly) {
    const now = new Date()
    const pendingRows = await db
      .select({ email: userInvitations.email })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.tenantId, tenantId),
          isNull(userInvitations.usedAt),
          gt(userInvitations.expiresAt, now)
        )
      )
    const pendingEmails = new Set(pendingRows.map((r) => r.email).filter(Boolean) as string[])
    results = results.filter((u) => pendingEmails.has(u.email))
  }

  // Last login filter — derived from audit_logs (most recent action per userId).
  // "never" = user has no audit_log rows at all (no activity recorded).
  // "7d"/"30d" = at least one audit row with createdAt within the window.
  // "any" = no restriction.
  const lastLoginFilter = filters?.lastLogin ?? 'any'
  if (lastLoginFilter !== 'any') {
    const { auditLogs } = await import('@/db/schema')

    // Collect user ids that have *any* audit activity within the tenant
    const activityRows = await withTenant(tenantId, async (tx) =>
      tx
        .selectDistinct({ userId: auditLogs.userId })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            isNotNull(auditLogs.userId)
          )
        )
    )
    const activeUserIds = new Set(activityRows.map((r) => r.userId).filter(Boolean) as string[])

    if (lastLoginFilter === 'never') {
      // Keep users with NO activity at all
      results = results.filter((u) => !activeUserIds.has(u.id))
    } else {
      // "7d" or "30d": check for activity within the window
      const days = lastLoginFilter === '7d' ? 7 : 30
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const recentRows = await withTenant(tenantId, async (tx) =>
        tx
          .selectDistinct({ userId: auditLogs.userId })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.tenantId, tenantId),
              isNotNull(auditLogs.userId),
              gt(auditLogs.createdAt, cutoff)
            )
          )
      )
      const recentUserIds = new Set(recentRows.map((r) => r.userId).filter(Boolean) as string[])
      results = results.filter((u) => recentUserIds.has(u.id))
    }
  }

  return results
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
//
// Soft-deactivates a user by setting users.isActive = false. This is the
// counterpart to reactivateUser below. A deactivated user is blocked from
// signing in by the authorizeUser guard in src/lib/auth/authorize.ts.
//
// Guards (all enforced server-side):
//   - admin role required
//   - cannot deactivate your own account
//   - cannot deactivate the sole remaining active admin in the tenant —
//     keeps at least one admin who can re-enable users / manage the tenant
//
// Emits a `user.deactivated` audit row on success.
// ---------------------------------------------------------------------------

export async function deactivateUser(userId: string): Promise<void> {
  const session = await auth()
  if (!session?.user.tenantId) {
    throw new Error('Unauthorized')
  }

  requireRole(session.user.role, 'admin')

  if (userId === session.user.id) {
    throw new Error('You cannot deactivate your own account')
  }

  await withTenant(session.user.tenantId, async (tx) => {
    // Fetch the target so we have the email for audit + can apply the
    // last-admin guard atomically inside the same RLS-scoped query.
    const [target] = await tx
      .select({ id: users.id, email: users.email, role: users.role, isActive: users.isActive })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenantId, session.user.tenantId)
        )
      )
      .limit(1)

    if (!target) {
      throw new Error('User not found')
    }

    // Last-admin guard: if the target is the sole remaining active admin,
    // refuse the deactivation. Counts active admins inside the tenant.
    if (target.role === 'admin' && target.isActive) {
      const activeAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, session.user.tenantId),
            eq(users.role, 'admin'),
            eq(users.isActive, true)
          )
        )

      if (activeAdmins.length <= 1) {
        throw new Error('Cannot deactivate the sole remaining admin')
      }
    }

    await tx
      .update(users)
      .set({ isActive: false })
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenantId, session.user.tenantId)
        )
      )

    emitAudit(session.user.tenantId, {
      action: 'user.deactivated',
      entityType: 'user',
      entityId: userId,
      entityLabel: target.email,
      metadata: { targetUserId: userId, targetEmail: target.email },
    })
  })

  revalidatePath('/dashboard/users')
}

// ---------------------------------------------------------------------------
// Reactivate user (admin only)
//
// Restores sign-in access for a previously-deactivated user by setting
// users.isActive = true. Mirror of deactivateUser. Emits `user.reactivated`.
// ---------------------------------------------------------------------------

export async function reactivateUser(userId: string): Promise<void> {
  const session = await auth()
  if (!session?.user.tenantId) {
    throw new Error('Unauthorized')
  }

  requireRole(session.user.role, 'admin')

  await withTenant(session.user.tenantId, async (tx) => {
    const [target] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenantId, session.user.tenantId)
        )
      )
      .limit(1)

    if (!target) {
      throw new Error('User not found')
    }

    await tx
      .update(users)
      .set({ isActive: true })
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenantId, session.user.tenantId)
        )
      )

    emitAudit(session.user.tenantId, {
      action: 'user.reactivated',
      entityType: 'user',
      entityId: userId,
      entityLabel: target.email,
      metadata: { targetUserId: userId, targetEmail: target.email },
    })
  })

  revalidatePath('/dashboard/users')
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
