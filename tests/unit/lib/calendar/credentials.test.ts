import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mocks so they are available before module imports
const mockWithTenant = vi.hoisted(() => vi.fn())
const mockDecrypt = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({ withTenant: mockWithTenant }))
vi.mock('@/db/schema', () => ({
  tenantSettings: { value: 'value', tenantId: 'tenant_id', key: 'key' },
}))
vi.mock('@/lib/crypto', () => ({ decrypt: mockDecrypt }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

import { getOAuthCredentials } from '@/lib/calendar/credentials'

const TENANT = 'tenant-abc'

// Helper: return a DB row for withTenant in the order that _getTenantOAuthSetting is called.
// Since the function calls withTenant once per key, we use mockResolvedValueOnce per call.
function mockDbRows(...rowSets: Array<Array<{ value: string }> | []>) {
  for (const rows of rowSets) {
    mockWithTenant.mockResolvedValueOnce(rows)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Clean up any env vars set by previous tests
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_SECRET
  delete process.env.MICROSOFT_CLIENT_ID
  delete process.env.MICROSOFT_CLIENT_SECRET
  delete process.env.MICROSOFT_TENANT_ID
})

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------
describe('getOAuthCredentials — google', () => {
  it('returns tenant creds when both keys are in tenant_settings', async () => {
    mockDbRows([{ value: 'enc-id' }], [{ value: 'enc-secret' }])
    mockDecrypt
      .mockReturnValueOnce('google-client-id-from-db')
      .mockReturnValueOnce('google-secret-from-db')

    const creds = await getOAuthCredentials(TENANT, 'google')

    expect(creds).toEqual({
      clientId: 'google-client-id-from-db',
      clientSecret: 'google-secret-from-db',
      source: 'tenant',
    })
  })

  it('falls through to env when only client_id is in tenant_settings', async () => {
    // tenant has client_id but not client_secret
    mockDbRows([{ value: 'enc-id' }], [])
    mockDecrypt.mockReturnValueOnce('google-client-id-from-db')

    process.env.GOOGLE_CLIENT_ID = 'env-id'
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret'

    const creds = await getOAuthCredentials(TENANT, 'google')

    expect(creds).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
      source: 'env',
    })
  })

  it('returns env creds when tenant_settings is empty', async () => {
    mockDbRows([], [])

    process.env.GOOGLE_CLIENT_ID = 'env-id'
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret'

    const creds = await getOAuthCredentials(TENANT, 'google')

    expect(creds).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
      source: 'env',
    })
  })

  it('returns null when neither tenant_settings nor env has credentials', async () => {
    mockDbRows([], [])

    const creds = await getOAuthCredentials(TENANT, 'google')

    expect(creds).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Microsoft
// ---------------------------------------------------------------------------
describe('getOAuthCredentials — microsoft', () => {
  it('returns all 3 fields from tenant_settings when all are present', async () => {
    mockDbRows(
      [{ value: 'enc-client-id' }],
      [{ value: 'enc-client-secret' }],
      [{ value: 'enc-ms-tenant-id' }]
    )
    mockDecrypt
      .mockReturnValueOnce('ms-client-id-from-db')
      .mockReturnValueOnce('ms-secret-from-db')
      .mockReturnValueOnce('ms-tenant-from-db')

    const creds = await getOAuthCredentials(TENANT, 'microsoft')

    expect(creds).toEqual({
      clientId: 'ms-client-id-from-db',
      clientSecret: 'ms-secret-from-db',
      microsoftTenantId: 'ms-tenant-from-db',
      source: 'tenant',
    })
  })

  it('falls back to env tenant_id when tenant has client_id+secret but no tenant_id', async () => {
    // client_id and client_secret present in DB, tenant_id absent
    mockDbRows([{ value: 'enc-id' }], [{ value: 'enc-secret' }], [])
    mockDecrypt
      .mockReturnValueOnce('ms-client-id-from-db')
      .mockReturnValueOnce('ms-secret-from-db')

    process.env.MICROSOFT_TENANT_ID = 'env-tenant-id'

    const creds = await getOAuthCredentials(TENANT, 'microsoft')

    expect(creds).toMatchObject({
      clientId: 'ms-client-id-from-db',
      clientSecret: 'ms-secret-from-db',
      microsoftTenantId: 'env-tenant-id',
      source: 'tenant',
    })
  })

  it("falls back to 'common' when both tenant_settings and env are missing tenant_id", async () => {
    mockDbRows([{ value: 'enc-id' }], [{ value: 'enc-secret' }], [])
    mockDecrypt
      .mockReturnValueOnce('ms-client-id-from-db')
      .mockReturnValueOnce('ms-secret-from-db')

    // No MICROSOFT_TENANT_ID env var
    const creds = await getOAuthCredentials(TENANT, 'microsoft')

    expect(creds).toMatchObject({
      microsoftTenantId: 'common',
    })
  })

  it('returns null when client_id and client_secret are absent from both sources', async () => {
    mockDbRows([], [])
    // No env vars set

    const creds = await getOAuthCredentials(TENANT, 'microsoft')

    expect(creds).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Error resilience
// ---------------------------------------------------------------------------
describe('getOAuthCredentials — decryption failure', () => {
  it('falls through to env when decryption throws for Google', async () => {
    mockDbRows([{ value: 'enc-id' }], [{ value: 'enc-secret' }])
    // First decrypt call throws; second decrypt call would also throw but we
    // fall through to env before reaching it because client_id decrypt threw.
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error('Decryption failed')
    })

    process.env.GOOGLE_CLIENT_ID = 'env-id'
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret'

    const creds = await getOAuthCredentials(TENANT, 'google')

    expect(creds).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
      source: 'env',
    })
  })
})
