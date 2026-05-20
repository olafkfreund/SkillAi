/**
 * GET /api/export/audit
 *
 * Admin-only CSV export of audit log rows, scoped to the authenticated user's
 * tenant.  Supports the same filter params as the audit log page so the
 * download always mirrors what the admin currently sees.
 *
 * Query params (all optional):
 *   user        UUID of a specific user to filter on
 *   action      Action-class prefix, e.g. "user.*" or "candidate.*"
 *   from        ISO date string — start of range (inclusive, UTC midnight)
 *   to          ISO date string — end of range (inclusive, UTC end-of-day)
 *
 * Response columns: created_at, actor_email, action, entity_type, entity_id,
 *   entity_label, metadata_json
 *
 * Auth:  session required + admin role
 * Audit: fires audit.exported_csv with { filters, rowCount }
 */

import { auth } from '@/lib/auth'
import { emitAudit } from '@/lib/audit-middleware'
import { withTenant } from '@/db'
import { auditLogs } from '@/db/schema'
import { and, eq, gte, lte, like, desc, type SQL } from 'drizzle-orm'
import { toCsv } from '@/lib/reports/to-csv'

// ── Response helpers ───────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function utcDateString(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ── CSV column spec ────────────────────────────────────────────────────────────

const AUDIT_CSV_HEADERS = [
  { key: 'created_at',    label: 'created_at'    },
  { key: 'actor_email',   label: 'actor_email'   },
  { key: 'action',        label: 'action'        },
  { key: 'entity_type',   label: 'entity_type'   },
  { key: 'entity_id',     label: 'entity_id'     },
  { key: 'entity_label',  label: 'entity_label'  },
  { key: 'metadata_json', label: 'metadata_json' },
]

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  // 1. Auth — require a session with a tenantId
  const session = await auth()
  if (!session?.user?.tenantId) return json({ error: 'Unauthorized' }, 401)

  // 2. Admin gate
  if (session.user.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const tenantId = session.user.tenantId

  // 3. Parse filter params
  const url = new URL(req.url)
  const userParam   = url.searchParams.get('user')   ?? undefined
  const actionParam = url.searchParams.get('action') ?? undefined
  const fromParam   = url.searchParams.get('from')   ?? undefined
  const toParam     = url.searchParams.get('to')     ?? undefined

  // 4. Build where conditions
  const conditions: SQL[] = []

  if (userParam) {
    conditions.push(eq(auditLogs.userId, userParam))
  }

  if (actionParam) {
    // e.g. "user.*" → LIKE 'user.%'
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

  // 5. Query DB
  const rows = await withTenant(tenantId, async (tx) => {
    const q = tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt))
    return conditions.length > 0 ? q.where(and(...conditions)) : q
  })

  // 6. Map rows to CSV-ready flat records
  const csvRows = rows.map((row) => ({
    created_at:    row.createdAt,
    actor_email:   row.userEmail ?? row.userId ?? '',
    action:        row.action,
    entity_type:   row.entityType,
    entity_id:     row.entityId ?? '',
    entity_label:  row.entityLabel ?? '',
    metadata_json: row.metadata !== null && row.metadata !== undefined
      ? JSON.stringify(row.metadata)
      : '',
  }))

  const csv = toCsv(csvRows, AUDIT_CSV_HEADERS)

  // 7. Fire-and-forget audit row (new action)
  emitAudit(tenantId, {
    action: 'audit.exported_csv',
    entityType: 'audit',
    entityId: tenantId,
    metadata: {
      filters: { user: userParam, action: actionParam, from: fromParam, to: toParam },
      rowCount: rows.length,
    },
  })

  // 8. Filename: skillai-audit-{tenantId}-{YYYY-MM-DD}.csv
  const filename = `skillai-audit-${tenantId}-${utcDateString()}.csv`

  return csvResponse(csv, filename)
}
