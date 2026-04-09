import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'
import { decrypt } from '@/lib/crypto'

/**
 * Resolve the Anthropic API key for a tenant.
 * Priority: tenant DB setting → ANTHROPIC_API_KEY env var
 */
export async function resolveAnthropicKey(tenantId: string): Promise<string> {
  const dbKey = await _getTenantSetting(tenantId, 'anthropic_api_key')
  if (dbKey) return dbKey

  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey) return envKey

  throw new Error('No Anthropic API key configured. Set one in Settings or ANTHROPIC_API_KEY env var.')
}

/**
 * Resolve the Google AI API key for a tenant.
 * Priority: tenant DB setting → GOOGLE_AI_API_KEY env var
 */
export async function resolveGoogleKey(tenantId: string): Promise<string> {
  const dbKey = await _getTenantSetting(tenantId, 'google_ai_api_key')
  if (dbKey) return dbKey

  const envKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
  if (envKey) return envKey

  throw new Error('No Google AI API key configured. Set one in Settings or GEMINI_API_KEY env var.')
}

async function _getTenantSetting(tenantId: string, key: string): Promise<string | null> {
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
  } catch {
    return null
  }
}
