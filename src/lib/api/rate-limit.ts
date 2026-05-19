import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { getRateLimitConfig } from './rate-limit-config'
import { cleanupRateLimitWindows } from './janitor'
import { emitAudit } from '@/lib/audit-middleware'

// Run janitor every 200 requests (lazy, non-blocking)
let requestsSinceCleanup = 0
const CLEANUP_INTERVAL = 200

export type RateLimitOk = {
  ok: true
  remaining: { token: number; tenant: number; write: number }
}

export type RateLimitDenied = {
  ok: false
  retryAfter: number
  limit: 'token' | 'tenant' | 'write'
}

export type RateLimitResult = RateLimitOk | RateLimitDenied

/**
 * Truncates a Date to the start of its current UTC minute.
 */
function minuteStart(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000)
}

/**
 * Seconds until the end of the current minute window.
 */
function secondsUntilNextWindow(now: Date): number {
  const ms = 60_000 - (now.getTime() % 60_000)
  return Math.ceil(ms / 1000)
}

/**
 * incrementBucket — atomically increments (or inserts) a rate-limit bucket row
 * for the given window_start and returns the new request_count.
 *
 * Uses a plain INSERT … ON CONFLICT … DO UPDATE so it works inside any
 * postgres.js query context without requiring the Drizzle ORM table definition.
 */
async function incrementBucket(bucketKey: string, tenantId: string, windowStart: Date): Promise<number> {
  const rows = await db.execute<{ request_count: number }>(sql`
    INSERT INTO api_rate_limits (tenant_id, bucket_key, window_start, request_count)
    VALUES (${tenantId}::uuid, ${bucketKey}, ${windowStart.toISOString()}::timestamp, 1)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1
    RETURNING request_count
  `)
  return rows[0]?.request_count ?? 1
}

/**
 * readBucket — reads the current request_count for a bucket without incrementing.
 */
async function readBucket(bucketKey: string, windowStart: Date): Promise<number> {
  const rows = await db.execute<{ request_count: number }>(sql`
    SELECT request_count
    FROM   api_rate_limits
    WHERE  bucket_key   = ${bucketKey}
      AND  window_start = ${windowStart.toISOString()}::timestamp
  `)
  return rows[0]?.request_count ?? 0
}

/**
 * slidingCount — returns the effective sliding-window count for the current
 * minute using the Cloudflare-style formula:
 *
 *   effective = prevCount * (1 - elapsed/60) + currentCount
 *
 * where elapsed is the number of seconds already elapsed in the current window.
 *
 * This weights the previous window's count proportionally to how much of the
 * current window has already passed, so at t=0s it fully includes prev, and at
 * t=60s (window boundary) prev contributes 0.
 */
async function slidingCount(bucketKey: string, now: Date, currentWindowStart: Date): Promise<number> {
  const prevWindowStart = new Date(currentWindowStart.getTime() - 60_000)

  const [prevCount, currentCount] = await Promise.all([
    readBucket(bucketKey, prevWindowStart),
    readBucket(bucketKey, currentWindowStart),
  ])

  // Fraction of the current window already elapsed (0..1)
  const elapsedMs = now.getTime() - currentWindowStart.getTime()
  const elapsedFraction = elapsedMs / 60_000

  // prev window contributes (1 - elapsedFraction) of its count
  return Math.ceil(prevCount * (1 - elapsedFraction)) + currentCount
}

/**
 * checkRateLimit — performs sliding-window rate limiting for a single API call.
 *
 * Enforces three independent limits:
 *   - per API token (token bucket): `mcp.rate_limit.token_per_min`
 *   - per tenant (all tokens combined): `mcp.rate_limit.tenant_per_min`
 *   - per write operation (when isWrite=true): `mcp.rate_limit.write_per_min`
 *
 * Each limit is checked BEFORE incrementing so the request that triggers the
 * limit gets a clean rejection rather than going over by one.
 *
 * Buckets are keyed as:
 *   token:<tokenId>:<windowStart ISO minute>
 *   tenant:<tenantId>:<windowStart ISO minute>
 *   write:<tenantId>:<windowStart ISO minute>
 */
export async function checkRateLimit(
  tenantId: string,
  tokenId: string,
  isWrite: boolean
): Promise<RateLimitResult> {
  // Lazy janitor
  requestsSinceCleanup++
  if (requestsSinceCleanup >= CLEANUP_INTERVAL) {
    requestsSinceCleanup = 0
    cleanupRateLimitWindows().catch(() => {})
  }

  const now = new Date()
  const currentWindowStart = minuteStart(now)
  const retryAfter = secondsUntilNextWindow(now)

  const config = await getRateLimitConfig(tenantId)

  const tokenKey = `token:${tokenId}`
  const tenantKey = `tenant:${tenantId}`
  const writeKey = `write:${tenantId}`

  // Check all three limits using sliding counts before incrementing
  const [tokenSliding, tenantSliding, writeSliding] = await Promise.all([
    slidingCount(tokenKey, now, currentWindowStart),
    slidingCount(tenantKey, now, currentWindowStart),
    isWrite ? slidingCount(writeKey, now, currentWindowStart) : Promise.resolve(0),
  ])

  if (tokenSliding >= config.tokenPerMin) {
    emitAudit(tenantId, {
      action: 'api.rate_limit_exceeded',
      entityType: 'api_token',
      entityId: tokenId,
      metadata: { limit: 'token', count: tokenSliding, limitValue: config.tokenPerMin },
    })
    return { ok: false, retryAfter, limit: 'token' }
  }

  if (tenantSliding >= config.tenantPerMin) {
    emitAudit(tenantId, {
      action: 'api.rate_limit_exceeded',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { limit: 'tenant', count: tenantSliding, limitValue: config.tenantPerMin },
    })
    return { ok: false, retryAfter, limit: 'tenant' }
  }

  if (isWrite && writeSliding >= config.writePerMin) {
    emitAudit(tenantId, {
      action: 'api.rate_limit_exceeded',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { limit: 'write', count: writeSliding, limitValue: config.writePerMin },
    })
    return { ok: false, retryAfter, limit: 'write' }
  }

  // Atomically increment all relevant buckets
  const increments: Promise<number>[] = [
    incrementBucket(tokenKey, tenantId, currentWindowStart),
    incrementBucket(tenantKey, tenantId, currentWindowStart),
  ]
  if (isWrite) {
    increments.push(incrementBucket(writeKey, tenantId, currentWindowStart))
  }

  const [newTokenCount, newTenantCount, newWriteCount = 0] = await Promise.all(increments)

  return {
    ok: true,
    remaining: {
      token: Math.max(0, config.tokenPerMin - newTokenCount),
      tenant: Math.max(0, config.tenantPerMin - newTenantCount),
      write: isWrite ? Math.max(0, config.writePerMin - newWriteCount) : config.writePerMin,
    },
  }
}
