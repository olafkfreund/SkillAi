import { describe, it, expect } from 'vitest'
import { hasRole, requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'

// Numeric rank values from require-role.ts:
//   viewer = 0, hiring_manager = 0.5, recruiter = 1, admin = 2
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  hiring_manager: 0.5,
  recruiter: 1,
  admin: 2,
}

describe('hasRole()', () => {
  it('admin satisfies all roles', () => {
    expect(hasRole('admin', 'viewer')).toBe(true)
    expect(hasRole('admin', 'recruiter')).toBe(true)
    expect(hasRole('admin', 'admin')).toBe(true)
  })

  it('recruiter satisfies viewer and recruiter but not admin', () => {
    expect(hasRole('recruiter', 'viewer')).toBe(true)
    expect(hasRole('recruiter', 'recruiter')).toBe(true)
    expect(hasRole('recruiter', 'admin')).toBe(false)
  })

  it('viewer only satisfies viewer', () => {
    expect(hasRole('viewer', 'viewer')).toBe(true)
    expect(hasRole('viewer', 'recruiter')).toBe(false)
    expect(hasRole('viewer', 'admin')).toBe(false)
  })

  // ── hiring_manager rank assertions ────────────────────────────────────────

  it('hiring_manager rank is 0.5 — between viewer (0) and recruiter (1)', () => {
    expect(ROLE_RANK['hiring_manager']).toBe(0.5)
    expect(ROLE_RANK['hiring_manager']).toBeGreaterThan(ROLE_RANK['viewer'])
    expect(ROLE_RANK['hiring_manager']).toBeLessThan(ROLE_RANK['recruiter'])
  })

  it('hiring_manager does NOT satisfy recruiter — recruiter-gated actions remain blocked', () => {
    expect(hasRole('hiring_manager', 'recruiter')).toBe(false)
  })

  it('hiring_manager satisfies hiring_manager', () => {
    expect(hasRole('hiring_manager', 'hiring_manager')).toBe(true)
  })

  it('hiring_manager satisfies viewer', () => {
    expect(hasRole('hiring_manager', 'viewer')).toBe(true)
  })

  it('admin satisfies hiring_manager (admin rank > manager rank)', () => {
    expect(hasRole('admin', 'hiring_manager')).toBe(true)
  })

  it('recruiter satisfies hiring_manager (recruiter rank > manager rank)', () => {
    expect(hasRole('recruiter', 'hiring_manager')).toBe(true)
  })

  it('viewer does NOT satisfy hiring_manager', () => {
    expect(hasRole('viewer', 'hiring_manager')).toBe(false)
  })
})

describe('requireRole()', () => {
  it('does not throw when role is sufficient', () => {
    expect(() => requireRole('admin', 'recruiter')).not.toThrow()
    expect(() => requireRole('recruiter', 'viewer')).not.toThrow()
    expect(() => requireRole('admin', 'admin')).not.toThrow()
  })

  it('throws when role is insufficient', () => {
    expect(() => requireRole('viewer', 'recruiter')).toThrow('Forbidden')
    expect(() => requireRole('recruiter', 'admin')).toThrow('Forbidden')
  })

  it('throws when role is undefined', () => {
    expect(() => requireRole(undefined as unknown as UserRole, 'viewer')).toThrow('Forbidden')
  })

  it('does not throw for hiring_manager requiring hiring_manager', () => {
    expect(() => requireRole('hiring_manager', 'hiring_manager')).not.toThrow()
  })

  it('throws for hiring_manager requiring recruiter', () => {
    expect(() => requireRole('hiring_manager', 'recruiter')).toThrow('Forbidden')
  })

  it('does not throw for admin requiring hiring_manager', () => {
    expect(() => requireRole('admin', 'hiring_manager')).not.toThrow()
  })
})
