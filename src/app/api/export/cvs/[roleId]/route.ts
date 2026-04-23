import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import path from 'path'
import fs from 'fs'
import archiver from 'archiver'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, scores, candidates } from '@/db/schema'
import { writeAuditLog } from '@/lib/audit'
import type { CandidateStatus } from '@/db/schema/candidates'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES: Array<CandidateStatus | 'all'> = [
  'all',
  'new',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'rejected',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitise a name fragment for use in a zip entry filename. */
function sanitiseName(raw: string): string {
  return raw
    .replace(/[^\x20-\x7E]/g, '') // strip non-ASCII
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Build a zip entry name for a candidate CV. Deduplicates on collision. */
function buildEntryName(
  firstName: string,
  lastName: string,
  candidateId: string,
  fileType: string,
  usedNames: Set<string>
): string {
  const stem =
    sanitiseName(`${firstName}-${lastName}`.trim()) ||
    `candidate-${candidateId.slice(0, 8)}`

  let candidate = `${stem}-CV.${fileType}`
  let suffix = 2
  while (usedNames.has(candidate)) {
    candidate = `${stem}-CV-${suffix}.${fileType}`
    suffix++
  }
  usedNames.add(candidate)
  return candidate
}

/** Sanitise a role title for use in Content-Disposition filename. */
function sanitiseRoleTitle(title: string): string {
  return title
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'role'
}

// ---------------------------------------------------------------------------
// GET /api/export/cvs/[roleId]?status=shortlisted
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { roleId } = await params

  // 2. Parse + validate query param
  const url = new URL(request.url)
  const rawStatus = url.searchParams.get('status') ?? 'shortlisted'
  if (!VALID_STATUSES.includes(rawStatus as CandidateStatus | 'all')) {
    return NextResponse.json(
      { error: 'invalid_status', valid: VALID_STATUSES },
      { status: 400 }
    )
  }
  const statusFilter = rawStatus as CandidateStatus | 'all'

  // 3. Fetch role + candidates (inside withTenant for RLS)
  const role = await withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({ id: roles.id, title: roles.title })
      .from(roles)
      .where(
        and(
          eq(roles.id, roleId),
          eq(roles.tenantId, tenantId),
          eq(roles.isActive, true)
        )
      )
      .limit(1)
    return r ?? null
  })

  if (!role) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const rows = await withTenant(tenantId, async (tx) => {
    const query = tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        filePath: candidates.filePath,
        fileType: candidates.fileType,
        status: candidates.status,
      })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(
        statusFilter === 'all'
          ? eq(scores.roleId, roleId)
          : and(
              eq(scores.roleId, roleId),
              eq(candidates.status, statusFilter)
            )
      )

    return query
  })

  // 4. Partition into withFile / withoutFile
  const withFile = rows.filter((r) => r.filePath && r.fileType)
  const withoutFile = rows.filter((r) => !r.filePath || !r.fileType)

  // Resolve upload dir once
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? '/app/uploads')

  // Check which withFile entries actually exist on disk
  type MissingOnDisk = { firstName: string; lastName: string; email: string | null }
  const missingOnDisk: MissingOnDisk[] = []
  const toArchive: Array<{
    abs: string
    fileType: string
    firstName: string
    lastName: string
    id: string
    email: string | null
  }> = []

  for (const row of withFile) {
    // filePath stored as /uploads/<tenantId>/uuid.ext — strip the /uploads/ prefix
    const rel = row.filePath!.replace(/^\/uploads\//, '')
    const abs = path.resolve(uploadDir, rel)

    // Path-traversal guard
    if (!abs.startsWith(uploadDir + path.sep)) {
      missingOnDisk.push({ firstName: row.firstName, lastName: row.lastName, email: row.email ?? null })
      continue
    }

    if (fs.existsSync(abs)) {
      toArchive.push({
        abs,
        fileType: row.fileType!,
        firstName: row.firstName,
        lastName: row.lastName,
        id: row.id,
        email: row.email ?? null,
      })
    } else {
      missingOnDisk.push({ firstName: row.firstName, lastName: row.lastName, email: row.email ?? null })
    }
  }

  // 5. Nothing at all — return 404
  if (toArchive.length === 0 && withoutFile.length === 0 && missingOnDisk.length === 0) {
    return NextResponse.json({ error: 'nothing_to_export' }, { status: 404 })
  }

  // 6. Stream ZIP via ReadableStream adapter
  const roleTitle = sanitiseRoleTitle(role.title)
  const zipFilename = `${roleTitle}-CVs.zip`

  // Collect candidate IDs that actually made it into the archive, for audit
  const auditIds: Array<{ id: string; firstName: string; lastName: string }> = []

  const stream = new ReadableStream({
    start(controller) {
      const archive = archiver('zip', { zlib: { level: 6 } })

      archive.on('data', (chunk: Buffer) => {
        controller.enqueue(chunk)
      })

      archive.on('end', () => {
        controller.close()

        // Audit — non-fatal, fire-and-forget
        Promise.allSettled(
          auditIds.map((c) =>
            writeAuditLog(tenantId, {
              action: 'candidate.cv_downloaded',
              entityType: 'candidate',
              entityId: c.id,
              entityLabel: `${c.firstName} ${c.lastName}`.trim() || c.id,
            })
          )
        ).catch(() => {/* audit failures are silently ignored */})
      })

      archive.on('error', (err: Error) => {
        console.error('[export/cvs] archiver error:', err)
        controller.error(err)
      })

      // Queue file entries
      const usedNames = new Set<string>()

      for (const entry of toArchive) {
        const entryName = buildEntryName(
          entry.firstName,
          entry.lastName,
          entry.id,
          entry.fileType,
          usedNames
        )
        archive.file(entry.abs, { name: entryName })
        auditIds.push({ id: entry.id, firstName: entry.firstName, lastName: entry.lastName })
      }

      // MISSING.txt if needed
      const missingNoFile = withoutFile.map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email ?? null,
      }))

      if (missingNoFile.length > 0 || missingOnDisk.length > 0) {
        let txt = 'MISSING CANDIDATE CVs\n'
        txt += '======================\n\n'

        if (missingNoFile.length > 0) {
          txt += 'No file on record\n'
          txt += '------------------\n'
          for (const m of missingNoFile) {
            const name = `${m.firstName} ${m.lastName}`.trim() || '(unknown)'
            const email = m.email ?? '(no email)'
            txt += `  • ${name} <${email}>\n`
          }
          txt += '\n'
        }

        if (missingOnDisk.length > 0) {
          txt += 'File missing on disk\n'
          txt += '---------------------\n'
          for (const m of missingOnDisk) {
            const name = `${m.firstName} ${m.lastName}`.trim() || '(unknown)'
            const email = m.email ?? '(no email)'
            txt += `  • ${name} <${email}>\n`
          }
          txt += '\n'
        }

        archive.append(txt, { name: 'MISSING.txt' })
      }

      // Finalize after all entries are queued
      archive.finalize()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
    },
  })
}
