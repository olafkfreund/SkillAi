import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import path from 'path'
import fs from 'fs/promises'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { writeAuditLog } from '@/lib/audit'
import {
  validateCvFile,
  parseCvBuffer,
  persistCvFile,
  deleteCvFile,
} from '@/lib/cv/store'
import type { CvFileType } from '@/lib/cv/store'

// ---------------------------------------------------------------------------
// MIME type map for download response
// ---------------------------------------------------------------------------

const MIME_BY_TYPE: Record<CvFileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid()

/** Build a safe Content-Disposition filename from candidate names. */
function buildFilename(
  firstName: string,
  lastName: string,
  candidateId: string,
  fileType: CvFileType
): string {
  const raw = `${firstName}-${lastName}`.trim()
  // Strip non-ASCII, collapse whitespace to '-'
  const sanitised = raw
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const stem = sanitised || `candidate-${candidateId.slice(0, 8)}`
  return `${stem}-CV.${fileType}`
}

// ---------------------------------------------------------------------------
// GET — download original CV (issue #19)
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  // 2. Validate candidateId
  const { candidateId } = await params
  const parsed = uuidSchema.safeParse(candidateId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  // 3. Fetch candidate (RLS + explicit tenantId filter)
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!candidate) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // 4. Must have a stored file
  if (!candidate.filePath) {
    return NextResponse.json({ error: 'no_file' }, { status: 404 })
  }

  if (!candidate.fileType) {
    return NextResponse.json({ error: 'no_file' }, { status: 404 })
  }

  // 5. Resolve absolute path with traversal guard
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? '/app/uploads')
  const rel = candidate.filePath.replace(/^\/uploads\//, '')
  const abs = path.resolve(uploadDir, rel)

  if (!abs.startsWith(uploadDir + path.sep)) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 })
  }

  // 6. Read file from disk
  let buffer: Buffer
  try {
    buffer = await fs.readFile(abs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json({ error: 'file_missing' }, { status: 410 })
    }
    console.error('[cv/GET] Failed to read CV file:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // 7. Build response headers
  const fileType = candidate.fileType as CvFileType
  const contentType = MIME_BY_TYPE[fileType] ?? 'application/octet-stream'
  const filename = buildFilename(
    candidate.firstName,
    candidate.lastName,
    candidateId,
    fileType
  )

  // 8. Audit (non-fatal)
  try {
    await writeAuditLog(tenantId, {
      action: 'candidate.cv_downloaded',
      entityType: 'candidate',
      entityId: candidateId,
      entityLabel: `${candidate.firstName} ${candidate.lastName}`.trim() || candidateId,
    })
  } catch (err) {
    console.error('[cv/GET] Audit log failed:', err)
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  })
}

// ---------------------------------------------------------------------------
// POST — attach or replace CV (issue #20)
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  // 2. Validate candidateId
  const { candidateId } = await params
  const parsed = uuidSchema.safeParse(candidateId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  // 3. Ensure multipart/form-data content type
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }

  // 4. Fetch candidate (RLS + explicit tenantId filter)
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!candidate) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // 5. Parse FormData — expect a `file` field
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }

  // 6. Validate the uploaded file
  const validation = await validateCvFile(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }
  const { buffer, fileType } = validation

  // 7. Parse CV text from buffer
  let cvText: string
  try {
    const result = await parseCvBuffer(buffer, fileType)
    cvText = result.cvText
  } catch (err) {
    console.error('[cv/POST] Failed to parse CV:', err)
    return NextResponse.json({ error: 'parse_failed' }, { status: 422 })
  }

  // 8. Persist new file to disk
  let newFilePath: string
  try {
    const result = await persistCvFile(tenantId, buffer, fileType)
    newFilePath = result.filePath
  } catch (err) {
    console.error('[cv/POST] Failed to persist CV file:', err)
    return NextResponse.json({ error: 'storage_failed' }, { status: 500 })
  }

  // 9. Update candidate row in DB (inside withTenant for RLS)
  const oldFilePath = candidate.filePath ?? null
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({
        filePath: newFilePath,
        fileType,
        cvText,
        embedding: null,
      })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  // 10. Delete old file — non-fatal
  if (oldFilePath) {
    try {
      await deleteCvFile(oldFilePath)
    } catch (err) {
      console.error('[cv/POST] Failed to delete old CV file (non-fatal):', err)
    }
  }

  // 11. Audit (non-fatal)
  const auditAction = oldFilePath ? 'candidate.cv_replaced' : 'candidate.cv_attached'
  try {
    await writeAuditLog(tenantId, {
      action: auditAction,
      entityType: 'candidate',
      entityId: candidateId,
      entityLabel: `${candidate.firstName} ${candidate.lastName}`.trim() || candidateId,
    })
  } catch (err) {
    console.error('[cv/POST] Audit log failed:', err)
  }

  // 12. Return success
  return NextResponse.json({ ok: true, filePath: newFilePath, fileType })
}
