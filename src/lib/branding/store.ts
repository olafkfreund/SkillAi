/**
 * Branding logo file helpers — validate, persist, delete.
 *
 * Mirrors the patterns in src/lib/cv/store.ts.
 * Logos are limited to PNG, JPEG, and WebP (no SVG) and must be under 2 MB.
 * Files are stored at {UPLOAD_DIR}/{tenantId}/logos/{uuid}.{ext} on the host
 * filesystem; the DB stores the web-relative path with a leading slash:
 * /uploads/{tenantId}/logos/{uuid}.{ext}
 */

import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { fileTypeFromBuffer } from 'file-type'

const MAX_LOGO_SIZE = 2 * 1024 * 1024 // 2 MB

/** MIME types accepted for logo uploads — no SVG. */
const ALLOWED_LOGO_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

/** File extensions accepted for logo uploads. */
const ALLOWED_LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

// ---------------------------------------------------------------------------
// validateLogoFile
// ---------------------------------------------------------------------------

/**
 * Validates a logo buffer using magic-byte detection via `file-type`.
 *
 * Checks:
 * - Buffer is non-empty and within the 2 MB limit
 * - The supplied extension is in the allow-list (PNG/JPEG/WebP — no SVG)
 * - Magic-byte MIME, when detected, is in the same allow-list
 *
 * Returns a discriminated union so callers can handle errors without try/catch.
 */
export async function validateLogoFile(
  buf: Buffer,
  ext: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (buf.length === 0) {
    return { ok: false, error: 'File is empty' }
  }

  if (buf.length > MAX_LOGO_SIZE) {
    return { ok: false, error: 'Logo exceeds 2 MB limit' }
  }

  const normExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`

  if (!ALLOWED_LOGO_EXTENSIONS.has(normExt)) {
    return {
      ok: false,
      error: `Unsupported logo format: ${normExt}. Only PNG, JPEG, and WebP are allowed.`,
    }
  }

  // Magic-byte check — rejects SVGs and other files renamed to a supported extension.
  const detected = await fileTypeFromBuffer(buf)
  if (detected && !ALLOWED_LOGO_MIMES.has(detected.mime)) {
    return {
      ok: false,
      error: `Invalid file type detected: ${detected.mime}. Only PNG, JPEG, and WebP are allowed.`,
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// persistLogo
// ---------------------------------------------------------------------------

/**
 * Writes a validated logo buffer to disk at
 * `{UPLOAD_DIR}/{tenantId}/logos/{uuid}.{ext}`.
 *
 * tenantId is always supplied by the server — never accepted from client input.
 *
 * Returns the web-relative path to store in the DB
 * (`/uploads/{tenantId}/logos/{uuid}.{ext}`).
 */
export async function persistLogo(
  buf: Buffer,
  tenantId: string,
  ext: string
): Promise<string> {
  const uploadBase = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads')
  const logoDir = join(uploadBase, tenantId, 'logos')
  await mkdir(logoDir, { recursive: true })

  const normExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  const fileName = `${randomUUID()}${normExt}`
  const absolutePath = join(logoDir, fileName)
  await writeFile(absolutePath, buf)

  // DB-stored path uses a leading slash to match existing conventions.
  return `/uploads/${tenantId}/logos/${fileName}`
}

// ---------------------------------------------------------------------------
// deleteLogo
// ---------------------------------------------------------------------------

/**
 * Best-effort deletion of a logo given its DB-stored web-relative path
 * (e.g. `/uploads/{tenantId}/logos/{uuid}.png`).
 *
 * Swallows all errors — callers must not fail if the file is already gone.
 */
export async function deleteLogo(path: string): Promise<void> {
  try {
    const relative = path.startsWith('/') ? path.slice(1) : path
    const absolutePath = join(process.cwd(), relative)
    await unlink(absolutePath)
  } catch {
    // Best-effort: silently swallow all errors including ENOENT.
  }
}

// ---------------------------------------------------------------------------
// getLogoAbsolutePath
// ---------------------------------------------------------------------------

/**
 * Converts a DB-stored web-relative logo path to an absolute filesystem path
 * for file reads (e.g. serving the file directly).
 *
 * Example: `/uploads/tenant-uuid/logos/uuid.png`
 *          → `{cwd}/uploads/tenant-uuid/logos/uuid.png`
 */
export function getLogoAbsolutePath(relativePath: string): string {
  const relative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return join(process.cwd(), relative)
}
