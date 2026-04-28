import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'
import { decrypt } from '@/lib/crypto'

type Provider = 'google' | 'microsoft'

export type GoogleCreds = {
  clientId: string
  clientSecret: string
  source: 'tenant' | 'env'
}

export type MicrosoftCreds = GoogleCreds & {
  microsoftTenantId: string
}

// ---------------------------------------------------------------------------
// Internal helper — reads a single key from tenant_settings and decrypts it.
// Returns null if the row is absent or decryption fails.
// ---------------------------------------------------------------------------
async function _getTenantOAuthSetting(tenantId: string, key: string): Promise<string | null> {
  try {
    const [row] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ value: tenantSettings.value })
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)))
        .limit(1)
    )
    if (!row) return null
    return decrypt(row.value)
  } catch (err) {
    // Decryption failure or DB error — log and fall through to env
    console.error('[calendar/credentials] Failed to read tenant OAuth setting:', key, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Overloaded signatures
// ---------------------------------------------------------------------------

export async function getOAuthCredentials(
  tenantId: string,
  provider: 'google',
): Promise<GoogleCreds | null>

export async function getOAuthCredentials(
  tenantId: string,
  provider: 'microsoft',
): Promise<MicrosoftCreds | null>

export async function getOAuthCredentials(
  tenantId: string,
  provider: Provider,
): Promise<GoogleCreds | MicrosoftCreds | null>

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
export async function getOAuthCredentials(
  tenantId: string,
  provider: Provider,
): Promise<GoogleCreds | MicrosoftCreds | null> {
  if (provider === 'google') {
    // 1. Try tenant_settings
    const tenantClientId = await _getTenantOAuthSetting(tenantId, 'google_oauth_client_id')
    const tenantClientSecret = await _getTenantOAuthSetting(tenantId, 'google_oauth_client_secret')

    if (tenantClientId && tenantClientSecret) {
      return { clientId: tenantClientId, clientSecret: tenantClientSecret, source: 'tenant' }
    }

    // 2. Fall back to environment variables
    const envClientId = process.env.GOOGLE_CLIENT_ID
    const envClientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (envClientId && envClientSecret) {
      return { clientId: envClientId, clientSecret: envClientSecret, source: 'env' }
    }

    return null
  }

  // provider === 'microsoft'

  // 1. Try tenant_settings for client_id + client_secret
  const tenantClientId = await _getTenantOAuthSetting(tenantId, 'microsoft_oauth_client_id')
  const tenantClientSecret = await _getTenantOAuthSetting(tenantId, 'microsoft_oauth_client_secret')

  let clientId: string | null = null
  let clientSecret: string | null = null
  let source: 'tenant' | 'env'

  if (tenantClientId && tenantClientSecret) {
    clientId = tenantClientId
    clientSecret = tenantClientSecret
    source = 'tenant'
  } else {
    // 2. Fall back to env for client_id + client_secret
    const envClientId = process.env.MICROSOFT_CLIENT_ID
    const envClientSecret = process.env.MICROSOFT_CLIENT_SECRET

    if (!envClientId || !envClientSecret) {
      return null
    }

    clientId = envClientId
    clientSecret = envClientSecret
    source = 'env'
  }

  // Resolve microsoftTenantId: tenant_settings → env → 'common'
  const tenantMsTenantId = await _getTenantOAuthSetting(tenantId, 'microsoft_oauth_tenant_id')
  const microsoftTenantId =
    tenantMsTenantId ??
    process.env.MICROSOFT_TENANT_ID ??
    'common'

  return { clientId, clientSecret, microsoftTenantId, source }
}
