'use server'

import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { eq, and, inArray, or, ilike, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, withTenant } from '@/db'
import { candidates, scores } from '@/db/schema'
import { parseFile, ParseError } from '@/lib/parsers'
import { triggerScoring } from '@/lib/ai/scoring'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import type { FileType } from '@/lib/parsers'
import type { CandidateStatus } from '@/db/schema/candidates'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
}

const EXT_TO_TYPE: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.odt': 'odt',
  '.rtf': 'rtf',
  '.txt': 'txt',
  '.md': 'md',
}

const CreateCandidateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().optional(),
  roleId: z.string().uuid(),
  country: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  languagesSpoken: z.string().optional().or(z.literal('')),
  willingToRelocate: z.enum(['true', 'false', '']).optional(),
  candidateRate: z.coerce.number().min(0).optional().or(z.literal('')),
  customerRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).toUpperCase().optional().or(z.literal('')),
}).refine(
  (data) => {
    const hasRate = (typeof data.candidateRate === 'number') || (typeof data.customerRate === 'number')
    if (hasRate && (!data.rateCurrency || data.rateCurrency === '')) return false
    return true
  },
  { message: 'Currency is required when a rate is set', path: ['rateCurrency'] }
)

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
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File exceeds 10 MB limit' }
  }

  // Determine file type from MIME or extension
  let fileType: FileType | undefined =
    ACCEPTED_TYPES[file.type] ??
    EXT_TO_TYPE[extname(file.name).toLowerCase()]

  if (!fileType) {
    return { success: false, error: `Unsupported file type: ${file.type || extname(file.name)}` }
  }

  // -- Parse CV text --
  const buffer = Buffer.from(await file.arrayBuffer())
  let cvText: string
  try {
    cvText = await parseFile(buffer, fileType)
    // Strip null bytes and other non-printable control characters PostgreSQL rejects
    cvText = cvText.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
  } catch (err) {
    if (err instanceof ParseError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: 'Failed to extract text from CV' }
  }

  // -- Store file on disk --
  const envDir = process.env.UPLOAD_DIR ?? 'uploads'
  const uploadBase = envDir.startsWith('/') ? envDir : join(process.cwd(), envDir)
  const uploadDir = join(uploadBase, tenantId)
  await mkdir(uploadDir, { recursive: true })
  const fileId = randomUUID()
  const fileName = `${fileId}.${fileType}`
  const filePath = join(uploadDir, fileName)
  await writeFile(filePath, buffer)

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
      filePath: `/uploads/${tenantId}/${fileName}`,
      fileType,
      country: parsed.data.country || null,
      city: parsed.data.city || null,
      languagesSpoken: parsed.data.languagesSpoken
        ? parsed.data.languagesSpoken.split(',').map((l) => l.trim()).filter(Boolean)
        : [],
      willingToRelocate: parsed.data.willingToRelocate === 'true' ? true : parsed.data.willingToRelocate === 'false' ? false : null,
      candidateRate: typeof parsed.data.candidateRate === 'number' ? String(parsed.data.candidateRate) : null,
      customerRate: typeof parsed.data.customerRate === 'number' ? String(parsed.data.customerRate) : null,
      rateCurrency: parsed.data.rateCurrency || null,
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
  country: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  languagesSpoken: z.string().optional().or(z.literal('')),
  willingToRelocate: z.enum(['true', 'false', '']).optional(),
  candidateRate: z.coerce.number().min(0).optional().or(z.literal('')),
  customerRate: z.coerce.number().min(0).optional().or(z.literal('')),
  rateCurrency: z.string().max(3).toUpperCase().optional().or(z.literal('')),
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
    country: formData.get('country') || undefined,
    city: formData.get('city') || undefined,
    languagesSpoken: formData.get('languagesSpoken') || undefined,
    willingToRelocate: formData.get('willingToRelocate') || undefined,
    candidateRate: formData.get('candidateRate') || undefined,
    customerRate: formData.get('customerRate') || undefined,
    rateCurrency: formData.get('rateCurrency') || undefined,
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
        country: parsed.data.country || null,
        city: parsed.data.city || null,
        languagesSpoken: parsed.data.languagesSpoken
          ? parsed.data.languagesSpoken.split(',').map((l) => l.trim()).filter(Boolean)
          : [],
        willingToRelocate: parsed.data.willingToRelocate === 'true' ? true : parsed.data.willingToRelocate === 'false' ? false : null,
        candidateRate: typeof parsed.data.candidateRate === 'number' ? String(parsed.data.candidateRate) : null,
        customerRate: typeof parsed.data.customerRate === 'number' ? String(parsed.data.customerRate) : null,
        rateCurrency: parsed.data.rateCurrency || null,
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

  // Escape LIKE metacharacters to prevent wildcard injection
  const safeTrimmed = trimmed.replace(/[%_\\]/g, '\\$&')

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
            ilike(candidates.firstName, `%${safeTrimmed}%`),
            ilike(candidates.lastName, `%${safeTrimmed}%`),
            ilike(candidates.email, `%${safeTrimmed}%`)
          ),
          notInArray(candidates.id, alreadyScoredSubquery)
        )
      )
      .orderBy(candidates.lastName, candidates.firstName)
      .limit(20)
  )

  return results
}
