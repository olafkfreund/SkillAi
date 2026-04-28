/**
 * requireRole — role-based access guard for Server Actions and API routes
 *
 * Role hierarchy: admin > recruiter > hiring_manager > viewer
 *
 * Ranks (numeric, allows fractional tiers):
 *   viewer         = 0
 *   hiring_manager = 0.5  ← read-only client stakeholder; sees only assigned content
 *   recruiter      = 1
 *   admin          = 2
 *
 * Passing 'recruiter' grants access to recruiters AND admins (NOT hiring_manager).
 * Passing 'hiring_manager' grants access to managers, recruiters, and admins.
 * Passing 'viewer' admits everyone with an account.
 */

import type { UserRole } from './types'

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  hiring_manager: 0.5,
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
