/**
 * GET /api/export/dsar/[candidateId]
 *
 * Admin-only. Generates and streams a GDPR Article 15 Subject Access Request
 * (DSAR) ZIP archive containing all data held for the given candidate.
 *
 * Authentication: Auth.js v5 session cookie (same as every other route).
 * Authorization: admin role only — non-admins receive 403.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildDsarZip } from '@/lib/gdpr/dsar-builder'
import { writeAuditLog } from '@/lib/audit'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
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
  const { candidateId } = await params

  try {
    // 3. Build the ZIP stream
    const archive = await buildDsarZip(candidateId, tenantId)

    // 4. Non-fatal audit log (fire-and-forget)
    writeAuditLog(tenantId, {
      action: 'candidate.dsar_exported',
      entityType: 'candidate',
      entityId: candidateId,
      entityLabel: candidateId,
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: session.user.id,
      },
    }).catch(() => {})

    // 5. Wrap archiver in a ReadableStream for the Response body
    const date = new Date().toISOString().slice(0, 10)
    const filename = `skillai-dsar-${candidateId}-${date}.zip`

    const stream = new ReadableStream({
      start(controller) {
        archive.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk)
        })
        archive.on('end', () => {
          controller.close()
        })
        archive.on('error', (err: Error) => {
          console.error('[dsar] stream error:', err)
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
    console.error('[dsar] export failed:', err instanceof Error ? err.stack : err)
    return NextResponse.json(
      {
        error: 'DSAR export failed',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
