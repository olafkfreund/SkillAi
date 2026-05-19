import { verify } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { apiTokens } from '@/db/schema'
import { emitAudit } from '@/lib/audit-middleware'

export type ValidatedToken = {
  tenantId: string
  userId: string
  scopes: string[]
  tokenId: string
}

/**
 * validateApiToken — verifies a raw API token and returns its associated
 * tenant/user/scope context, or null on any failure.
 *
 * Flow:
 *   1. Extract prefix (first 12 chars) from rawToken
 *   2. Lookup token row by prefix (no tenant context needed — prefix is globally unique)
 *   3. Argon2-verify rawToken against stored hash
 *   4. Check expiry and revocation
 *   5. Fire-and-forget: update last_used_at + audit log (sampled 1-in-10)
 *
 * Returns null on: invalid format, unknown prefix, wrong secret, expired, revoked.
 */
export async function validateApiToken(rawToken: string): Promise<ValidatedToken | null> {
  try {
    // Basic format guard: skl_dev_* or skl_prod_*
    if (!rawToken.startsWith('skl_')) return null

    const prefix = rawToken.slice(0, 12)
    if (prefix.length < 8) return null

    // Prefix lookup is outside withTenant — prefix is globally unique across tenants
    // and we need to discover the tenantId before we can set the RLS context.
    const rows = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.prefix, prefix))
      .limit(1)

    const token = rows[0]
    if (!token) return null

    // Argon2 verification — timing-safe
    const valid = await verify(token.hash, rawToken)
    if (!valid) return null

    // Expiry check
    if (token.expiresAt && token.expiresAt < new Date()) return null

    // Revocation check
    if (token.revokedAt) return null

    const result: ValidatedToken = {
      tenantId: token.tenantId,
      userId: token.userId,
      scopes: token.scopes ?? [],
      tokenId: token.id,
    }

    // Fire-and-forget: update last_used_at
    void updateLastUsed(token.id, token.tenantId)

    // Sampled audit log: every 10th call to avoid log flooding
    if (Math.random() < 0.1) {
      emitAudit(token.tenantId, {
        action: 'api_token.used',
        entityType: 'api_token',
        entityId: token.id,
        entityLabel: token.name,
        metadata: { tokenId: token.id, prefix },
      })
    }

    return result
  } catch (err) {
    // Treat any unexpected error as invalid — never expose internals
    console.error('[validateApiToken] Unexpected error:', err)
    return null
  }
}

async function updateLastUsed(tokenId: string, tenantId: string): Promise<void> {
  try {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, tokenId))
    })
  } catch (err) {
    // Non-fatal — last_used_at is best-effort
    console.error('[validateApiToken] Failed to update last_used_at:', err)
  }
}
