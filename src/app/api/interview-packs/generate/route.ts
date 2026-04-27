import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/auth/require-role'
import type { UserRole } from '@/lib/auth/types'
import { withTenant } from '@/db'
import {
  interviewPacks,
  interviewQuestions,
  codeChallenges,
  candidates,
  roles,
} from '@/db/schema'
import { generateQuestions } from '@/lib/ai/interview'
import { getOrExtractCvProfile } from '@/lib/ai/cv-profile'
import { inferLanguage } from '@/lib/ai/interview-helpers'
import { writeAuditLog } from '@/lib/audit'

export const maxDuration = 300

const GenerateSchema = z.object({
  packId: z.string().uuid(),
  includeCodeChallenge: z.boolean().default(false),
})

async function setStage(tenantId: string, packId: string, stage: string) {
  await withTenant(tenantId, async (tx) =>
    tx.update(interviewPacks)
      .set({ generationStage: stage, updatedAt: new Date() })
      .where(eq(interviewPacks.id, packId))
  )
}

async function failPack(tenantId: string, packId: string, message: string) {
  await withTenant(tenantId, async (tx) =>
    tx.update(interviewPacks).set({
      generationStatus: 'failed',
      generationStage: null,
      errorMessage: message,
      updatedAt: new Date(),
    }).where(eq(interviewPacks.id, packId))
  )
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  // Role check — only recruiters and admins can trigger generation
  try {
    requireRole((session.user as { role?: UserRole }).role, 'recruiter')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate request body
  const body = await request.json().catch(() => null)
  const parsed = GenerateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { packId, includeCodeChallenge } = parsed.data

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx.select().from(interviewPacks).where(eq(interviewPacks.id, packId)).limit(1)
  )
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 })
  }

  // Idempotency guard — prevent duplicate generation
  if (pack.generationStatus === 'processing') {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
  }
  if (pack.generationStatus === 'complete') {
    return NextResponse.json({ error: 'Pack already generated' }, { status: 409 })
  }

  await withTenant(tenantId, async (tx) =>
    tx.update(interviewPacks)
      .set({ generationStatus: 'processing', generationStage: 'Loading candidate and role data…', updatedAt: new Date() })
      .where(eq(interviewPacks.id, packId))
  )

  try {
    const [candidate] = await withTenant(tenantId, async (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, pack.candidateId)).limit(1)
    )
    if (!candidate) {
      await failPack(tenantId, packId, 'Candidate not found — may have been deleted')
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    const [role] = await withTenant(tenantId, async (tx) =>
      tx.select().from(roles).where(eq(roles.id, pack.roleId)).limit(1)
    )
    if (!role) {
      await failPack(tenantId, packId, 'Role not found — may have been deleted')
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    // Stage 1: Extract CV profile (or use cached from candidate upload)
    await setStage(tenantId, packId, 'Analysing CV with AI — extracting skills and experience…')
    const cvProfile = await getOrExtractCvProfile(candidate.id, tenantId, candidate.cvText)

    // Stage 2: Generate questions
    await setStage(tenantId, packId, pack.packType === 'pre_screening'
      ? 'Generating 5 pre-screening questions…'
      : 'Generating personalised interview questions…')
    const language = inferLanguage(cvProfile.technical_skills)
    const result = await generateQuestions(
      cvProfile,
      role,
      {
        includeCodeChallenge,
        language,
        packType: pack.packType,
      },
      tenantId,
      { candidateId: pack.candidateId, roleId: pack.roleId, packId }
    )

    // Stage 3: Save results
    await setStage(tenantId, packId, 'Saving interview pack…')
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
        generationStage: null,
        experienceLevel: result.experience_level,
        recommendedDurationMinutes: result.recommended_duration_minutes,
        includesCodeChallenge: !!result.code_challenge,
        updatedAt: new Date(),
      }).where(eq(interviewPacks.id, packId))
    })

    writeAuditLog(tenantId, {
      action: 'interview_pack.completed',
      entityType: 'interview_pack',
      entityId: packId,
      metadata: {
        questionCount: result.questions.length,
        experienceLevel: result.experience_level,
        includesCodeChallenge: !!result.code_challenge,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await failPack(tenantId, packId, message)

    writeAuditLog(tenantId, {
      action: 'interview_pack.failed',
      entityType: 'interview_pack',
      entityId: packId,
      metadata: { error: message },
    }).catch(() => {})

    console.error(`Interview pack generation failed for ${packId}:`, message)
    // Return generic error to client — full details logged server-side
    return NextResponse.json({ error: 'Interview pack generation failed' }, { status: 500 })
  }
}
