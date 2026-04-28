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
 * EXCLUDED tables:
 *   - tenants         — only contains the tenant's own metadata row; not useful
 *   - calendarConnections — no tenantId column; per-user, not per-tenant
 */

import archiver from 'archiver'
import type { Archiver } from 'archiver'
import { eq } from 'drizzle-orm'
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantExportManifest = {
  tenantId: string
  exportedAt: string  // ISO 8601
  schemaVersion: '1'
  tables: { name: string; rowCount: number }[]
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

export async function buildTenantExportZip(tenantId: string): Promise<Archiver> {
  const archive = archiver('zip', { zlib: { level: 6 } })

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') console.error('[tenant-export] archiver warning:', err)
  })

  const manifestTables: TenantExportManifest['tables'] = []
  const exportedAt = new Date().toISOString()

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
  })

  // ── Manifest ──────────────────────────────────────────────────────────────

  const manifest: TenantExportManifest = {
    tenantId,
    exportedAt,
    schemaVersion: '1',
    tables: manifestTables,
  }
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

  // Finalize — must be called after all entries are queued
  archive.finalize()

  return archive
}
