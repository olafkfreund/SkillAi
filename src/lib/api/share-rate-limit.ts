/**
 * share-rate-limit.ts — in-memory token-bucket for the public customer share endpoint.
 *
 * WHY NOT src/lib/api/rate-limit.ts:
 *   The existing rate-limiter is DB-backed, keyed on an authenticated API token ID,
 *   and designed for the authenticated REST/MCP surface. The share endpoint has no
 *   auth identity — its only identity signal is the share token + caller IP. A DB
 *   round-trip per public request would be expensive (and would bypass RLS for no
 *   reason). An in-process map is sub-millisecond, sufficient for a single-instance
 *   deployment, and matches the plan's stated v1 constraints.
 *   If the app scales horizontally, replace this with a Redis INCR + TTL call using
 *   the same interface.
 */

const MAX_UPDATES = 5
const WINDOW_MS = 60 * 60 * 1_000 // 1 rolling hour

type Bucket = {
  count: number
  resetAt: number // epoch ms when this bucket expires
}

// Module-level map; entries are lazily expired on read.
const buckets = new Map<string, Bucket>()

/**
 * checkShareUpdateRateLimit — returns null if the request is within the limit,
 * or an object with retryAfterSeconds if the caller should back off.
 *
 * Limit: 5 updates per (token, ipAddress) per rolling hour.
 * Lazy expiry: stale entries are removed when they are read, not on a timer.
 */
export function checkShareUpdateRateLimit(
  token: string,
  ipAddress: string
): { retryAfterSeconds: number } | null {
  const key = `${token}:${ipAddress}`
  const now = Date.now()

  const existing = buckets.get(key)

  // Expire stale bucket and treat as fresh
  if (existing && existing.resetAt <= now) {
    buckets.delete(key)
  }

  const bucket = buckets.get(key)

  if (!bucket) {
    // First request in this window — create bucket and allow
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return null
  }

  if (bucket.count >= MAX_UPDATES) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1_000)
    return { retryAfterSeconds }
  }

  // Within limit — increment and allow
  bucket.count++
  return null
}
