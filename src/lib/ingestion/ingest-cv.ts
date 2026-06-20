/**
 * Session-less CV ingestion (issue #4 / Epic #3, Phase 1).
 *
 * Mirrors the bulk-upload API route's pipeline but takes a tenantId + Buffer
 * directly instead of an authenticated request, so it can be driven by the
 * host-folder worker (no HTTP session available). The Web `File` wrapper lets
 * us reuse the exact validation in @/lib/cv/store rather than duplicating the
 * MIME / magic-byte / size checks.
 *
 * When `roleId` is provided a pending score row is created and scoring is
 * triggered; inbox drops are role-less archive intake, so they skip scoring and
 * just run embedding + CV-profile extraction (same background steps the API
 * route runs via `after()`).
 */

import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, scores } from '@/db/schema'
import { validateCvFile, parseCvBuffer, persistCvFile } from '@/lib/cv/store'
import { triggerScoring } from '@/lib/ai/scoring'

export type IngestCvResult =
  | { ok: true; candidateId: string; name: string }
  | { ok: false; error: string }

/** Derive a (firstName, lastName) guess from the CV filename. */
export function deriveNameFromFilename(originalName: string): { firstName: string; lastName: string } {
  const baseName = originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  const parts = baseName.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || 'Unknown',
    lastName: parts.slice(1).join(' ') || 'Candidate',
  }
}

export async function ingestCvFile(params: {
  tenantId: string
  buffer: Buffer
  originalName: string
  agencyId?: string | null
  roleId?: string | null
}): Promise<IngestCvResult> {
  const { tenantId, buffer, originalName, agencyId = null, roleId = null } = params

  // Reuse the canonical validation (size, extension/MIME, magic bytes).
  // A Node Buffer isn't a valid BlobPart under the DOM lib types — wrap it in a
  // Uint8Array (Buffer is a subclass, so this is a cheap view-compatible copy).
  const file = new File([new Uint8Array(buffer)], originalName)
  const validated = await validateCvFile(file)
  if (!validated.ok) return { ok: false, error: validated.error }
  const { fileType, buffer: validatedBuffer } = validated

  let cvText: string
  try {
    ;({ cvText } = await parseCvBuffer(validatedBuffer, fileType))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to extract text from CV' }
  }

  const { firstName, lastName } = deriveNameFromFilename(originalName)
  const { filePath } = await persistCvFile(tenantId, validatedBuffer, fileType)
  const candidateId = randomUUID()

  await withTenant(tenantId, async (tx) => {
    await tx.insert(candidates).values({
      id: candidateId,
      tenantId,
      agencyId,
      firstName,
      lastName,
      email: null,
      phone: null,
      cvText,
      filePath,
      fileType,
    })

    if (roleId) {
      await tx.insert(scores).values({ tenantId, candidateId, roleId, scoreStatus: 'pending' })
    }
  })

  // Scoring only makes sense against a role.
  if (roleId) {
    triggerScoring(candidateId, roleId, tenantId).catch((e) => console.error('[ingest] scoring failed', e))
  }

  // Background enrichment — embedding + CV-profile extraction. The worker has no
  // request lifecycle, so we run these as a detached promise (fire-and-forget).
  void (async () => {
    try {
      const { generateEmbedding } = await import('@/lib/ai/embeddings')
      const embedding = await generateEmbedding(cvText, tenantId)
      if (embedding) {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(candidates)
            .set({ embedding: JSON.stringify(embedding) })
            .where(eq(candidates.id, candidateId))
        })
      }
    } catch (e) {
      console.error('[ingest] embedding failed for', candidateId, e)
    }
    try {
      const { triggerCvProfileExtraction } = await import('@/lib/ai/cv-profile')
      await triggerCvProfileExtraction(candidateId, tenantId)
    } catch (e) {
      console.error('[ingest] cv-profile extraction failed for', candidateId, e)
    }
  })()

  return { ok: true, candidateId, name: `${firstName} ${lastName}` }
}
