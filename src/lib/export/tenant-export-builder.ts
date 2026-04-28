/**
 * Tenant data export ZIP builder.
 *
 * Streams a ZIP containing one JSON file per tenant-scoped table plus a
 * manifest.json. Tables are fetched in batches of 1,000 rows to avoid OOM
 * on large tenants.
 *
 * Tables with no direct tenantId column (interviewQuestions, codeChallenges)
 * are fetched via an INNER JOIN to their parent (interviewPacks) which carries
 * the tenantId and is itself RLS-filtered.
 *
 * The returned archiver is a Node.js Readable stream. The caller MUST consume
 * it promptly; archive.finalize() is called internally before this function
 * returns.
 *
 * When opts.includeFiles is true, the ZIP also contains a `files/` directory
 * with the original binary files (CVs, logos) for the tenant. Each file is
 * streamed directly from disk by archiver — no in-memory load. Missing or
 * inaccessible files are recorded in manifest.skippedFiles[] rather than
 * failing the export.
 *
 * EXCLUDED tables:
 *   - tenants         — only contains the tenant's own metadata row; not useful
 *   - calendarConnections — no tenantId column; per-user, not per-tenant
 */

import archiver from 'archiver'
import type { Archiver } from 'archiver'
import { stat } from 'fs/promises'
import { join, basename } from 'path'
import { eq, isNotNull } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  agencies,
  aiUsage,
  apiTokens,
  auditLogs,
  candidateEnrichments,
  candidateRoleApprovals,
  candidates,
  customerFrameworks,
  customers,
  cvProfiles,
  emailTemplates,
  interviewPacks,
  interviewQuestions,
  interviewSlots,
  interviewTranscripts,
  notes,
  roleManagers,
  roles,
  scores,
  sentEmails,
  tenantSettings,
  transcriptAnalyses,
  userInvitations,
  users,
  codeChallenges,
} from '@/db/schema'
import { getLogoAbsolutePath } from '@/lib/branding/store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildTenantExportOpts = {
  tenantId: string
  includeFiles?: boolean
}

export type SkippedFile = {
  path: string
  reason: string
}

