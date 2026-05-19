/**
 * GET /api/export/tenant/csv/[entity]
 *
 * Admin-only per-entity CSV export endpoint. Returns a text/csv attachment
 * scoped to the authenticated user's tenant.
 *
 * Allowed entities: candidates | roles | scores | agencies
 *
 * Auth: session required + admin role
 * Audit: fires tenant.csv_exported with { entity, rowCount } metadata
 */

import { auth } from '@/lib/auth'
import { emitAudit } from '@/lib/audit-middleware'
import {
  buildCandidatesCsv,
  buildRolesCsv,
  buildScoresCsv,
  buildAgenciesCsv,
} from '@/lib/export/csv-builders'

// ── Allow-list ────────────────────────────────────────────────────────────────

const ALLOWED = ['candidates', 'roles', 'scores', 'agencies'] as const
type Entity = (typeof ALLOWED)[number]

function isAllowed(value: string): value is Entity {
  return (ALLOWED as readonly string[]).includes(value)
}

// ── Response helpers ──────────────────────────────────────────────────────────

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

// ── UTC date string ───────────────────────────────────────────────────────────

function utcDateString(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entity: string }> },
): Promise<Response> {
  // 1. Auth — require a session with a tenantId
  const session = await auth()
  if (!session?.user?.tenantId) return json({ error: 'Unauthorized' }, 401)

  // 2. Admin gate
  if (session.user.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  // 3. Validate entity param against allow-list
  const { entity } = await params
  if (!isAllowed(entity)) return json({ error: 'Unknown entity' }, 404)

  const tenantId = session.user.tenantId

  // 4. Build CSV via the matching builder
  const builders: Record<Entity, (tenantId: string) => Promise<{ csv: string; rowCount: number }>> = {
    candidates: buildCandidatesCsv,
    roles:      buildRolesCsv,
    scores:     buildScoresCsv,
    agencies:   buildAgenciesCsv,
  }

  const { csv, rowCount } = await builders[entity](tenantId)

  // 5. Fire-and-forget audit log
  emitAudit(tenantId, {
    action: 'tenant.csv_exported',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { entity, rowCount },
  })

  // 6. Build filename: skillai-{entity}-{tenantId}-{YYYY-MM-DD}.csv
  const filename = `skillai-${entity}-${tenantId}-${utcDateString()}.csv`

  return csvResponse(csv, filename)
}
