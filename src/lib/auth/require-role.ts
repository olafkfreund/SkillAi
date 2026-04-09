/**
 * requireRole — role-based access guard for Server Actions and API routes
 *
 * Role hierarchy: admin > recruiter > viewer
 * Passing 'recruiter' grants access to recruiters AND admins.
 */

import type { UserRole } from './types'

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  recruiter: 1,
  admin: 2,
}

export function hasRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
}

export function requireRole(userRole: UserRole | undefined, minRole: UserRole): void {
  if (!userRole || !hasRole(userRole, minRole)) {
    throw new Error(`Forbidden: requires ${minRole} role`)
  }
}
