import { describe, it, expect } from 'vitest'
import { hasRole, requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'

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
})
