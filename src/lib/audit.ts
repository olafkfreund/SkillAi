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
  | 'interview_slot.rescheduled_external' | 'interview_slot.cancelled_external'
  | 'calendar.sync_completed' | 'calendar.sync_failed'
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
  | 'shortlist.sent'
  | 'candidate.approved_by_manager'
  | 'candidate.rejected_by_manager'
  | 'role.manager_assigned'
  | 'candidate.submitted_to_customer'
  | 'candidate.unsubmitted_from_customer'
  | 'submission.status_changed'
  | 'submission.share_token_generated'
  | 'submission.share_token_revoked'
  | 'submission.customer_updated'
  | 'api_token.created' | 'api_token.revoked' | 'api_token.used'
  | 'api.rate_limit_exceeded'
  | 'mcp.tool_called' | 'mcp.confirmed_action'
  | 'candidate.email_sent'
  | 'email_template.created' | 'email_template.updated' | 'email_template.deleted'
  | 'settings.smtp_updated'
  | 'settings.oauth_credentials_updated'
  | 'settings.oauth_credentials_removed'
  | 'candidate.deleted_gdpr'
  | 'candidate.dsar_exported'
  | 'candidate.compliance_updated'
  | 'candidate.rtw_verified'
  | 'tenant.exported'
  | 'tenant.csv_exported'
  | 'candidate.welcome_letter_generated'
  | 'notification.high_score_sent'
  | 'notification.approval_sent'
  | 'notification.webhook_failed'
  | 'settings.notification_updated'

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
