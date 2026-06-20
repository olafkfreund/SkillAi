/**
 * Pure helpers for the host-folder inbox worker (issue #4 / Epic #3, Phase 1).
 *
 * These functions are deliberately side-effect-free so they can be unit-tested
 * without a filesystem or database. The worker (src/worker/index.ts) composes
 * them with fs + the ingestion pipeline.
 *
 * Layout (per-tenant subfolders under a single mount root — Epic #3, Q2 default):
 *
 *   INBOX_ROOT/
 *     <tenantId>/                 ← drop CVs here
 *       alice-smith.pdf
 *       .processed/               ← successfully ingested files moved here
 *       .failed/                  ← files that failed validation/ingestion
 */

import { extname, join } from 'path'

/** CV file extensions the inbox will ingest (mirrors @/lib/cv/store EXT_TO_TYPE). */
export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.odt', '.rtf', '.txt', '.md'] as const

/** Subdirectory names used to quarantine handled files so they are not re-ingested. */
export const PROCESSED_DIRNAME = '.processed'
export const FAILED_DIRNAME = '.failed'

const SUPPORTED = new Set<string>(SUPPORTED_EXTENSIONS)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True when a directory entry should be ingested: a supported CV extension and
 * not a hidden/dot file (which also excludes the .processed / .failed dirs and
 * editor temp files like `.~lock`).
 */
export function isEligibleFile(name: string): boolean {
  if (!name || name.startsWith('.')) return false
  return SUPPORTED.has(extname(name).toLowerCase())
}

/**
 * True when a subfolder name under INBOX_ROOT looks like a tenant id (UUID).
 * The worker only descends into tenant-shaped folders, ignoring stray dirs.
 */
export function isTenantFolder(name: string): boolean {
  return UUID_RE.test(name)
}

/** Absolute (or root-relative) path to a tenant's inbox folder. */
export function tenantInboxDir(root: string, tenantId: string): string {
  return join(root, tenantId)
}

/** The `.processed` quarantine dir inside a tenant inbox. */
export function processedDir(tenantDir: string): string {
  return join(tenantDir, PROCESSED_DIRNAME)
}

/** The `.failed` quarantine dir inside a tenant inbox. */
export function failedDir(tenantDir: string): string {
  return join(tenantDir, FAILED_DIRNAME)
}

/**
 * Collision-safe destination name for a handled file. Prefixing with a sortable
 * timestamp stamp keeps re-drops of the same filename from overwriting an older
 * archived copy. `stamp` is injected (not read from the clock) so this stays
 * pure and testable.
 */
export function archivedFileName(originalName: string, stamp: string): string {
  return `${stamp}__${originalName}`
}