export type TenantExportManifest = {
  tenantId: string
  exportedAt: string  // ISO 8601
  schemaVersion: '1'
  tables: { name: string; rowCount: number }[]
  includesFiles: boolean
  binaryFileCount: number
  totalBinaryBytes: number
  skippedFiles: SkippedFile[]
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a DB-stored web-relative CV/role file path to an absolute
 * filesystem path. The DB stores `/uploads/{tenantId}/{uuid}.ext` with a
 * leading slash; we strip it and join with cwd, mirroring deleteCvFile.
 */
function getCvAbsolutePath(filePath: string): string {
  const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath
  return join(process.cwd(), relative)
}

/**
 * Returns the absolute tenant upload root for path-traversal guard.
 * All tenant files (CVs and logos) must reside under this directory.
 */
function tenantUploadRoot(tenantId: string): string {
  return join(process.cwd(), 'uploads', tenantId)
}

/**
 * Sanitises a filename for use inside the ZIP to guard against pathological
 * names (path separators, control chars, null bytes, dotdot).
 */
function sanitiseFilename(name: string): string {
  return name
    .replace(/\//g, '_')
    .replace(/\.\./g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
}

// ---------------------------------------------------------------------------
// Batch-fetch helper
// ---------------------------------------------------------------------------

const BATCH_SIZE = 1000

/**
 * Fetch all rows from a Drizzle table expression with tenantId, in batches.
 * Returns the full collected array.
 */
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  while (true) {
    const batch: T[] = await tx.select().from(table).limit(BATCH_SIZE).offset(offset)
    rows.push(...batch)
    if (batch.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }
  return rows
}

/**
 * Fetch all rows from a grandchild table (no direct tenantId) that links to
 * interviewPacks via packId. The RLS policy on interviewQuestions /
 * codeChallenges already enforces tenant isolation via a subquery; this helper
 * iterates in batches.
 */
async function fetchGrandchildRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packIdCol: any,
  packIds: string[]
): Promise<T[]> {
  if (packIds.length === 0) return []
  const rows: T[] = []
  // Iterate over packIds in groups to avoid large IN clauses; each group runs
  // via paginated select with eq on packId. For typical tenant sizes this is
  // acceptable; a future improvement could use sql`IN (...)`.
  for (const pid of packIds) {
    let offset = 0
    while (true) {
      const batch: T[] = await tx
        .select()
        .from(table)
        .where(eq(packIdCol, pid))
        .limit(BATCH_SIZE)
        .offset(offset)
      rows.push(...batch)
      if (batch.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// buildTenantExportZip
// ---------------------------------------------------------------------------

export async function buildTenantExportZip(opts: BuildTenantExportOpts): Promise<Archiver> {
  const { tenantId, includeFiles = false } = opts

  const archive = archiver('zip', { zlib: { level: 6 } })

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') console.error('[tenant-export] archiver warning:', err)
  })

  const manifestTables: TenantExportManifest['tables'] = []
  const skippedFiles: SkippedFile[] = []
  let binaryFileCount = 0
  let totalBinaryBytes = 0
  const exportedAt = new Date().toISOString()

  // The tenant upload root — all binary paths must resolve inside this prefix.
  const uploadRoot = tenantUploadRoot(tenantId)

  await withTenant(tenantId, async (tx) => {
    // Helper: collect rows, append to archive, record manifest entry
    async function appendTable<T>(name: string, rows: T[]) {
      archive.append(JSON.stringify(rows, null, 2), { name: `${name}.json` })
      manifestTables.push({ name, rowCount: rows.length })
    }

    // ── Direct-tenantId tables (RLS enforced + queried via withTenant) ────────

    await appendTable('agencies', await fetchAllRows(tx, agencies))
    await appendTable('ai_usage', await fetchAllRows(tx, aiUsage))
    await appendTable('api_tokens', await fetchAllRows(tx, apiTokens))
    await appendTable('audit_logs', await fetchAllRows(tx, auditLogs))
    await appendTable('candidate_enrichments', await fetchAllRows(tx, candidateEnrichments))
    await appendTable('candidate_role_approvals', await fetchAllRows(tx, candidateRoleApprovals))
    await appendTable('candidates', await fetchAllRows(tx, candidates))
    await appendTable('customer_frameworks', await fetchAllRows(tx, customerFrameworks))
    await appendTable('customers', await fetchAllRows(tx, customers))
    await appendTable('cv_profiles', await fetchAllRows(tx, cvProfiles))
    await appendTable('email_templates', await fetchAllRows(tx, emailTemplates))
    await appendTable('interview_packs', await fetchAllRows(tx, interviewPacks))
    await appendTable('interview_slots', await fetchAllRows(tx, interviewSlots))
    await appendTable('interview_transcripts', await fetchAllRows(tx, interviewTranscripts))
    await appendTable('notes', await fetchAllRows(tx, notes))
    await appendTable('role_managers', await fetchAllRows(tx, roleManagers))
    await appendTable('roles', await fetchAllRows(tx, roles))
    await appendTable('scores', await fetchAllRows(tx, scores))
    await appendTable('sent_emails', await fetchAllRows(tx, sentEmails))
    await appendTable('tenant_settings', await fetchAllRows(tx, tenantSettings))
    await appendTable('transcript_analyses', await fetchAllRows(tx, transcriptAnalyses))
    await appendTable('user_invitations', await fetchAllRows(tx, userInvitations))
    await appendTable('users', await fetchAllRows(tx, users))

    // ── Grandchild tables: no direct tenantId — join via interviewPacks ───────
    // RLS on these tables already enforces tenant isolation via EXISTS subquery
    // to interview_packs. We collect pack IDs already fetched above to scope
    // the queries efficiently.

    const allPacks = await fetchAllRows<{ id: string }>(tx, interviewPacks)
    const packIds = allPacks.map((p) => p.id)

    const questionRows = await fetchGrandchildRows(
      tx,
      interviewQuestions,
      interviewQuestions.packId,
      packIds
    )
    await appendTable('interview_questions', questionRows)

    const challengeRows = await fetchGrandchildRows(
      tx,
      codeChallenges,
      codeChallenges.packId,
      packIds
    )
    await appendTable('code_challenges', challengeRows)

    // ── Optional binary files ─────────────────────────────────────────────────

    if (includeFiles) {
      /**
       * Validates and appends a single binary file to the archive.
       *
       * Safety checks (defence-in-depth — applied even if the upstream helper
       * already validates the path):
       *   1. The resolved absolute path must begin with the tenant upload root.
       *   2. fs.stat must succeed (file exists and is accessible).
       *
       * On any failure: skip + record in skippedFiles[]. Never throws.
       */
      async function appendBinaryFile(
        dbPath: string,
        zipSubdir: string,
        entityId: string
      ): Promise<void> {
        let absPath: string
        try {
          absPath = dbPath.startsWith('/uploads/')
            ? getCvAbsolutePath(dbPath)
            : getLogoAbsolutePath(dbPath)
        } catch {
          skippedFiles.push({ path: dbPath, reason: 'path-resolution-error' })
          return
        }

        // Security guard: resolved path must be inside the tenant upload dir.
        if (!absPath.startsWith(uploadRoot + '/') && absPath !== uploadRoot) {
          skippedFiles.push({ path: dbPath, reason: 'path-outside-tenant' })
          return
        }

        let fileSize: number
        try {
          const stats = await stat(absPath)
          fileSize = stats.size
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code
          const reason =
            code === 'ENOENT' ? 'not-found' :
            code === 'EACCES' ? 'permission-denied' :
            `stat-error:${code ?? 'unknown'}`
          skippedFiles.push({ path: dbPath, reason })
          return
        }

        const safeName = sanitiseFilename(basename(dbPath))
        const entryName = `files/${zipSubdir}/${entityId}-${safeName}`
        archive.file(absPath, { name: entryName })
        binaryFileCount++
        totalBinaryBytes += fileSize
      }

      // Candidate CVs
      const candidateFiles = await tx
        .select({ id: candidates.id, filePath: candidates.filePath })
        .from(candidates)
        .where(isNotNull(candidates.filePath))
      for (const row of candidateFiles) {
        if (row.filePath) {
          await appendBinaryFile(row.filePath, 'candidates', row.id)
        }
      }

      // Agency logos
      const agencyLogos = await tx
        .select({ id: agencies.id, logoPath: agencies.logoPath })
        .from(agencies)
        .where(isNotNull(agencies.logoPath))
      for (const row of agencyLogos) {
        if (row.logoPath) {
          await appendBinaryFile(row.logoPath, 'agencies', row.id)
        }
      }

      // Customer logos
      const customerLogos = await tx
        .select({ id: customers.id, logoPath: customers.logoPath })
        .from(customers)
        .where(isNotNull(customers.logoPath))
      for (const row of customerLogos) {
        if (row.logoPath) {
          await appendBinaryFile(row.logoPath, 'customers', row.id)
        }
      }

      // Role attachments (roles.filePath exists per schema)
      const roleFiles = await tx
        .select({ id: roles.id, filePath: roles.filePath })
        .from(roles)
        .where(isNotNull(roles.filePath))
      for (const row of roleFiles) {
        if (row.filePath) {
          await appendBinaryFile(row.filePath, 'roles', row.id)
        }
      }
    }
  })

  // ── Manifest ──────────────────────────────────────────────────────────────

  const manifest: TenantExportManifest = {
    tenantId,
    exportedAt,
    schemaVersion: '1',
    tables: manifestTables,
    includesFiles: includeFiles,
    binaryFileCount,
    totalBinaryBytes,
    skippedFiles,
  }
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

  // Finalize — must be called after all entries are queued
  archive.finalize()

  return archive
}
