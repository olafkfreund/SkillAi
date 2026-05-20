/**
 * Unit tests for src/actions/settings.ts
 *
 * Actions under test:
 *   saveApiKey              — happy path (encrypted write, upsert), auth guard,
 *                             role guard, invalid key guard; OAuth key emits
 *                             settings.oauth_credentials_updated audit.
 *   removeApiKey            — happy path (delete row), auth guard, role guard,
 *                             invalid key guard; OAuth key emits
 *                             settings.oauth_credentials_removed audit.
 *   getConfiguredKeys       — returns only keys from ALLOWED_KEYS list.
 *   saveGeneralSetting      — happy path (plain-text upsert), auth guard,
 *                             role guard, invalid key.
 *   saveTrustedHosts        — happy path, hostname validation, max-count guard,
 *                             dedupe, auth guard, role guard.
 *   saveDefaultPackLanguage — happy path, unsupported language guard, auth guard.
 *   saveSmtpSetting         — happy path; smtp_pass is encrypted; others plain-text;
 *                             invalid key guard; auth guard.
 *   saveNotificationSetting — happy path; webhook URL encrypted; toggle plain-text;
 *                             auth guard; invalid key guard.
 *   removeNotificationSetting — happy path, invalid key guard.
 *   getNotificationSettings — returns defaults when non-admin; reads db when admin.
 *
 * Mocks:
 *   @/db                              — db (direct), withTenant
 *   @/db/schema                       — tenantSettings, users stubs
 *   drizzle-orm                       — eq / and / inArray / notInArray
 *   @/lib/auth/action-context         — getActionContext
 *   @/lib/audit-middleware            — emitAudit (fire-and-forget)
 *   @/lib/crypto                      — encrypt / decrypt (no real entropy)
 *   @/lib/ai/language                 — isSupportedLanguage
 *   @/lib/email/sender                — getSenderForTenant silenced
 *   @/lib/notifications/dispatcher   — testWebhookDelivery silenced
 *   next/cache                        — revalidatePath silenced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── DB mock helpers ────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then    = resolved.then.bind(resolved)
  c.catch   = resolved.catch.bind(resolved)
  c.from    = vi.fn(() => c)
  c.where   = vi.fn(() => c)
  c.limit   = vi.fn(() => Promise.resolve(rows))
  c.orderBy = vi.fn(() => c)
  return c
}

// Per-test state
type SelectFactory = () => ReturnType<typeof makeSelectChain>
let selectFactory: SelectFactory

// Captured mutation calls
const mockInsertValues         = vi.fn()
const mockOnConflictDoUpdate   = vi.fn()
const mockDeleteWhere          = vi.fn()
const mockDbSelectRows         = vi.fn().mockReturnValue([])

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => {
      const rows = mockDbSelectRows()
      return makeSelectChain(rows)
    }),
  },
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => selectFactory()),

        insert: vi.fn(() => ({
          values: (...args: unknown[]) => {
            mockInsertValues(...args)
            return {
              onConflictDoUpdate: (...oArgs: unknown[]) => {
                mockOnConflictDoUpdate(...oArgs)
                return Promise.resolve()
              },
            }
          },
        })),

        delete: vi.fn(() => ({
          where: (...wargs: unknown[]) => {
            mockDeleteWhere(...wargs)
            return Promise.resolve()
          },
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  tenantSettings: {
    tenantId:  'tenant_id',
    key:       'key',
    value:     'value',
    updatedBy: 'updated_by',
    updatedAt: 'updated_at',
  },
  users: {
    id:    'id',
    email: 'email',
    name:  'name',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq:        vi.fn(() => ({ type: 'eq' })),
  and:       vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray:   vi.fn(() => ({ type: 'inArray' })),
  notInArray: vi.fn(() => ({ type: 'notInArray' })),
  or:        vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

const mockEmitAudit = vi.fn()
vi.mock('@/lib/audit-middleware', () => ({
  emitAudit: (...args: unknown[]) => mockEmitAudit(...args),
}))

// encrypt returns a deterministic stub; decrypt reverses it
const mockEncrypt = vi.fn((v: string) => `enc:${v}`)
const mockDecrypt = vi.fn((v: string) => v.replace(/^enc:/, ''))
vi.mock('@/lib/crypto', () => ({
  encrypt: (v: string) => mockEncrypt(v),
  decrypt: (v: string) => mockDecrypt(v),
}))

// isSupportedLanguage — real list: en, pl, de, fr, es, it, pt, nl, cs, sv
vi.mock('@/lib/ai/language', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/language')>()
  return { isSupportedLanguage: actual.isSupportedLanguage }
})

vi.mock('@/lib/email/sender', () => ({
  getSenderForTenant: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  testWebhookDelivery: vi.fn().mockResolvedValue({
    slack: { configured: false, ok: false },
    teams: { configured: false, ok: false },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Helpers ────────────────────────────────────────────────────────────────────

function adminCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'admin' as const }
}

function recruiterCtx() {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: 'recruiter' as const }
}

function makeSettingFormData(key: string, value: string): FormData {
  const fd = new FormData()
  fd.set('key', key)
  fd.set('value', value)
  return fd
}

// ── saveApiKey ─────────────────────────────────────────────────────────────────

describe('saveApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveApiKey } = await import('@/actions/settings')

    const result = await saveApiKey(null, makeSettingFormData('anthropic_api_key', 'sk-ant-test'))

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when user is recruiter (not admin)', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { saveApiKey } = await import('@/actions/settings')

    const result = await saveApiKey(null, makeSettingFormData('anthropic_api_key', 'sk-ant-test'))

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/admin/i)
  })

  it('returns error when key is not in ALLOWED_KEYS', async () => {
    const { saveApiKey } = await import('@/actions/settings')

    const result = await saveApiKey(null, makeSettingFormData('evil_key', 'value'))

    expect(result.success).toBe(false)
  })

  it('returns error when value is empty', async () => {
    const { saveApiKey } = await import('@/actions/settings')

    const result = await saveApiKey(null, makeSettingFormData('anthropic_api_key', ''))

    expect(result.success).toBe(false)
  })

  it('encrypts value before upsert on happy path', async () => {
    const { saveApiKey } = await import('@/actions/settings')

    const result = await saveApiKey(null, makeSettingFormData('anthropic_api_key', 'sk-ant-realkey'))

    expect(result.success).toBe(true)
    expect(mockEncrypt).toHaveBeenCalledWith('sk-ant-realkey')
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toBe('enc:sk-ant-realkey')
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.key).toBe('anthropic_api_key')
    // onConflictDoUpdate called to implement upsert
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
  })

  it('emits settings.oauth_credentials_updated audit for google_oauth_client_id', async () => {
    const { saveApiKey } = await import('@/actions/settings')

    await saveApiKey(null, makeSettingFormData('google_oauth_client_id', 'client-id-value'))

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'settings.oauth_credentials_updated',
        metadata: expect.objectContaining({ provider: 'google', field: 'client_id' }),
      })
    )
  })

  it('emits settings.oauth_credentials_updated audit for microsoft_oauth_client_secret', async () => {
    const { saveApiKey } = await import('@/actions/settings')

    await saveApiKey(null, makeSettingFormData('microsoft_oauth_client_secret', 'secret-val'))

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'settings.oauth_credentials_updated',
        metadata: expect.objectContaining({ provider: 'microsoft', field: 'client_secret' }),
      })
    )
  })

  it('does NOT emit OAuth audit for non-OAuth keys (anthropic_api_key)', async () => {
    const { saveApiKey } = await import('@/actions/settings')

    await saveApiKey(null, makeSettingFormData('anthropic_api_key', 'sk-ant-key'))

    expect(mockEmitAudit).not.toHaveBeenCalled()
  })
})

// ── removeApiKey ───────────────────────────────────────────────────────────────

describe('removeApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { removeApiKey } = await import('@/actions/settings')

    const result = await removeApiKey(null, makeSettingFormData('anthropic_api_key', ''))

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error when user is recruiter', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { removeApiKey } = await import('@/actions/settings')

    const result = await removeApiKey(null, makeSettingFormData('anthropic_api_key', ''))

    expect(result.success).toBe(false)
  })

  it('returns error for unknown key', async () => {
    const { removeApiKey } = await import('@/actions/settings')

    const result = await removeApiKey(null, makeSettingFormData('not_a_key', ''))

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid key/i)
  })

  it('deletes the setting row on happy path', async () => {
    const { removeApiKey } = await import('@/actions/settings')

    const result = await removeApiKey(null, makeSettingFormData('openai_api_key', ''))

    expect(result.success).toBe(true)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('emits settings.oauth_credentials_removed audit for OAuth keys', async () => {
    const { removeApiKey } = await import('@/actions/settings')

    await removeApiKey(null, makeSettingFormData('google_oauth_client_secret', ''))

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'settings.oauth_credentials_removed',
        metadata: expect.objectContaining({ provider: 'google', field: 'client_secret' }),
      })
    )
  })
})

// ── getConfiguredKeys ──────────────────────────────────────────────────────────

describe('getConfiguredKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only ALLOWED_KEYS that are present', async () => {
    selectFactory = () =>
      makeSelectChain([
        { key: 'anthropic_api_key' },
        { key: 'openai_api_key' },
        { key: 'unknown_key' }, // should be filtered out
      ])
    const { getConfiguredKeys } = await import('@/actions/settings')

    const result = await getConfiguredKeys(TENANT_ID)

    expect(result).toContain('anthropic_api_key')
    expect(result).toContain('openai_api_key')
    expect(result).not.toContain('unknown_key')
  })

  it('returns empty array when no keys configured', async () => {
    selectFactory = () => makeSelectChain([])
    const { getConfiguredKeys } = await import('@/actions/settings')

    const result = await getConfiguredKeys(TENANT_ID)

    expect(result).toEqual([])
  })
})

// ── saveGeneralSetting ─────────────────────────────────────────────────────────

describe('saveGeneralSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveGeneralSetting } = await import('@/actions/settings')
    const fd = new FormData()
    fd.set('value', 'claude-sonnet-4-6')

    const result = await saveGeneralSetting('default_ai_model', null, fd)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unauthorized/i)
  })

  it('returns error when user is recruiter', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { saveGeneralSetting } = await import('@/actions/settings')
    const fd = new FormData()
    fd.set('value', 'claude-sonnet-4-6')

    const result = await saveGeneralSetting('default_ai_model', null, fd)

    expect(result.success).toBe(false)
  })

  it('stores plain-text value (not encrypted) on happy path', async () => {
    const { saveGeneralSetting } = await import('@/actions/settings')
    const fd = new FormData()
    fd.set('value', 'claude-sonnet-4-6')

    const result = await saveGeneralSetting('default_ai_model', null, fd)

    expect(result.success).toBe(true)
    expect(mockEncrypt).not.toHaveBeenCalled()
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toBe('claude-sonnet-4-6')
  })
})

// ── saveTrustedHosts ───────────────────────────────────────────────────────────

describe('saveTrustedHosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    // Default: getTrustedHosts reads empty (no existing setting)
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveTrustedHosts } = await import('@/actions/settings')

    const result = await saveTrustedHosts(['example.com'])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error for non-admin role', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { saveTrustedHosts } = await import('@/actions/settings')

    const result = await saveTrustedHosts(['example.com'])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/admin/i)
  })

  it('returns error when a hostname is invalid', async () => {
    const { saveTrustedHosts } = await import('@/actions/settings')

    const result = await saveTrustedHosts(['not a valid hostname!'])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid hostname/i)
  })

  it('returns error when hostname exceeds max length', async () => {
    const { saveTrustedHosts } = await import('@/actions/settings')
    const longHost = 'a'.repeat(254) + '.com'

    const result = await saveTrustedHosts([longHost])

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/too long/i)
  })

  it('returns error when more than 20 hosts are provided', async () => {
    const { saveTrustedHosts } = await import('@/actions/settings')
    const hosts = Array.from({ length: 21 }, (_, i) => `host${i}.example.com`)

    const result = await saveTrustedHosts(hosts)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/20/i)
  })

  it('deduplicates hostnames (case-insensitive)', async () => {
    const { saveTrustedHosts } = await import('@/actions/settings')

    const result = await saveTrustedHosts(['Example.com', 'example.com', 'EXAMPLE.COM'])

    expect(result.success).toBe(true)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    const stored = JSON.parse(insertArg.value as string) as string[]
    expect(stored).toHaveLength(1)
    expect(stored[0]).toBe('example.com')
  })

  it('upserts JSON-serialised host list on happy path', async () => {
    const { saveTrustedHosts } = await import('@/actions/settings')

    const result = await saveTrustedHosts(['app.example.com', 'api.example.com'])

    expect(result.success).toBe(true)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    const stored = JSON.parse(insertArg.value as string) as string[]
    expect(stored).toContain('app.example.com')
    expect(stored).toContain('api.example.com')
  })

  it('emits audit when hosts change', async () => {
    // Simulate previous hosts = ['old.example.com']
    let selectCallCount = 0
    selectFactory = () => {
      selectCallCount++
      if (selectCallCount === 1) {
        return makeSelectChain([{ value: JSON.stringify(['old.example.com']) }])
      }
      return makeSelectChain([])
    }
    const { saveTrustedHosts } = await import('@/actions/settings')

    await saveTrustedHosts(['new.example.com'])

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'settings.trusted_hosts_updated' })
    )
  })
})

// ── saveDefaultPackLanguage ────────────────────────────────────────────────────

describe('saveDefaultPackLanguage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveDefaultPackLanguage } = await import('@/actions/settings')

    const result = await saveDefaultPackLanguage('en')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error for unsupported language code', async () => {
    const { saveDefaultPackLanguage } = await import('@/actions/settings')

    const result = await saveDefaultPackLanguage('klingon')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unsupported/i)
  })

  it('saves supported language code as plain text', async () => {
    const { saveDefaultPackLanguage } = await import('@/actions/settings')

    const result = await saveDefaultPackLanguage('de')

    expect(result.success).toBe(true)
    expect(mockEncrypt).not.toHaveBeenCalled()
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toBe('de')
  })

  it('emits audit when language changes', async () => {
    // First selectFactory call for getDefaultPackLanguage = returns 'en'
    let count = 0
    selectFactory = () => {
      count++
      return count === 1
        ? makeSelectChain([{ value: 'en' }])
        : makeSelectChain([])
    }
    const { saveDefaultPackLanguage } = await import('@/actions/settings')

    await saveDefaultPackLanguage('de')

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'settings.default_pack_language_updated' })
    )
  })

  it('does NOT emit audit when language is unchanged', async () => {
    selectFactory = () => makeSelectChain([{ value: 'en' }])
    const { saveDefaultPackLanguage } = await import('@/actions/settings')

    await saveDefaultPackLanguage('en')

    expect(mockEmitAudit).not.toHaveBeenCalled()
  })
})

// ── saveSmtpSetting ────────────────────────────────────────────────────────────

describe('saveSmtpSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveSmtpSetting } = await import('@/actions/settings')

    const result = await saveSmtpSetting('smtp_host', 'smtp.example.com')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error for unknown SMTP key', async () => {
    const { saveSmtpSetting } = await import('@/actions/settings')

    const result = await saveSmtpSetting('not_smtp_key', 'value')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid/i)
  })

  it('returns error when value is empty', async () => {
    const { saveSmtpSetting } = await import('@/actions/settings')

    const result = await saveSmtpSetting('smtp_host', '')

    expect(result.success).toBe(false)
  })

  it('stores smtp_host as plain text (not encrypted)', async () => {
    const { saveSmtpSetting } = await import('@/actions/settings')

    const result = await saveSmtpSetting('smtp_host', 'smtp.example.com')

    expect(result.success).toBe(true)
    expect(mockEncrypt).not.toHaveBeenCalled()
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toBe('smtp.example.com')
  })

  it('encrypts smtp_pass before storing', async () => {
    const { saveSmtpSetting } = await import('@/actions/settings')

    const result = await saveSmtpSetting('smtp_pass', 'super-secret-pass')

    expect(result.success).toBe(true)
    expect(mockEncrypt).toHaveBeenCalledWith('super-secret-pass')
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toBe('enc:super-secret-pass')
  })

  it('emits settings.smtp_updated audit on save', async () => {
    const { saveSmtpSetting } = await import('@/actions/settings')

    await saveSmtpSetting('smtp_port', '587')

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'settings.smtp_updated',
        metadata: expect.objectContaining({ key: 'smtp_port' }),
      })
    )
  })
})

// ── saveNotificationSetting ────────────────────────────────────────────────────

describe('saveNotificationSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns Unauthorized when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { saveNotificationSetting } = await import('@/actions/settings')

    const result = await saveNotificationSetting('notify_high_score_enabled', 'true')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/unauthorized/i)
  })

  it('returns error for non-admin role', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { saveNotificationSetting } = await import('@/actions/settings')

    const result = await saveNotificationSetting('notify_high_score_enabled', 'true')

    expect(result.success).toBe(false)
  })

  it('returns error for unknown notification key', async () => {
    const { saveNotificationSetting } = await import('@/actions/settings')

    const result = await saveNotificationSetting('invalid_key', 'value')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid/i)
  })

  it('stores toggle key as plain text (not encrypted)', async () => {
    const { saveNotificationSetting } = await import('@/actions/settings')

    const result = await saveNotificationSetting('notify_high_score_enabled', 'true')

    expect(result.success).toBe(true)
    expect(mockEncrypt).not.toHaveBeenCalled()
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toBe('true')
  })

  it('encrypts slack_webhook_url before storing', async () => {
    const { saveNotificationSetting } = await import('@/actions/settings')

    const result = await saveNotificationSetting(
      'slack_webhook_url',
      'https://hooks.slack.com/services/T000/B000/secret'
    )

    expect(result.success).toBe(true)
    expect(mockEncrypt).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/T000/B000/secret'
    )
    const insertArg = mockInsertValues.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.value).toMatch(/^enc:/)
  })

  it('encrypts teams_webhook_url before storing', async () => {
    const { saveNotificationSetting } = await import('@/actions/settings')

    const result = await saveNotificationSetting(
      'teams_webhook_url',
      'https://outlook.office.com/webhook/xxx/IncomingWebhook/yyy'
    )

    expect(result.success).toBe(true)
    expect(mockEncrypt).toHaveBeenCalledTimes(1)
  })

  it('emits settings.notification_updated audit on save', async () => {
    const { saveNotificationSetting } = await import('@/actions/settings')

    await saveNotificationSetting('notify_score_threshold', '90')

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'settings.notification_updated',
        metadata: expect.objectContaining({ key: 'notify_score_threshold' }),
      })
    )
  })
})

// ── removeNotificationSetting ──────────────────────────────────────────────────

describe('removeNotificationSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () => makeSelectChain([])
  })

  it('returns error for unknown key', async () => {
    const { removeNotificationSetting } = await import('@/actions/settings')

    const result = await removeNotificationSetting('bad_key')

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/invalid/i)
  })

  it('deletes the notification setting row on happy path', async () => {
    const { removeNotificationSetting } = await import('@/actions/settings')

    const result = await removeNotificationSetting('slack_webhook_url')

    expect(result.success).toBe(true)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('emits settings.notification_updated audit with removed=true', async () => {
    const { removeNotificationSetting } = await import('@/actions/settings')

    await removeNotificationSetting('teams_webhook_url')

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'settings.notification_updated',
        metadata: expect.objectContaining({ removed: true }),
      })
    )
  })
})

// ── getNotificationSettings ────────────────────────────────────────────────────

describe('getNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns fallback defaults when no action context', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { getNotificationSettings } = await import('@/actions/settings')

    const result = await getNotificationSettings()

    expect(result.slack_webhook_configured).toBe(false)
    expect(result.teams_webhook_configured).toBe(false)
    expect(result.notify_high_score_enabled).toBe(true)
    expect(result.notify_score_threshold).toBe(85)
  })

  it('returns fallback defaults when user is recruiter (non-admin)', async () => {
    mockGetActionContext.mockResolvedValue(recruiterCtx())
    const { getNotificationSettings } = await import('@/actions/settings')

    const result = await getNotificationSettings()

    expect(result.slack_webhook_configured).toBe(false)
  })

  it('returns configured=true for webhooks that exist in DB', async () => {
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () =>
      makeSelectChain([
        { key: 'slack_webhook_url',                value: 'enc:https://hooks.slack.com/...' },
        { key: 'notify_high_score_enabled',         value: 'false' },
        { key: 'notify_score_threshold',            value: '92' },
      ])
    const { getNotificationSettings } = await import('@/actions/settings')

    const result = await getNotificationSettings()

    expect(result.slack_webhook_configured).toBe(true)
    expect(result.teams_webhook_configured).toBe(false)
    expect(result.notify_high_score_enabled).toBe(false)
    expect(result.notify_score_threshold).toBe(92)
  })

  it('uses parseInt default (85) when score threshold is not a valid number', async () => {
    mockGetActionContext.mockResolvedValue(adminCtx())
    selectFactory = () =>
      makeSelectChain([
        { key: 'notify_score_threshold', value: 'not-a-number' },
      ])
    const { getNotificationSettings } = await import('@/actions/settings')

    const result = await getNotificationSettings()

    expect(result.notify_score_threshold).toBe(85)
  })
})
