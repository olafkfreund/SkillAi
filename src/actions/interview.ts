'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { withTenant } from '@/db'
import {
  interviewPacks,
  interviewQuestions,
  candidates,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { inferExperienceLevel } from '@/lib/ai/interview-helpers'
import { getActionContext } from '@/lib/auth/action-context'

const CreatePackSchema = z.object({
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
  includeCodeChallenge: z.boolean().default(false),
  packType: z.enum(['full', 'pre_screening']).default('full'),
})

export type CreatePackState =
  | { success: true; packId: string }
  | { success: false; error: string }

export async function createInterviewPack(
  _prev: CreatePackState | null,
  formData: FormData
): Promise<CreatePackState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'recruiter') } catch {
    return { success: false, error: 'Forbidden' }
  }

  const parsed = CreatePackSchema.safeParse({
    candidateId: formData.get('candidateId'),
    roleId: formData.get('roleId'),
    includeCodeChallenge: formData.get('includeCodeChallenge') === 'true',
    packType: formData.get('packType') || 'full',
  })
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { candidateId, roleId, packType } = parsed.data
  // Pre-screening never includes code challenge
  const includeCodeChallenge = packType === 'pre_screening' ? false : parsed.data.includeCodeChallenge

  // Verify candidate belongs to this tenant
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  )
  if (!candidate) return { success: false, error: 'Candidate not found' }

  const packId = randomUUID()

  // Infer experience level from CV text
  const experienceLevel = inferExperienceLevel(candidate.cvText)

  await withTenant(tenantId, async (tx) => {
    await tx.insert(interviewPacks).values({
      id: packId,
      tenantId,
      candidateId,
      roleId,
      generationStatus: 'pending',
      experienceLevel,
      includesCodeChallenge: includeCodeChallenge,
      packType,
      createdBy: userId,
    })
  })

  return { success: true, packId }
}

export async function retryInterviewPack(packId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'recruiter') } catch {
    return { success: false, error: 'Forbidden' }
  }

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx.select().from(interviewPacks).where(
      and(eq(interviewPacks.id, packId), eq(interviewPacks.tenantId, tenantId))
    ).limit(1)
  )
  if (!pack) return { success: false, error: 'Pack not found' }
  if (pack.generationStatus === 'complete') return { success: false, error: 'Pack already complete' }

  await withTenant(tenantId, async (tx) =>
    tx.update(interviewPacks).set({ generationStatus: 'pending', errorMessage: null, updatedAt: new Date() })
      .where(eq(interviewPacks.id, packId))
  )

  revalidatePath(`/dashboard/candidates/${pack.candidateId}/interview/${packId}`)
  return { success: true }
}

export async function deleteInterviewPack(packId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'recruiter') } catch {
    return { success: false, error: 'Forbidden' }
  }

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx.select({ candidateId: interviewPacks.candidateId })
      .from(interviewPacks).where(eq(interviewPacks.id, packId)).limit(1)
  )
  if (!pack) return { success: false, error: 'Pack not found' }

  await withTenant(tenantId, async (tx) => {
    await tx.delete(interviewPacks).where(eq(interviewPacks.id, packId))
  })

  revalidatePath(`/dashboard/candidates/${pack.candidateId}`)
  return { success: true }
}

export async function updateQuestionNotes(
  questionId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId } = ctx

  // Verify question belongs to tenant via pack (all queries within tenant context)
  const [question] = await withTenant(tenantId, async (tx) =>
    tx.select({ id: interviewQuestions.id, packId: interviewQuestions.packId })
      .from(interviewQuestions)
      .innerJoin(interviewPacks, eq(interviewQuestions.packId, interviewPacks.id))
      .where(eq(interviewQuestions.id, questionId))
      .limit(1)
  )
  if (!question) return { success: false, error: 'Question not found' }

  await withTenant(tenantId, async (tx) =>
    tx.update(interviewQuestions)
      .set({ notes })
      .where(eq(interviewQuestions.id, questionId))
  )

  return { success: true }
}

