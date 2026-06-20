/**
 * Host-folder inbox worker (issue #4 / Epic #3, Phase 1).
 *
 * Polls INBOX_ROOT/<tenantId>/ for dropped CVs, ingests each via the shared
 * session-less pipeline, and quarantines handled files into `.processed`
 * (success) or `.failed` (validation/ingestion error) so they are never
 * re-ingested. Polling (not chokidar) is used deliberately: it adds no
 * dependency and is reliable across Docker bind-mounts and network shares.
 *
 * Run:  npm run worker   (or `npx tsx src/worker/index.ts`)
 * Env:  INBOX_ROOT      (default <cwd>/inbox)
 *       INGEST_POLL_MS  (default 30000, floor 5000)
 *
 * Deployment: run as a single instance (docker-compose `worker`, scale=1). A
 * Postgres advisory-lock leader election for multi-replica safety is deferred
 * (Epic #3, Q9) — the in-process `running` guard only prevents overlapping
 * ticks within one instance.
 */

import 'dotenv/config'
import { readdir, mkdir, readFile, rename } from 'fs/promises'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { tenants } from '@/db/schema'
import { ingestCvFile } from '@/lib/ingestion/ingest-cv'
import {
  isEligibleFile,
  isTenantFolder,
  tenantInboxDir,
  processedDir,
  failedDir,
  archivedFileName,
} from '@/lib/ingestion/inbox'

const INBOX_ROOT = process.env.INBOX_ROOT || join(process.cwd(), 'inbox')
const POLL_MS = Math.max(5000, parseInt(process.env.INGEST_POLL_MS || '30000', 10) || 30000)

// Reentrancy guard: a slow tick must not overlap the next interval fire.
let running = false

async function tenantExists(tenantId: string): Promise<boolean> {
  try {
    return await withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
      return rows.length > 0
    })
  } catch {
    return false
  }
}

async function listSubdirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

async function quarantine(targetDir: string, srcPath: string, fileName: string, stamp: string): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  await rename(srcPath, join(targetDir, archivedFileName(fileName, stamp)))
}

async function processTenant(tenantId: string): Promise<void> {
  const dir = tenantInboxDir(INBOX_ROOT, tenantId)

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const files = entries.filter((e) => e.isFile() && isEligibleFile(e.name)).map((e) => e.name)
  if (files.length === 0) return

  if (!(await tenantExists(tenantId))) {
    console.warn(`[worker] skipping folder for unknown tenant: ${tenantId}`)
    return
  }

  for (const name of files) {
    const srcPath = join(dir, name)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      const buffer = await readFile(srcPath)
      const result = await ingestCvFile({ tenantId, buffer, originalName: name })
      if (result.ok) {
        await quarantine(processedDir(dir), srcPath, name, stamp)
        console.log(`[worker] ingested "${name}" → candidate ${result.candidateId} (tenant ${tenantId})`)
      } else {
        await quarantine(failedDir(dir), srcPath, name, stamp)
        console.warn(`[worker] rejected "${name}" (tenant ${tenantId}): ${result.error}`)
      }
    } catch (e) {
      console.error(`[worker] error ingesting "${name}" (tenant ${tenantId}):`, e)
      try {
        await quarantine(failedDir(dir), srcPath, name, stamp)
      } catch {
        // Leave the file in place if even the move fails; next tick retries.
      }
    }
  }
}

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    const tenantDirs = (await listSubdirs(INBOX_ROOT)).filter(isTenantFolder)
    for (const tenantId of tenantDirs) {
      try {
        await processTenant(tenantId)
      } catch (e) {
        console.error(`[worker] tenant ${tenantId} tick failed:`, e)
      }
    }
  } catch (e) {
    console.error('[worker] tick failed:', e)
  } finally {
    running = false
  }
}

async function main(): Promise<void> {
  console.log('[worker] host-folder inbox watcher starting')
  console.log(`[worker] INBOX_ROOT=${INBOX_ROOT} poll=${POLL_MS}ms`)
  await tick()
  setInterval(() => {
    void tick()
  }, POLL_MS)
}

main().catch((e) => {
  console.error('[worker] fatal:', e)
  process.exit(1)
})
