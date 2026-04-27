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

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'recruiter' | 'viewer'
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
