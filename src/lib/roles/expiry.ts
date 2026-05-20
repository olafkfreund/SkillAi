/**
 * Pure expiry helpers for roles.
 *
 * DEC-008: when cutoffDate passes, the role is flagged as expired but
 * remains isActive = true until a recruiter explicitly archives it.
 * No auto-archiving is ever triggered from this module.
 */

/**
 * Returns true when the role's cutoff date is in the past (before today,
 * midnight local time).  Returns false when cutoffDate is null/undefined,
 * which means the role has no deadline and cannot expire.
 */
export function isRoleExpired(cutoffDate: string | Date | null | undefined): boolean {
  if (!cutoffDate) return false
  const cutoff = typeof cutoffDate === 'string' ? new Date(cutoffDate) : cutoffDate
  // Compare against today at midnight so a role expiring today is NOT expired
  // until the calendar date has actually passed.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return cutoff.getTime() < today.getTime()
}
