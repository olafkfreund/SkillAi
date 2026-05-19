import { writeAuditLog, type AuditAction } from '@/lib/audit'

/**
 * AuditEntry — payload accepted by both `writeAuditLog` and `emitAudit`.
 *
 * Mirrors the (unexported) internal type in `@/lib/audit`. Kept structurally
 * identical so that callers can interchange the two helpers.
 */
export type AuditEntry = {
  action: AuditAction
  entityType: string
  entityId?: string
  entityLabel?: string
  metadata?: Record<string, unknown>
}

/**
 * emitAudit — fire-and-forget audit emission.
 *
 * Semantically equivalent to:
 *
 *     void writeAuditLog(tenantId, entry).catch(() => {})
 *
 * which is the dominant audit-call shape across the codebase. Wrapping that
 * pattern in a single helper:
 *
 *   1. Communicates intent — "emit this audit row, don't block the caller,
 *      swallow any audit-side error". Reads better than the bare `.catch(() => {})`
 *      idiom which can look like a missed promise.
 *   2. Preserves test compatibility — `emitAudit` delegates to `writeAuditLog`,
 *      so every `vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))`
 *      spy continues to fire unchanged.
 *   3. Keeps `writeAuditLog`'s contract intact — errors are still caught and
 *      console-logged inside `writeAuditLog`. The outer `.catch(() => {})`
 *      here is a belt-and-braces guard in case `writeAuditLog`'s wrapper ever
 *      changes to allow throws.
 *
 * When to use:
 *   - You don't need to await the audit insert before returning to the caller
 *     (most common case — audit is a side-effect for the trail, not a value
 *     the response depends on).
 *   - You want any audit-side failure swallowed silently. `writeAuditLog`
 *     already console.errors on failure, so callers rarely need their own
 *     catch handler.
 *
 * When NOT to use:
 *   - You want to await the audit insert before responding (e.g., GDPR
 *     erasure, where the audit row is part of the regulatory completion
 *     contract). Keep `await writeAuditLog(...)` for those.
 *   - You want a custom log message on audit failure (e.g.
 *     `console.error('[cv/GET] Audit log failed:', err)`). Keep the raw
 *     `try { await writeAuditLog(...) } catch (err) { console.error(...) }`
 *     pattern.
 *   - You're emitting multiple audit rows in a loop or `Promise.allSettled`
 *     and want shared post-loop accounting. Stay on raw `writeAuditLog`.
 *
 * Example:
 *
 *     // BEFORE:
 *     writeAuditLog(tenantId, {
 *       action: 'settings.smtp_updated',
 *       entityType: 'settings',
 *       metadata: { key },
 *     }).catch(() => {})
 *
 *     // AFTER:
 *     emitAudit(tenantId, {
 *       action: 'settings.smtp_updated',
 *       entityType: 'settings',
 *       metadata: { key },
 *     })
 */
export function emitAudit(tenantId: string, entry: AuditEntry): void {
  // Defensive `.catch` — `writeAuditLog` already swallows its own errors, but
  // we keep this so a future change to writeAuditLog's contract doesn't bubble
  // up as an unhandled rejection at every call site.
  void writeAuditLog(tenantId, entry).catch(() => {
    /* audit is fire-and-forget; failures are logged inside writeAuditLog */
  })
}
