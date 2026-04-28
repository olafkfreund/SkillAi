import { db } from '@/db'
import { sql } from 'drizzle-orm'

export interface RateLimitConfig {
  tokenPerMin: number
  tenantPerMin: number
  writePerMin: number
}

const DEFAULTS: RateLimitConfig = {
  tokenPerMin: 60,
  tenantPerMin: 600,
  writePerMin: 30,
}

interface CacheEntry {
  config: RateLimitConfig
  expiresAt: number
}

// In-memory cache: tenantId -> { config, expiresAt }
const configCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

/**
 * getRateLimitConfig — reads rate limit config from tenant_settings with a
 * 60-second in-process cache so we don't hit the DB on every request.
 *
 * Keys read (stored in tenant_settings):
 *   mcp.rate_limit.token_per_min  (default 60)
 *   mcp.rate_limit.tenant_per_min (default 600)
 *   mcp.rate_limit.write_per_min  (default 30)
 */
export async function getRateLimitConfig(tenantId: string): Promise<RateLimitConfig> {
  const now = Date.now()
  const cached = configCache.get(tenantId)
  if (cached && cached.expiresAt > now) {
    return cached.config
  }

  // Read directly from tenant_settings — no RLS needed for config keys,
  // and we filter by tenantId in the WHERE clause.
  const rows = await db.execute<{ key: string; value: string }>(sql`
    SELECT key, value
    FROM   tenant_settings
    WHERE  tenant_id = ${tenantId}::uuid
      AND  key IN (
        'mcp.rate_limit.token_per_min',
        'mcp.rate_limit.tenant_per_min',
        'mcp.rate_limit.write_per_min'
      )
  `)

  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.key, row.value)
  }

  const parse = (key: string, fallback: number): number => {
    const raw = map.get(key)
    if (!raw) return fallback
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }

  const config: RateLimitConfig = {
    tokenPerMin: parse('mcp.rate_limit.token_per_min', DEFAULTS.tokenPerMin),
    tenantPerMin: parse('mcp.rate_limit.tenant_per_min', DEFAULTS.tenantPerMin),
    writePerMin: parse('mcp.rate_limit.write_per_min', DEFAULTS.writePerMin),
  }

  configCache.set(tenantId, { config, expiresAt: now + CACHE_TTL_MS })
  return config
}

/** Exposed for testing — evicts the cached config for a tenant. */
export function evictRateLimitConfigCache(tenantId: string): void {
  configCache.delete(tenantId)
}
