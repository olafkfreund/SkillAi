/**
 * GET /api/export/tenant
 *
 * Admin-only. Streams a ZIP archive containing JSON for every tenant-scoped
 * table belonging to the current tenant.
 *
 * Rate limit: one export per 60 seconds per tenant (checked via audit_logs).
 *
 * Authentication: Auth.js v5 session cookie.
 * Authorization: admin role only — non-admins receive 403.
 */

import { NextResponse } from 'next/server'
import { desc, eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { auditLogs } from '@/db/schema'
import { buildTenantExportZip } from '@/lib/export/tenant-export-builder'
import { writeAuditLog } from '@/lib/audit'

const RATE_LIMIT_SECONDS = 60

/** Build a filesystem-safe UTC timestamp string: YYYYMMDD-HHMMSS */
function buildTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = now.getUTCFullYear()
  const month = pad(now.getUTCMonth() + 1)
  const day = pad(now.getUTCDate())
  const hours = pad(now.getUTCHours())
  const mins = pad(now.getUTCMinutes())
  const secs = pad(now.getUTCSeconds())
  return `${year}${month}${day}-${hours}${mins}${secs}`
}

export async function GET(_req: Request): Promise<Response> {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Admin-only
  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: admin role required' },
      { status: 403 }
    )
  }

  const tenantId = session.user.tenantId

  // 3. Rate-limit check: query audit_logs for most recent tenant.exported
  try {
    const [lastExport] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.action, 'tenant.exported')
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)
    )

    if (lastExport) {
      const secondsSince = (Date.now() - lastExport.createdAt.getTime()) / 1000
      if (secondsSince < RATE_LIMIT_SECONDS) {
        const retryAfterSeconds = Math.ceil(RATE_LIMIT_SECONDS - secondsSince)
        return NextResponse.json(
          { error: 'Rate limited', retryAfterSeconds },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
          }
        )
      }
    }
  } catch (err) {
    console.error('[tenant-export] rate-limit check failed:', err)
    // Non-fatal: if rate-limit check fails, proceed with the export
  }

  try {
    // 4. Build the ZIP stream
    const archive = await buildTenantExportZip(tenantId)

    // 5. Build filename with safe UTC timestamp
    const timestamp = buildTimestamp()
    const filename = `skillai-tenant-export-${tenantId}-${timestamp}.zip`

    // 6. Wrap archiver in a ReadableStream for the Response body
    //    Audit log is written on the 'end' event so tableCounts are available
    //    in the manifest (the archive already has the data at that point).
    const stream = new ReadableStream({
      start(controller) {
        archive.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk)
        })
        archive.on('end', () => {
          // Fire-and-forget audit after stream completes
          writeAuditLog(tenantId, {
            action: 'tenant.exported',
            entityType: 'tenant',
            entityId: tenantId,
            entityLabel: tenantId,
            metadata: {
              exportedAt: new Date().toISOString(),
              exportedBy: session.user.id,
            },
          }).catch(() => {})
          controller.close()
        })
        archive.on('error', (err: Error) => {
          console.error('[tenant-export] stream error:', err)
          controller.error(err)
        })
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error(
      '[tenant-export] export failed:',
      err instanceof Error ? err.stack : err
    )
    return NextResponse.json(
      {
        error: 'Tenant export failed',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
