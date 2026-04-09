'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db, withTenant } from '@/db'
import { users, userInvitations } from '@/db/schema'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'

// ---------------------------------------------------------------------------
// Shared state type
// ---------------------------------------------------------------------------

export type InvitationState = {
  success: boolean
  error?: string
  inviteUrl?: string
  fieldErrors?: Record<string, string[]>
}

// ---------------------------------------------------------------------------
// Create invitation (admin only)
// ---------------------------------------------------------------------------

const CreateInvitationSchema = z.object({
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  role: z.enum(['admin', 'recruiter', 'viewer']).default('recruiter'),
})

export async function createInvitation(
  _prev: InvitationState | null,
  formData: FormData
): Promise<InvitationState> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId || !userId) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    requireRole(userRole ?? undefined, 'admin')
  } catch {
    return { success: false, error: 'Only admins can create invitations' }
  }

  const rawEmail = formData.get('email') as string | null
  const parsed = CreateInvitationSchema.safeParse({
    email: rawEmail ?? '',
    role: formData.get('role') ?? 'recruiter',
  })

  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Invitations table has no RLS — insert directly without withTenant
  await db.insert(userInvitations).values({
    tenantId,
    token,
    email: parsed.data.email || null,
    role: parsed.data.role,
    createdBy: userId,
    expiresAt,
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  const inviteUrl = `${baseUrl}/invite/${token}`

  revalidatePath('/dashboard/users')
  return { success: true, inviteUrl }
}

// ---------------------------------------------------------------------------
// Revoke invitation (admin only)
// ---------------------------------------------------------------------------

export async function revokeInvitation(invitationId: string): Promise<void> {
  const session = await auth()
  if (!session?.user.tenantId) return

  requireRole(session.user.role, 'admin')

  // Delete by id — no RLS on invitations table
  await db
    .delete(userInvitations)
    .where(
      and(
        eq(userInvitations.id, invitationId),
        eq(userInvitations.tenantId, session.user.tenantId)
      )
    )

  revalidatePath('/dashboard/users')
}

// ---------------------------------------------------------------------------
// Accept invitation (public — no auth required)
// ---------------------------------------------------------------------------

export type AcceptInvitationState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

const AcceptInvitationSchema = z
  .object({
    token: z.string().min(1, 'Invalid invitation token'),
    name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export async function acceptInvitation(
  _prev: AcceptInvitationState | null,
  formData: FormData
): Promise<AcceptInvitationState> {
  const parsed = AcceptInvitationSchema.safeParse({
    token: formData.get('token'),
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { token, name, email, password } = parsed.data

  // Look up invitation — no RLS needed on this table
  const [invitation] = await db
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.token, token))
    .limit(1)

  if (!invitation) {
    return { success: false, error: 'Invitation not found or already used' }
  }

  if (invitation.usedAt !== null) {
    return { success: false, error: 'This invitation has already been used' }
  }

  if (invitation.expiresAt < new Date()) {
    return { success: false, error: 'This invitation has expired' }
  }

  // If the invitation had a specific email, enforce it
  if (invitation.email && invitation.email !== email) {
    return { success: false, error: 'This invitation was issued for a different email address' }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const role = (invitation.role as UserRole) ?? 'recruiter'

  // Insert the new user — users table has RLS so use withTenant
  await withTenant(invitation.tenantId, async (tx) => {
    await tx.insert(users).values({
      tenantId: invitation.tenantId,
      email,
      name,
      role,
      passwordHash,
      isActive: true,
    })
  })

  // Mark the invitation as used — no RLS on invitations table
  await db
    .update(userInvitations)
    .set({ usedAt: new Date() })
    .where(eq(userInvitations.token, token))

  return { success: true }
}

// ---------------------------------------------------------------------------
// List pending invitations for a tenant (admin only)
// ---------------------------------------------------------------------------

export async function listPendingInvitations() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return []

  try {
    requireRole(userRole ?? undefined, 'admin')
  } catch {
    return []
  }

  const now = new Date()

  return db
    .select()
    .from(userInvitations)
    .where(
      and(
        eq(userInvitations.tenantId, tenantId),
        isNull(userInvitations.usedAt),
        gt(userInvitations.expiresAt, now)
      )
    )
    .orderBy(userInvitations.createdAt)
}
