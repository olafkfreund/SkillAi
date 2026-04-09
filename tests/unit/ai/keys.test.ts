import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules before importing the module under test
const mockWithTenant = vi.hoisted(() => vi.fn())
const mockDecrypt = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({ withTenant: mockWithTenant }))
vi.mock('@/db/schema', () => ({ tenantSettings: { value: 'value', tenantId: 'tenant_id', key: 'key' } }))
vi.mock('@/lib/crypto', () => ({ decrypt: mockDecrypt }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

import { resolveAnthropicKey, resolveGoogleKey } from '@/lib/ai/keys'

const TENANT = 'tenant-123'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GOOGLE_AI_API_KEY
})

describe('resolveAnthropicKey', () => {
  it('returns decrypted DB value when tenant setting exists', async () => {
    mockWithTenant.mockResolvedValue([{ value: 'enc:tag:cipher' }])
    mockDecrypt.mockReturnValue('sk-ant-from-db')

    const key = await resolveAnthropicKey(TENANT)
    expect(key).toBe('sk-ant-from-db')
    expect(mockDecrypt).toHaveBeenCalledWith('enc:tag:cipher')
  })

  it('falls back to env var when no DB setting', async () => {
    mockWithTenant.mockResolvedValue([])
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env'

    const key = await resolveAnthropicKey(TENANT)
    expect(key).toBe('sk-ant-env')
  })

  it('throws when no DB setting and no env var', async () => {
    mockWithTenant.mockResolvedValue([])
    await expect(resolveAnthropicKey(TENANT)).rejects.toThrow('No Anthropic API key')
  })

  it('falls back to env var when DB lookup throws', async () => {
    mockWithTenant.mockRejectedValue(new Error('DB error'))
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-fallback'

    const key = await resolveAnthropicKey(TENANT)
    expect(key).toBe('sk-ant-env-fallback')
  })
})

describe('resolveGoogleKey', () => {
  it('returns decrypted DB value when tenant setting exists', async () => {
    mockWithTenant.mockResolvedValue([{ value: 'enc:tag:cipher' }])
    mockDecrypt.mockReturnValue('google-key-from-db')

    const key = await resolveGoogleKey(TENANT)
    expect(key).toBe('google-key-from-db')
  })

  it('falls back to env var when no DB setting', async () => {
    mockWithTenant.mockResolvedValue([])
    process.env.GOOGLE_AI_API_KEY = 'google-env'

    const key = await resolveGoogleKey(TENANT)
    expect(key).toBe('google-env')
  })

  it('throws when no DB setting and no env var', async () => {
    mockWithTenant.mockResolvedValue([])
    await expect(resolveGoogleKey(TENANT)).rejects.toThrow('No Google AI API key')
  })
})
