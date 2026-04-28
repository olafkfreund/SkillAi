import { ShieldCheckIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { auditLogs } from '@/db/schema'
import { desc } from 'drizzle-orm'
import type { AuditLog } from '@/db/schema/audit-logs'

export const metadata = { title: 'Audit Log — SkillAI' }

// Color badge per action prefix
function actionBadgeClass(action: string): string {
  if (action.endsWith('.created') || action.endsWith('.invited')) {
    return 'bg-blue-950 text-blue-400 border border-blue-700'
  }
  if (
    action.endsWith('.archived') ||
    action.endsWith('.deleted') ||
    action.endsWith('.deactivated') ||
    action.endsWith('.removed')
  ) {
    return 'bg-red-950 text-red-400 border border-red-700'
  }
  if (action.endsWith('.updated') || action.endsWith('.changed') || action.endsWith('.retried')) {
    return 'bg-amber-950 text-amber-400 border border-amber-700'
  }
  return 'bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] border border-[var(--color-border)]'
}

function formatMetadata(metadata: AuditLog['metadata']): string {
  if (!metadata || typeof metadata !== 'object') return ''
  return Object.entries(metadata as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}

export default async function AuditLogPage() {
  const session = await auth()
  const isAdmin = session?.user.role === 'admin'

  if (!isAdmin) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-xl bg-amber-950 border border-amber-800 px-5 py-4">
          <p className="text-sm text-amber-400 font-medium">Admin access required</p>
          <p className="text-xs text-amber-500 mt-0.5">
            Only admins can view the audit log.
          </p>
        </div>
      </div>
    )
  }

  const tenantId = session!.user.tenantId

  const logs = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100)
  )

  return (
    <div className="max-w-6xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-[var(--color-bg-elevated)] rounded-lg">
          <ShieldCheckIcon className="h-5 w-5 text-[var(--color-fg-muted)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-fg)]">Audit Log</h1>
          <p className="text-sm text-[var(--color-fg-subtle)]">Last 100 events for your tenant</p>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-5 py-4">
          <p className="text-sm text-[var(--color-fg-subtle)]">No audit events recorded yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide whitespace-nowrap">
                  Date / Time
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                  User
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                  Action
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                  Entity
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-bg-elevated)]">
              {logs.map((log) => (
                <tr key={log.id} className="bg-[var(--color-bg-app)] hover:bg-[var(--color-bg-input)] transition-colors">
                  <td className="px-4 py-3 text-[var(--color-fg-subtle)] text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)] text-xs">
                    {log.userEmail ?? log.userId?.slice(0, 8) ?? (
                      <span className="italic text-[var(--color-fg-subtle)]">system</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${actionBadgeClass(log.action)}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)] text-xs">
                    <span className="text-[var(--color-fg-subtle)]">{log.entityType}</span>
                    {log.entityLabel && (
                      <span className="ml-1 text-[var(--color-fg)]">{log.entityLabel}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-subtle)] text-xs">
                    {formatMetadata(log.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
