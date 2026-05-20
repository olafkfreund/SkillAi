import { ShieldCheckIcon, DownloadIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { auditLogs, users } from '@/db/schema'
import { and, eq, gte, lte, like, desc, type SQL } from 'drizzle-orm'
import type { AuditLog } from '@/db/schema/audit-logs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit Log — SkillAI' }

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Well-known action-class prefixes exposed in the filter UI.
 * Each maps to a LIKE pattern: "candidate.*" → "candidate.%"
 */
const ACTION_CLASSES = [
  { value: 'user.*',               label: 'User' },
  { value: 'candidate.*',          label: 'Candidate' },
  { value: 'settings.*',           label: 'Settings' },
  { value: 'score.*',              label: 'Score' },
  { value: 'interview_pack.*',     label: 'Interview Pack' },
  { value: 'transcript_analysis.*', label: 'Transcript Analysis' },
  { value: 'tenant.*',             label: 'Tenant' },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Color badge per action prefix — matches original logic */
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

/** Build a query-string from non-empty filter values */
function buildFilterQs(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v)
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// ── Default date helpers ──────────────────────────────────────────────────────

function defaultFromDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Page component ────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    user?: string
    action?: string
    from?: string
    to?: string
  }>
}

export default async function AuditLogPage({ searchParams }: PageProps) {
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

  // ── Resolve filter params ─────────────────────────────────────────────────

  const params = await searchParams
  const userParam   = params.user   ?? undefined
  const actionParam = params.action ?? undefined
  // Default: last 7 days
  const fromParam   = params.from   ?? defaultFromDate()
  const toParam     = params.to     ?? todayDate()

  // ── Fetch users list for the dropdown ─────────────────────────────────────

  const tenantUsers = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(users.email)
  )

  // ── Build DB filter conditions ─────────────────────────────────────────────

  const conditions: SQL[] = []

  if (userParam) {
    conditions.push(eq(auditLogs.userId, userParam))
  }

  if (actionParam) {
    const likePattern = actionParam.endsWith('*')
      ? actionParam.slice(0, -1) + '%'
      : actionParam
    conditions.push(like(auditLogs.action, likePattern))
  }

  if (fromParam) {
    const fromDate = new Date(fromParam)
    if (!isNaN(fromDate.getTime())) {
      fromDate.setUTCHours(0, 0, 0, 0)
      conditions.push(gte(auditLogs.createdAt, fromDate))
    }
  }

  if (toParam) {
    const toDate = new Date(toParam)
    if (!isNaN(toDate.getTime())) {
      toDate.setUTCHours(23, 59, 59, 999)
      conditions.push(lte(auditLogs.createdAt, toDate))
    }
  }

  // ── Query audit logs ───────────────────────────────────────────────────────

  const logs = await withTenant(tenantId, async (tx) => {
    const q = tx
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(500)
    return conditions.length > 0 ? q.where(and(...conditions)) : q
  })

  // ── Build CSV export URL ───────────────────────────────────────────────────

  const csvQs = buildFilterQs({ user: userParam, action: actionParam, from: fromParam, to: toParam })
  const csvHref = `/api/export/audit${csvQs}`

  return (
    <div className="max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--color-bg-elevated)] rounded-lg">
            <ShieldCheckIcon className="h-5 w-5 text-[var(--color-fg-muted)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-fg)]">Audit Log</h1>
            <p className="text-sm text-[var(--color-fg-subtle)]">
              {logs.length} event{logs.length !== 1 ? 's' : ''} matching current filters
            </p>
          </div>
        </div>

        {/* CSV export button */}
        <a
          href={csvHref}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                     bg-[var(--color-bg-elevated)] border border-[var(--color-border)]
                     text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     hover:bg-[var(--color-bg-input)] transition-colors"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          Export CSV
        </a>
      </div>

      {/* Filter bar — submits via GET to update URL search params */}
      <form
        method="GET"
        action="/dashboard/audit"
        className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-xl
                   bg-[var(--color-bg-elevated)] border border-[var(--color-border)]"
      >
        {/* User dropdown */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label
            htmlFor="audit-filter-user"
            className="text-xs font-medium text-[var(--color-fg-muted)]"
          >
            User
          </label>
          <select
            id="audit-filter-user"
            name="user"
            defaultValue={userParam ?? ''}
            className="px-2 py-1.5 rounded-md text-xs
                       bg-[var(--color-bg-input)] border border-[var(--color-border)]
                       text-[var(--color-fg)] focus:outline-none focus:ring-1
                       focus:ring-blue-600"
          >
            <option value="">All users</option>
            {tenantUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </div>

        {/* Action class dropdown */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label
            htmlFor="audit-filter-action"
            className="text-xs font-medium text-[var(--color-fg-muted)]"
          >
            Action class
          </label>
          <select
            id="audit-filter-action"
            name="action"
            defaultValue={actionParam ?? ''}
            className="px-2 py-1.5 rounded-md text-xs
                       bg-[var(--color-bg-input)] border border-[var(--color-border)]
                       text-[var(--color-fg)] focus:outline-none focus:ring-1
                       focus:ring-blue-600"
          >
            <option value="">All actions</option>
            {ACTION_CLASSES.map((cls) => (
              <option key={cls.value} value={cls.value}>
                {cls.label}
              </option>
            ))}
          </select>
        </div>

        {/* From date */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-filter-from"
            className="text-xs font-medium text-[var(--color-fg-muted)]"
          >
            From
          </label>
          <input
            id="audit-filter-from"
            type="date"
            name="from"
            defaultValue={fromParam}
            className="px-2 py-1.5 rounded-md text-xs
                       bg-[var(--color-bg-input)] border border-[var(--color-border)]
                       text-[var(--color-fg)] focus:outline-none focus:ring-1
                       focus:ring-blue-600"
          />
        </div>

        {/* To date */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-filter-to"
            className="text-xs font-medium text-[var(--color-fg-muted)]"
          >
            To
          </label>
          <input
            id="audit-filter-to"
            type="date"
            name="to"
            defaultValue={toParam}
            className="px-2 py-1.5 rounded-md text-xs
                       bg-[var(--color-bg-input)] border border-[var(--color-border)]
                       text-[var(--color-fg)] focus:outline-none focus:ring-1
                       focus:ring-blue-600"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md text-xs font-medium
                     bg-blue-600 text-white hover:bg-blue-500
                     focus:outline-none focus:ring-1 focus:ring-blue-400
                     transition-colors"
        >
          Apply
        </button>

        {/* Clear link — strips all params */}
        <a
          href="/dashboard/audit"
          className="px-3 py-1.5 rounded-md text-xs font-medium
                     text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     transition-colors"
        >
          Clear
        </a>
      </form>

      {/* Results table */}
      {logs.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-5 py-4">
          <p className="text-sm text-[var(--color-fg-subtle)]">
            No audit events match the current filters.
          </p>
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
                <tr
                  key={log.id}
                  className="bg-[var(--color-bg-app)] hover:bg-[var(--color-bg-input)] transition-colors"
                >
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
