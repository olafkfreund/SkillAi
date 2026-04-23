'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { eq, and, inArray, or, ilike, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, withTenant } from '@/db'
import { candidates, scores } from '@/db/schema'
import { ParseError } from '@/lib/parsers'
import { triggerScoring } from '@/lib/ai/scoring'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import { validateCvFile, parseCvBuffer, persistCvFile } from '@/lib/cv/store'
import type { CandidateStatus } from '@/db/schema/candidates'

const CreateCandidateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().optional(),
  roleId: z.string().uuid(),
})

export type CreateCandidateState =
  | { success: true; candidateId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createCandidate(
  _prev: CreateCandidateState | null,
  formData: FormData
): Promise<CreateCandidateState> {
  // -- Auth context from middleware headers --
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  if (userRole === 'viewer') {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // -- Validate form fields --
  const parsed = CreateCandidateSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email') || undefined,
    phone: formData.get('phone') || undefined,
    agencyId: formData.get('agencyId') || undefined,
    roleId: formData.get('roleId'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // -- Validate uploaded file --
  const file = formData.get('cvFile') as File | null
  if (!file || file.size === 0) {
    return { success: false, error: 'CV file is required' }
  }

  const validated = await validateCvFile(file)
  if (!validated.ok) {
    return { success: false, error: validated.error }
  }
  const { fileType, buffer } = validated

  // -- Parse CV text --
  let cvText: string
  try {
    ;({ cvText } = await parseCvBuffer(buffer, fileType))
  } catch (err) {
    if (err instanceof ParseError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: 'Failed to extract text from CV' }
  }

  // -- Store file on disk --
  const { filePath } = await persistCvFile(tenantId, buffer, fileType)

  // -- Insert candidate + pending score within tenant RLS context --
  const candidateId = randomUUID()

  await withTenant(tenantId, async (tx) => {
    await tx.insert(candidates).values({
      id: candidateId,
      tenantId,
      agencyId: parsed.data.agencyId ?? null,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      cvText,
      filePath,
      fileType,
    })

    await tx.insert(scores).values({
      tenantId,
      candidateId,
      roleId: parsed.data.roleId,
      scoreStatus: 'pending',
    })
  })

  // Audit: candidate created
  await writeAuditLog(tenantId, {
    action: 'candidate.created',
    entityType: 'candidate',
    entityId: candidateId,
    entityLabel: `${parsed.data.firstName} ${parsed.data.lastName}`,
  })

  // Fire-and-forget scoring (non-blocking)
  triggerScoring(candidateId, parsed.data.roleId, tenantId).catch(console.error)

  // Fire-and-forget embedding generation (non-blocking, after response is sent)
  after(async () => {
    try {
      const { generateEmbedding } = await import('@/lib/ai/embeddings')
      const embedding = await generateEmbedding(cvText, tenantId)
      if (embedding) {
        await withTenant(tenantId, async (tx) => {
          await tx.update(candidates).set({ embedding: JSON.stringify(embedding) }).where(eq(candidates.id, candidateId))
        })
      }
    } catch (err) {
      console.error('[embedding] Failed to generate embedding for candidate:', candidateId, err)
    }
  })

  return { success: true, candidateId }
}

// ---------------------------------------------------------------------------
// updateCandidateStatus — move candidate through the hiring pipeline
// ---------------------------------------------------------------------------

export { type CandidateStatus }

export async function updateCandidateStatus(
  candidateId: string,
  status: CandidateStatus
): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ status })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  // Audit: status changed
  await writeAuditLog(tenantId, {
    action: 'candidate.status_changed',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: { newStatus: status },
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
}

// ---------------------------------------------------------------------------
// bulkUpdateCandidateStatus — update status for multiple candidates at once
// ---------------------------------------------------------------------------

const VALID_STATUSES: CandidateStatus[] = [
  'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected',
]

export async function bulkUpdateCandidateStatus(
  candidateIds: string[],
  status: CandidateStatus
): Promise<{ success: boolean; updated: number; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, updated: 0, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, updated: 0, error: 'Forbidden: recruiters and admins only' }
  }

  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return { success: false, updated: 0, error: 'No candidates selected' }
  }

  if (candidateIds.length > 200) {
    return { success: false, updated: 0, error: 'Cannot update more than 200 candidates at once' }
  }

  if (!VALID_STATUSES.includes(status)) {
    return { success: false, updated: 0, error: `Invalid status: ${status}` }
  }

  const result = await withTenant(tenantId, async (tx) => {
    const updated = await tx
      .update(candidates)
      .set({ status })
      .where(
        and(
          inArray(candidates.id, candidateIds),
          eq(candidates.tenantId, tenantId)
        )
      )
      .returning({ id: candidates.id })

    return updated.length
  })

  revalidatePath('/dashboard/candidates')
  return { success: true, updated: result }
}

// ---------------------------------------------------------------------------
// updateCandidateDetails — edit name / contact info for a candidate
// ---------------------------------------------------------------------------

const UpdateCandidateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().nullable().optional(),
})

export type UpdateCandidateState = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function updateCandidateDetails(
  candidateId: string,
  _prev: UpdateCandidateState | null,
  formData: FormData
): Promise<UpdateCandidateState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  const rawAgencyId = formData.get('agencyId')
  const parsed = UpdateCandidateSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email') || undefined,
    phone: formData.get('phone') || undefined,
    agencyId: rawAgencyId === '' || rawAgencyId === null ? null : rawAgencyId,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        ...(parsed.data.agencyId !== undefined ? { agencyId: parsed.data.agencyId } : {}),
      })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// updateCandidateAgency — assign or remove a candidate's agency
// ---------------------------------------------------------------------------

export async function updateCandidateAgency(
  candidateId: string,
  agencyId: string | null
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ agencyId })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// archiveCandidate — soft-delete a candidate by setting isActive=false
// ---------------------------------------------------------------------------

export async function archiveCandidate(candidateId: string): Promise<void> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Unauthorized')
  const { tenantId, userRole } = ctx

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ isActive: false })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  // Audit: candidate archived
  await writeAuditLog(tenantId, {
    action: 'candidate.archived',
    entityType: 'candidate',
    entityId: candidateId,
  })

  redirect('/dashboard/candidates')
}

// ---------------------------------------------------------------------------
// searchCandidatesForRole — find active candidates not yet scored for a role
// ---------------------------------------------------------------------------

export type CandidateSearchResult = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  status: string
}

export async function searchCandidatesForRole(
  roleId: string,
  query: string
): Promise<CandidateSearchResult[]> {
  const ctx = await getActionContext()
  if (!ctx) return []

  const { tenantId } = ctx
  const trimmed = query.trim()
  if (trimmed.length < 1) return []

  // Subquery: candidate IDs already scored for this role
  const alreadyScoredSubquery = db
    .select({ candidateId: scores.candidateId })
    .from(scores)
    .where(eq(scores.roleId, roleId))

  const results = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        status: candidates.status,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.tenantId, tenantId),
          eq(candidates.isActive, true),
          or(
            ilike(candidates.firstName, `%${trimmed}%`),
            ilike(candidates.lastName, `%${trimmed}%`),
            ilike(candidates.email, `%${trimmed}%`)
          ),
          notInArray(candidates.id, alreadyScoredSubquery)
        )
      )
      .orderBy(candidates.lastName, candidates.firstName)
      .limit(20)
  )

  return results
}
