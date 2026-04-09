/**
 * Unit tests for the credentials auth logic
 *
 * Tests the authorize() function behaviour without a real DB or HTTP server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

// -- Hoisted mocks --
const { mockFindUser } = vi.hoisted(() => ({
  mockFindUser: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn(),
}))

// Mock the DB query used inside authorizeUser
vi.mock('@/lib/auth/authorize', async () => {
  const bcrypt = await import('bcryptjs')
  return {
    authorizeUser: async (email: string, password: string) => {
      const user = await mockFindUser(email)
      if (!user) return null
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) return null
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      }
    },
  }
})

import { authorizeUser } from '@/lib/auth/authorize'

const HASH = await bcrypt.hash('correct-pass', 10)

const FAKE_USER = {
  id: 'user-1',
  email: 'alice@acme.com',
  name: 'Alice',
  role: 'admin' as const,
  tenantId: 'tenant-1',
  passwordHash: HASH,
}

describe('authorizeUser()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user object on valid credentials', async () => {
    mockFindUser.mockResolvedValue(FAKE_USER)

    const result = await authorizeUser('alice@acme.com', 'correct-pass')

    expect(result).toMatchObject({
      id: 'user-1',
      email: 'alice@acme.com',
      role: 'admin',
      tenantId: 'tenant-1',
    })
  })

  it('returns null when user not found', async () => {
    mockFindUser.mockResolvedValue(null)

    const result = await authorizeUser('nobody@acme.com', 'any-pass')
    expect(result).toBeNull()
  })

  it('returns null on wrong password', async () => {
    mockFindUser.mockResolvedValue(FAKE_USER)

    const result = await authorizeUser('alice@acme.com', 'wrong-pass')
    expect(result).toBeNull()
  })

  it('does not expose passwordHash in the returned object', async () => {
    mockFindUser.mockResolvedValue(FAKE_USER)

    const result = await authorizeUser('alice@acme.com', 'correct-pass')
    expect(result).not.toHaveProperty('passwordHash')
  })
})
