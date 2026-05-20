/**
 * Unit tests for src/lib/roles/expiry.ts
 *
 * Covers: isRoleExpired with null, undefined, a future date, a past date,
 * exactly today, and both string and Date inputs.
 */

import { describe, it, expect } from 'vitest'
import { isRoleExpired } from '@/lib/roles/expiry'

// Helpers to build date strings relative to today
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

describe('isRoleExpired', () => {
  it('returns false when cutoffDate is null', () => {
    expect(isRoleExpired(null)).toBe(false)
  })

  it('returns false when cutoffDate is undefined', () => {
    expect(isRoleExpired(undefined)).toBe(false)
  })

  it('returns false for a date in the future', () => {
    expect(isRoleExpired(daysFromNow(7))).toBe(false)
  })

  it('returns false for a date exactly today (not yet expired)', () => {
    expect(isRoleExpired(daysFromNow(0))).toBe(false)
  })

  it('returns true for a date in the past', () => {
    expect(isRoleExpired(daysFromNow(-1))).toBe(true)
  })

  it('returns true for a date well in the past', () => {
    expect(isRoleExpired('2020-01-01')).toBe(true)
  })

  it('accepts a Date object as input — past date returns true', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 30)
    expect(isRoleExpired(pastDate)).toBe(true)
  })

  it('accepts a Date object as input — future date returns false', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    expect(isRoleExpired(futureDate)).toBe(false)
  })

  it('accepts an ISO datetime string — past returns true', () => {
    expect(isRoleExpired('2024-03-15T00:00:00.000Z')).toBe(true)
  })
})
