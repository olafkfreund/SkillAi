'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidateEnrichments } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import type {
  VerifiedProfile,
  RejectedUrl,
} from '@/db/schema/candidate-enrichments'

// ─── Recruiter confirm/dismiss actions ───────────────────────────────────────

export async function confirmProfile(
  candidateId: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { ok: false, error: 'Forbidden' }
  }

  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        verifiedProfiles: candidateEnrichments.verifiedProfiles,
      })
      .from(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))
      .limit(1)
  )
  if (!row) return { ok: false, error: 'No enrichment record' }

  const list: VerifiedProfile[] = Array.isArray(row.verifiedProfiles)
    ? (row.verifiedProfiles as VerifiedProfile[])
    : []
  const idx = list.findIndex((p) => p.url === url)
  if (idx === -1) return { ok: false, error: 'Profile not found in verified list' }

  const verifiedAt = new Date().toISOString()
  const updated: VerifiedProfile = {
    ...list[idx],
    verifiedBy: 'recruiter',
    verifiedAt,
  }
  const next = [...list]
  next[idx] = updated

  await withTenant(tenantId, (tx) =>
    tx
      .update(candidateEnrichments)
      .set({ verifiedProfiles: next })
      .where(eq(candidateEnrichments.candidateId, candidateId))
  )

  await writeAuditLog(tenantId, {
    action: 'candidate.profile_confirmed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { url, source: updated.source, confidence: updated.confidence },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { ok: true }
}

export async function dismissProfile(
  candidateId: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { ok: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { ok: false, error: 'Forbidden' }
  }

  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        verifiedProfiles: candidateEnrichments.verifiedProfiles,
        rejectedUrls: candidateEnrichments.rejectedUrls,
      })
      .from(candidateEnrichments)
      .where(eq(candidateEnrichments.candidateId, candidateId))
      .limit(1)
  )
  if (!row) return { ok: false, error: 'No enrichment record' }

  const verified: VerifiedProfile[] = Array.isArray(row.verifiedProfiles)
    ? (row.verifiedProfiles as VerifiedProfile[])
    : []
  const rejected: RejectedUrl[] = Array.isArray(row.rejectedUrls)
    ? (row.rejectedUrls as RejectedUrl[])
    : []

  const idx = verified.findIndex((p) => p.url === url)
  // Capture source/reason before removal so we can record it on the rejection.
  const removed = idx >= 0 ? verified[idx] : null
  const nextVerified = idx >= 0 ? verified.filter((_, i) => i !== idx) : verified

  // Avoid duplicating an existing rejection.
  const alreadyRejected = rejected.some((r) => r.url === url)
  const nextRejected: RejectedUrl[] = alreadyRejected
    ? rejected
    : [
        ...rejected,
        {
          source: removed?.source ?? 'web',
          url,
          reason: 'dismissed by recruiter',
          rejectedAt: new Date().toISOString(),
        },
      ]

  await withTenant(tenantId, (tx) =>
    tx
      .update(candidateEnrichments)
      .set({ verifiedProfiles: nextVerified, rejectedUrls: nextRejected })
      .where(eq(candidateEnrichments.candidateId, candidateId))
  )

  await writeAuditLog(tenantId, {
    action: 'candidate.profile_dismissed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { url, source: removed?.source ?? 'web' },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { ok: true }
}
