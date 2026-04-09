'use server'

import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { db, withTenant } from '@/db'
import { candidates, scores } from '@/db/schema'
import { parseFile, ParseError } from '@/lib/parsers'
import { triggerScoring } from '@/lib/ai/scoring'
import { requireRole } from '@/lib/auth/require-role'
import type { FileType } from '@/lib/parsers'
import type { UserRole } from '@/lib/auth/types'
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
})

export type CreateCandidateState =
  | { success: true; candidateId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createCandidate(
  _prev: CreateCandidateState | null,
  formData: FormData
): Promise<CreateCandidateState> {
  // -- Auth context from middleware headers --
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')
  const userRole = headersList.get('x-user-role')

  if (!tenantId || !userId) {
    return { success: false, error: 'Unauthorized' }
  }
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
  const uploadBase = process.env.UPLOAD_DIR
    ? join(process.cwd(), process.env.UPLOAD_DIR)
    : join(process.cwd(), 'uploads')
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
    })

    await tx.insert(scores).values({
      tenantId,
      candidateId,
      roleId: parsed.data.roleId,
      scoreStatus: 'pending',
    })
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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) throw new Error('Unauthorized')

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ status })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  revalidatePath(`/dashboard/candidates/${candidateId}`)
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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return { success: false, error: 'Unauthorized' }

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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return { success: false, error: 'Unauthorized' }

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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) throw new Error('Unauthorized')

  requireRole(userRole ?? undefined, 'recruiter')

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(candidates)
      .set({ isActive: false })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  })

  redirect('/dashboard/candidates')
}
