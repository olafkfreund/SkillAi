/**
 * authorizeUser — pure credential verification logic
 *
 * Separated from the Auth.js config so it can be unit-tested without
 * spinning up the full Next.js auth handler.
 */

import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { UserRole } from './types'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: UserRole
  tenantId: string
  passwordResetRequired: boolean
}

export async function authorizeUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  // Look up user by email (bypasses RLS — tenants table not involved here)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) return null

  // Sign-in guard: deactivated users (users.isActive = false) cannot sign in.
  // The admin user-management UI toggles this flag via deactivateUser /
  // reactivateUser in src/actions/users.ts. Returning null here makes the
  // credentials provider report "invalid credentials" — same path as a wrong
  // password — which is the desired UX (no enumeration of active accounts).
  if (user.isActive === false) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    passwordResetRequired: user.passwordResetRequired ?? false,
  }
}
