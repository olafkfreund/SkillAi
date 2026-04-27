import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { writeAuditLog } from '@/lib/audit'
import { extractSynechronCvData } from '@/lib/ai/synechron-extract'
import { SynechronCvPDF } from '@/lib/pdf'
import type { SynechronCvData } from '@/lib/ai/synechron-schema'

// Synechron extraction can call Claude on first download — give the route
// headroom for the synchronous AI path. Subsequent calls hit the cached
// jsonb and return well under a second.
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitise a name fragment for use in a Content-Disposition filename. */
function sanitiseName(raw: string | null | undefined): string {
  if (!raw) return 'unknown'
  return (
    raw
      .replace(/[^\x20-\x7E]/g, '') // strip non-ASCII
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  )
}

// ---------------------------------------------------------------------------
// GET /api/export/synechron-cv/[candidateId]
//
// Returns a Synechron-format PDF for the candidate. If candidates.synechron_cv_data
// is null, the AI extractor is invoked synchronously (and persists the result),
// then the PDF is rendered from the freshly-extracted data. Subsequent calls
// reuse the cached jsonb.
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { candidateId } = await params

  console.log(`[synechron-cv-export] candidateId=${candidateId}`)

  // 2. Fetch candidate (RLS-scoped)
  const candidate = await withTenant(tenantId, async (tx) => {
    const [c] = await tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
    return c ?? null
  })

  if (!candidate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 3. Cache check — extract synchronously if missing
  let synechronCvData = candidate.synechronCvData as SynechronCvData | null
  const wasFreshlyExtracted = !synechronCvData

  if (!synechronCvData) {
    if (!candidate.cvText) {
      return NextResponse.json(
        { error: 'Candidate has no CV text to extract from' },
        { status: 422 }
      )
    }
    try {
      synechronCvData = await extractSynechronCvData(candidateId, tenantId)
    } catch (err) {
      console.error('[synechron-cv-export] extraction failed:', err instanceof Error ? err.stack : err)
      return NextResponse.json(
        {
          error: 'Synechron extraction failed',
          detail: err instanceof Error ? err.message : 'unknown',
        },
        { status: 500 }
      )
    }
  }

  // 4. Render PDF
  let buffer: Buffer
  try {
    buffer = await renderToBuffer(
      React.createElement(SynechronCvPDF, {
        data: synechronCvData,
        synechronCandidateId: candidate.synechronCandidateId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )
  } catch (err) {
    console.error('[synechron-cv-export] PDF render failed:', err instanceof Error ? err.stack : err)
    return NextResponse.json(
      {
        error: 'PDF generation failed',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }

  // 5. Audit (best-effort)
  writeAuditLog(tenantId, {
    action: 'candidate.synechron_cv_downloaded',
    entityType: 'candidate',
    entityId: candidateId,
    entityLabel: `${candidate.firstName} ${candidate.lastName}`.trim() || candidateId,
    metadata: { wasFreshlyExtracted },
  }).catch(() => {
    /* audit failures must not break the download */
  })

  // 6. Build filename — prefer SYNE-#### identifier when present
  const firstName = sanitiseName(candidate.firstName)
  const lastName = sanitiseName(candidate.lastName)
  const synechronId = candidate.synechronCandidateId
    ? sanitiseName(candidate.synechronCandidateId)
    : null
  const filename = synechronId
    ? `${synechronId}-${firstName}-${lastName}-Synechron-CV.pdf`
    : `${firstName}-${lastName}-Synechron-CV.pdf`

  console.log(
    `[synechron-cv-export] ✓ rendered ${filename} (${buffer.length} bytes, freshlyExtracted=${wasFreshlyExtracted})`
  )

  // 7. Stream response — `inline` so the browser opens it in a new tab
  // (matches the existing candidate PDF export UX).
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
