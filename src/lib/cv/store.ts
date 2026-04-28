/**
 * Shared CV file helpers — validate, parse, persist, delete.
 *
 * Used by both the bulk-upload API route and the createCandidate server action
 * so that validation and storage logic live in exactly one place.
 */

import { writeFile, mkdir, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { fileTypeFromBuffer } from 'file-type'
import { parseFile, ParseError } from '@/lib/parsers'
import type { FileType } from '@/lib/parsers'

// Re-export the canonical file-type union so callers can import from one place.
export type CvFileType = FileType

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/** MIME types that map to a supported file type. */
const ACCEPTED_TYPES: Record<string, CvFileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
}

/** File extensions that map to a supported file type. */
const EXT_TO_TYPE: Record<string, CvFileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.odt': 'odt',
  '.rtf': 'rtf',
  '.txt': 'txt',
  '.md': 'md',
}

/**
 * MIME types that are acceptable when detected via magic-byte inspection.
 * Plain text and markdown are not reliably detected by `file-type` (returns
 * undefined), so the absence of a detected type is also fine for those formats.
 */
const ALLOWED_MAGIC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
])

// ---------------------------------------------------------------------------
// validateCvFile
// ---------------------------------------------------------------------------

/**
 * Validates a Web `File` (from multipart/form-data).
 *
 * Checks:
 * - File is non-empty and within 10 MB
 * - MIME type or file extension maps to a supported CV format
 * - Magic-byte detection does not flag a clearly disallowed binary type
 *
 * Returns a discriminated union so callers can handle the error path without
 * try/catch.
 */
export async function validateCvFile(
  file: File
): Promise<
  | { ok: true; fileType: CvFileType; buffer: Buffer; sizeBytes: number }
  | { ok: false; error: string }
> {
  if (file.size === 0) {
    return { ok: false, error: 'File is empty' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'File exceeds 10 MB limit' }
  }

  // Resolve file type from MIME header first, then fall back to extension.
  const fileType: CvFileType | undefined =
    ACCEPTED_TYPES[file.type] ?? EXT_TO_TYPE[extname(file.name).toLowerCase()]

  if (!fileType) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.type || extname(file.name)}`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Magic-byte check — rejects executables, images, etc. that are renamed to
  // a supported extension. `file-type` returns undefined for plain text/markdown
  // (no reliable magic bytes), so we only reject when a type IS detected and it
  // is not in our allow-list.
  const detectedType = await fileTypeFromBuffer(buffer)
  if (detectedType && !ALLOWED_MAGIC_MIMES.has(detectedType.mime)) {
    return { ok: false, error: `Invalid file type detected: ${detectedType.mime}` }
  }

  return { ok: true, fileType, buffer, sizeBytes: file.size }
}

// ---------------------------------------------------------------------------
// parseCvBuffer
// ---------------------------------------------------------------------------

/**
 * Extracts plain-text content from a CV buffer.
 *
 * Strips null bytes and non-printable control characters that PostgreSQL
 * rejects before returning. Throws `ParseError` on extraction failure.
 */
export async function parseCvBuffer(
  buffer: Buffer,
  fileType: CvFileType
): Promise<{ cvText: string }> {
  let raw: string
  try {
    raw = await parseFile(buffer, fileType)
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError('Failed to extract text from CV')
  }

  // Strip null bytes and non-printable control characters PostgreSQL rejects.
  const cvText = raw
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')

  return { cvText }
}

// ---------------------------------------------------------------------------
// persistCvFile
// ---------------------------------------------------------------------------

/**
 * Writes the CV buffer to `/uploads/{tenantId}/{uuid}.{ext}` on disk.
 *
 * Returns:
 * - `fileId`   — the UUID used as the filename stem (useful for linking back)
 * - `filePath` — the path stored in the DB (`/uploads/{tenantId}/{uuid}.{ext}`,
 *                leading slash, matching the existing convention in callers)
 */
export async function persistCvFile(
  tenantId: string,
  buffer: Buffer,
  fileType: CvFileType
): Promise<{ filePath: string; fileId: string }> {
  const fileId = randomUUID()
  const fileName = `${fileId}.${fileType}`

  // Compute the DB path first, then derive the absolute path from it — the same
  // resolution rule used by deleteCvFile — so write and read sides are always
  // symmetric. Using UPLOAD_DIR directly on the write side caused double-prefix
  // bugs when the env var is an absolute path (e.g. /app/app/uploads). See #98.
  const filePath = `/uploads/${tenantId}/${fileName}`
  const absolutePath = join(process.cwd(), filePath.slice(1))

  await mkdir(join(absolutePath, '..'), { recursive: true })
  await writeFile(absolutePath, buffer)

  return { filePath, fileId }
}

// ---------------------------------------------------------------------------
// deleteCvFile
// ---------------------------------------------------------------------------

/**
 * Best-effort deletion of a CV file given its DB-stored path
 * (e.g. `/uploads/{tenantId}/{uuid}.ext`).
 *
 * Silently ignores ENOENT (file already gone). Re-throws any other error.
 */
export async function deleteCvFile(filePath: string): Promise<void> {
  // Resolve the DB-stored relative path to an absolute filesystem path.
  // The DB stores `/uploads/...` — strip the leading slash so `join` treats
  // it as relative to cwd.
  const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath
  const absolutePath = join(process.cwd(), relative)

  try {
    await unlink(absolutePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}
