/**
 * Claude-powered interview transcript analysis
 *
 * analyzeTranscriptWithClaude — calls Claude tool_use, validates output
 * triggerTranscriptAnalysis   — background job: fetch → analyse → write DB
 *
 * The system prompt (role context + questions) is cached with ephemeral
 * prompt caching to reduce costs when re-analysing the same role.
 */

import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { interviewTranscripts, transcriptAnalyses, roles, interviewQuestions } from '@/db/schema'
import {
  TranscriptAnalysisSchema,
  TRANSCRIPT_ANALYSIS_TOOL,
  type TranscriptAnalysis,
} from './transcript-schemas'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Match the resilience config used by other AI calls in the codebase —
  // built-in exponential backoff handles transient network blips and
  // 429/529/500 responses that would otherwise surface as "Connection error".
  maxRetries: 3,
  timeout: 120_000,
})

type PackQuestion = {
  questionText: string
  strongAnswerSignals: string[]
}

type AnalysisInput = {
  transcriptText: string
  roleTitle: string
  roleDescription: string
  roleRequirements: string
  packQuestions?: PackQuestion[]
}

export async function analyzeTranscriptWithClaude(
  input: AnalysisInput
): Promise<TranscriptAnalysis> {
  const questionsBlock =
    input.packQuestions && input.packQuestions.length > 0
      ? `\n\nINTERVIEW QUESTIONS (score responses against these):\n${input.packQuestions
          .map(
            (q, i) =>
              `Q${i + 1}: ${q.questionText}\n  Strong signals: ${q.strongAnswerSignals.join(', ')}`
          )
          .join('\n')}`
      : ''

  const systemPrompt = `You are an expert interview assessor. Analyse the interview transcript and score the candidate's performance.

ROLE: ${input.roleTitle}

REQUIREMENTS:
${input.roleRequirements}

DESCRIPTION:
${input.roleDescription}${questionsBlock}

Score 4 dimensions:
- communication: clarity, fluency, confidence, listening
- technical_depth: accuracy, depth, concrete examples
- problem_solving: structure, approach, adaptability
- social_fit: collaboration language, humility, team-first framing

${input.packQuestions?.length ? 'Map transcript excerpts to each interview question and score quality (strong/acceptable/weak).' : 'Provide overall assessment without per-question breakdown.'}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [TRANSCRIPT_ANALYSIS_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            // Role context cached — same role may be analysed many times
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `TRANSCRIPT:\n${input.transcriptText}\n\nUse the submit_transcript_analysis tool to return your structured assessment.`,
          },
        ],
      },
    ],
  })

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolBlock) {
    throw new Error('Claude did not return a tool_use response')
  }

  const parsed = TranscriptAnalysisSchema.safeParse(toolBlock.input)
  if (!parsed.success) {
    throw new Error(`Claude response failed schema validation: ${parsed.error.message}`)
  }

  return parsed.data
}

export async function triggerTranscriptAnalysis(
  transcriptId: string,
  tenantId: string
): Promise<void> {
  // Mark as analyzing
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(interviewTranscripts)
      .set({ analysisStatus: 'analyzing', updatedAt: new Date() })
      .where(eq(interviewTranscripts.id, transcriptId))
  })

  try {
    // Fetch transcript record
    const [transcript] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(interviewTranscripts)
        .where(eq(interviewTranscripts.id, transcriptId))
        .limit(1)
    )
    if (!transcript) throw new Error(`Transcript ${transcriptId} not found`)

    // Fetch role
    const [role] = await withTenant(tenantId, async (tx) =>
      tx.select().from(roles).where(eq(roles.id, transcript.roleId)).limit(1)
    )
    if (!role) throw new Error(`Role ${transcript.roleId} not found`)

    // Fetch pack questions if linked
    let packQuestions: PackQuestion[] | undefined
    if (transcript.packId) {
      const questions = await withTenant(tenantId, async (tx) =>
        tx
          .select({
            questionText: interviewQuestions.questionText,
            strongAnswerSignals: interviewQuestions.strongAnswerSignals,
          })
          .from(interviewQuestions)
          .where(eq(interviewQuestions.packId, transcript.packId!))
      )
      if (questions.length > 0) {
        packQuestions = questions.map((q) => ({
          questionText: q.questionText,
          strongAnswerSignals: q.strongAnswerSignals ?? [],
        }))
      }
    }

    const result = await analyzeTranscriptWithClaude({
      transcriptText: transcript.rawTranscriptText,
      roleTitle: role.title,
      roleDescription: role.description,
      roleRequirements: role.requirements,
      packQuestions,
    })

    // Write analysis result (upsert to support re-analysis)
    const analysisValues = {
      tenantId,
      transcriptId,
      overallScore: result.overall_score,
      communicationScore: result.dimensions.communication.score,
      technicalDepthScore: result.dimensions.technical_depth.score,
      problemSolvingScore: result.dimensions.problem_solving.score,
      socialFitScore: result.dimensions.social_fit.score,
      communicationReasoning: result.dimensions.communication.reasoning,
      technicalDepthReasoning: result.dimensions.technical_depth.reasoning,
      problemSolvingReasoning: result.dimensions.problem_solving.reasoning,
      socialFitReasoning: result.dimensions.social_fit.reasoning,
      summary: result.summary,
      strengths: result.strengths,
      redFlags: result.red_flags,
      recommendedDecision: result.recommended_decision,
      questionResponses: result.question_responses.map((qr) => ({
        questionText: qr.question_text,
        transcriptExcerpt: qr.transcript_excerpt,
        quality: qr.quality,
        notes: qr.notes,
      })),
    }

    await withTenant(tenantId, async (tx) => {
      await tx
        .insert(transcriptAnalyses)
        .values(analysisValues)
        .onConflictDoUpdate({
          target: transcriptAnalyses.transcriptId,
          set: analysisValues,
        })
    })

    // Mark complete
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(interviewTranscripts)
        .set({ analysisStatus: 'complete', errorMessage: null, updatedAt: new Date() })
        .where(eq(interviewTranscripts.id, transcriptId))
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(interviewTranscripts)
        .set({ analysisStatus: 'failed', errorMessage: message, updatedAt: new Date() })
        .where(eq(interviewTranscripts.id, transcriptId))
    })
    console.error(`Transcript analysis failed for ${transcriptId}:`, message)
  }
}
