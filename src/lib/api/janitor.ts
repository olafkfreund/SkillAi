import { db } from '@/db'
import { sql } from 'drizzle-orm'

/**
 * cleanupRateLimitWindows — deletes rate-limit rows older than 1 hour.
 *
 * Called lazily every Nth request from checkRateLimit — not on a cron.
 * Safe to call concurrently; the DELETE is idempotent.
 */
export async function cleanupRateLimitWindows(): Promise<void> {
  await db.execute(sql`
    DELETE FROM api_rate_limits
    WHERE window_start < now() - INTERVAL '1 hour'
  `)
}
