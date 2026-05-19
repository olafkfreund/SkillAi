import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { emitAudit } from '@/lib/audit-middleware'
import { extractSynechronCvData } from '@/lib/ai/synechron-extract'
import { SynechronCvPDF } from '@/lib/pdf'
import type { SynechronCvData } from '@/lib/ai/synechron-schema'

// Synechron extraction can call Claude on first download — give the route
// headroom for the synchronous AI path. Subsequent calls hit the cached
// jsonb and return well under a second.
export const maxDuration = 60

type Candidate = Awaited<ReturnType<typeof fetchCandidate>>
type EnsureSynechronResult =
  | { data: SynechronCvData; wasFreshlyExtracted: boolean }
  | { error: NextResponse }

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

function failResponse(category: string, err: unknown, status = 500) {
  console.error(`[synechron-cv-export] ${category} failed:`, err instanceof Error ? err.stack : err)
  return NextResponse.json(
    { error: `${category} failed`, detail: err instanceof Error ? err.message : 'unknown' },
    { status }
  )
}

async function fetchCandidate(tenantId: string, candidateId: string) {
  return withTenant(tenantId, async (tx) => {
    const [c] = await tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
    return c ?? null
  })
}

/**
 * Stored Synechron data predates the v2 schema (Wave 1 of issue #142) when the
 * `projects` field is entirely absent. An empty array `[]` counts as fresh —
 * that means the model already considered the field and returned nothing for
 * it. `undefined` means the cached row was extracted before `projects` /
 * `keyAchievement` / `location` existed in the schema.
 */
function isStaleSynechronData(cached: SynechronCvData): boolean {
  // We treat "projects key present" as the schema-version signal. The schema
  // change always adds projects to the tool output (even if as an empty array
  // when no projects are detected) since Claude is instructed about the field.
  return !Object.prototype.hasOwnProperty.call(cached, 'projects')
}

async function ensureSynechronData(
  candidate: NonNullable<Candidate>,
  tenantId: string
): Promise<EnsureSynechronResult> {
  const cached = candidate.synechronCvData as SynechronCvData | null

  if (cached && !isStaleSynechronData(cached)) {
    return { data: cached, wasFreshlyExtracted: false }
  }

  if (!candidate.cvText) {
    if (cached) {
      // Stale but no CV text to re-extract from — fall through with what we have.
      console.warn(
        `[synechron-cv-export] candidateId=${candidate.id} has stale synechronCvData but no cvText to re-extract from; rendering with cached data`
      )
      return { data: cached, wasFreshlyExtracted: false }
    }
    return {
      error: NextResponse.json(
        { error: 'Candidate has no CV text to extract from' },
        { status: 422 }
      ),
    }
  }

  try {
    const data = await extractSynechronCvData(candidate.id, tenantId)
    if (cached) {
      console.log(
        `[synechron-cv-export] candidateId=${candidate.id} re-extracted stale synechronCvData (added projects/keyAchievement/location)`
      )
    }
    return { data, wasFreshlyExtracted: true }
  } catch (err) {
    if (cached) {
      // Re-extraction failed but we still have usable cached data — never
      // block the request. Log a warning and render with what we have.
      console.warn(
        `[synechron-cv-export] candidateId=${candidate.id} re-extraction of stale synechronCvData failed; falling back to cached data:`,
        err instanceof Error ? err.message : err
      )
      return { data: cached, wasFreshlyExtracted: false }
    }
    return { error: failResponse('Synechron extraction', err) }
  }
}

async function renderPdfBuffer(
  data: SynechronCvData,
  synechronCandidateId: string | null
): Promise<Buffer> {
  return renderToBuffer(
    React.createElement(SynechronCvPDF, {
      data,
      synechronCandidateId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )
}

function buildFilename(candidate: NonNullable<Candidate>): string {
  const firstName = sanitiseName(candidate.firstName)
  const lastName = sanitiseName(candidate.lastName)
  const synechronId = candidate.synechronCandidateId
    ? sanitiseName(candidate.synechronCandidateId)
    : null
  return synechronId
    ? `${synechronId}-${firstName}-${lastName}-Synechron-CV.pdf`
    : `${firstName}-${lastName}-Synechron-CV.pdf`
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
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const { candidateId } = await params

  console.log(`[synechron-cv-export] candidateId=${candidateId}`)

  const candidate = await fetchCandidate(tenantId, candidateId)
  if (!candidate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ensured = await ensureSynechronData(candidate, tenantId)
  if ('error' in ensured) return ensured.error
  const { data: synechronCvData, wasFreshlyExtracted } = ensured

  let buffer: Buffer
  try {
    buffer = await renderPdfBuffer(synechronCvData, candidate.synechronCandidateId)
  } catch (err) {
    return failResponse('PDF generation', err)
  }

  emitAudit(tenantId, {
    action: 'candidate.synechron_cv_downloaded',
    entityType: 'candidate',
    entityId: candidateId,
    entityLabel: `${candidate.firstName} ${candidate.lastName}`.trim() || candidateId,
    metadata: { wasFreshlyExtracted },
  })

  const filename = buildFilename(candidate)

  console.log(
    `[synechron-cv-export] ✓ rendered ${filename} (${buffer.length} bytes, freshlyExtracted=${wasFreshlyExtracted})`
  )

  // `inline` so the browser opens it in a new tab
  // (matches the existing candidate PDF export UX).
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
