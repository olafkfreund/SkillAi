import { headers } from 'next/headers'
import { withTenant } from '@/db'
import { auditLogs } from '@/db/schema'

export type AuditAction =
  | 'candidate.created' | 'candidate.archived' | 'candidate.status_changed' | 'candidate.bulk_status_changed'
  | 'candidate.status_confirmed'
  | 'candidate.cv_attached' | 'candidate.cv_downloaded' | 'candidate.cv_replaced'
  | 'candidate.synechron_cv_extracted'
  | 'candidate.synechron_cv_downloaded'
  | 'candidate.enrichment_triggered'
  | 'candidate.enrichment_completed'
  | 'candidate.profile_confirmed'
  | 'candidate.profile_dismissed'
  | 'role.created' | 'role.updated' | 'role.archived'
  | 'score.completed' | 'score.failed' | 'score.removed'
  | 'interview_pack.created' | 'interview_pack.completed' | 'interview_pack.failed'
  | 'interview_pack.deleted' | 'interview_pack.retried'
  | 'interview_pack.generated_in_language'
  | 'interview_slot.created' | 'interview_slot.updated' | 'interview_slot.cancelled'
  | 'note.created' | 'note.deleted'
  | 'user.invited' | 'user.role_changed' | 'user.deactivated'
  | 'user.created'
  | 'user.password_changed'
  | 'user.email_changed'
  | 'settings.trusted_hosts_updated'
  | 'settings.default_pack_language_updated'
  | 'auth.untrusted_host_blocked'
  | 'agency.created' | 'agency.archived'
  | 'agency.logo_uploaded' | 'agency.logo_removed'
  | 'customer.logo_uploaded' | 'customer.logo_removed'

type AuditEntry = {
  action: AuditAction
  entityType: string
  entityId?: string
  entityLabel?: string
  metadata?: Record<string, unknown>
}

/**
 * writeAuditLog — records an audit event for the given tenant.
 *
 * Non-fatal: errors are caught and logged to console so that audit failures
 * never break the main action that called this.
 */
export async function writeAuditLog(
  tenantId: string,
  entry: AuditEntry
): Promise<void> {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id') ?? null
    // x-user-email is not forwarded by the proxy; we store only userId for now
    const userEmail: string | null = null

    await withTenant(tenantId, async (tx) => {
      await tx.insert(auditLogs).values({
        tenantId,
        userId: userId ?? null,
        userEmail,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        entityLabel: entry.entityLabel ?? null,
        metadata: entry.metadata ?? null,
      })
    })
  } catch (err) {
    // Audit logging must never break the main action
    console.error('[audit] Failed to write audit log:', err)
  }
}
