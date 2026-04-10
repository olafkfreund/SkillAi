'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { db, withTenant } from '@/db'
import {
  interviewPacks,
  interviewQuestions,
  codeChallenges,
  candidates,
  roles,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { extractCvProfile } from '@/lib/ai/interview'
import { generateQuestions } from '@/lib/ai/interview'
import { inferExperienceLevel, inferLanguage } from '@/lib/ai/interview-helpers'
import { getActionContext } from '@/lib/auth/action-context'

const CreatePackSchema = z.object({
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
  includeCodeChallenge: z.boolean().default(false),
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
  })
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { candidateId, roleId, includeCodeChallenge } = parsed.data

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
      createdBy: userId,
    })
  })

  // Schedule generation to run after response is sent (Next.js after() guarantees completion)
  after(async () => {
    await _generateInterviewPack(packId, tenantId, includeCodeChallenge).catch((err) => {
      console.error('Interview pack generation error (after):', err)
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

  after(async () => {
    await _generateInterviewPack(packId, tenantId, pack.includesCodeChallenge).catch((err) => {
      console.error('Interview pack retry error (after):', err)
    })
  })

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

  // Verify question belongs to tenant via pack
  const [question] = await db
    .select({ packId: interviewQuestions.packId })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, questionId))
    .limit(1)
  if (!question) return { success: false, error: 'Question not found' }

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx.select({ id: interviewPacks.id })
      .from(interviewPacks).where(eq(interviewPacks.id, question.packId)).limit(1)
  )
  if (!pack) return { success: false, error: 'Forbidden' }

  await db
    .update(interviewQuestions)
    .set({ notes })
    .where(eq(interviewQuestions.id, questionId))

  return { success: true }
}

// -- Background pipeline --

async function _generateInterviewPack(
  packId: string,
  tenantId: string,
  includeCodeChallenge: boolean
): Promise<void> {
  await withTenant(tenantId, async (tx) =>
    tx.update(interviewPacks)
      .set({ generationStatus: 'processing', updatedAt: new Date() })
      .where(eq(interviewPacks.id, packId))
  )

  try {
    const [pack] = await withTenant(tenantId, async (tx) =>
      tx.select().from(interviewPacks).where(eq(interviewPacks.id, packId)).limit(1)
    )
    const [candidate] = await withTenant(tenantId, async (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, pack.candidateId)).limit(1)
    )
    const [role] = await withTenant(tenantId, async (tx) =>
      tx.select().from(roles).where(eq(roles.id, pack.roleId)).limit(1)
    )

    // Stage 1: Extract CV profile
    const cvProfile = await extractCvProfile(candidate.cvText)

    // Stage 2: Generate questions
    const language = inferLanguage(cvProfile.technical_skills)
    const result = await generateQuestions(cvProfile, role, { includeCodeChallenge, language })

    // Insert questions
    await withTenant(tenantId, async (tx) => {
      const questionValues = result.questions.map((q, i) => ({
        packId,
        questionType: q.question_type,
        difficulty: q.difficulty,
        questionText: q.question_text,
        rationale: q.rationale,
        followUps: q.follow_ups,
        strongAnswerSignals: q.strong_answer_signals,
        acceptableAnswerSignals: q.acceptable_answer_signals,
        weakAnswerSignals: q.weak_answer_signals,
        cvReferences: q.cv_references,
        orderIndex: i,
      }))

      await tx.insert(interviewQuestions).values(questionValues)

      if (result.code_challenge) {
        const cc = result.code_challenge
        await tx.insert(codeChallenges).values({
          packId,
          title: cc.title,
          problemDescription: cc.problem_description,
          starterCode: cc.starter_code,
          language: cc.language,
          unitTests: cc.unit_tests,
          evaluationCriteria: cc.evaluation_criteria,
          estimatedMinutes: cc.estimated_minutes,
        })
      }

      await tx.update(interviewPacks).set({
        generationStatus: 'complete',
        experienceLevel: result.experience_level,
        recommendedDurationMinutes: result.recommended_duration_minutes,
        includesCodeChallenge: !!result.code_challenge,
        updatedAt: new Date(),
      }).where(eq(interviewPacks.id, packId))
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await withTenant(tenantId, async (tx) =>
      tx.update(interviewPacks).set({
        generationStatus: 'failed',
        errorMessage: message,
        updatedAt: new Date(),
      }).where(eq(interviewPacks.id, packId))
    )
    console.error(`Interview pack generation failed for ${packId}:`, message)
  }
}
