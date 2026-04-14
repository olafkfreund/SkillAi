import { headers } from 'next/headers'
import { withTenant } from '@/db'
import { auditLogs } from '@/db/schema'

export type AuditAction =
  | 'candidate.created' | 'candidate.archived' | 'candidate.status_changed' | 'candidate.bulk_status_changed'
  | 'candidate.status_confirmed'
  | 'role.created' | 'role.updated' | 'role.archived'
  | 'score.completed' | 'score.failed' | 'score.removed'
  | 'interview_pack.created' | 'interview_pack.completed' | 'interview_pack.failed'
  | 'interview_pack.deleted' | 'interview_pack.retried'
  | 'interview_slot.created' | 'interview_slot.updated' | 'interview_slot.cancelled'
  | 'note.created' | 'note.deleted'
  | 'user.invited' | 'user.role_changed' | 'user.deactivated'
  | 'agency.created' | 'agency.archived'

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
