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
import { formatManagerPriorities } from './priorities'
import {
  SUPPORTED_LANGUAGES,
  formatLanguageDirective,
  isSupportedLanguage,
  type SupportedLanguage,
} from './language'
import { logAiUsage, anthropicUsageToInput } from './usage-logger'
import { resolveAnthropicKey } from './keys'
import { loadHrSkill } from '@/lib/ai/skills'
import { getHrSkillSettings } from '@/actions/settings'

// Soft cap on transcript size sent to Claude. claude-sonnet-4-6 supports
// 200K tokens (~800K chars) but very large requests are unreliable and
// expensive. ~250K chars ≈ 60K tokens = a 90-minute meeting transcript,
// which is plenty for any interview.
const MAX_TRANSCRIPT_CHARS = 250_000

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
  priorityKeywords?: readonly string[]
  tenantId?: string
  transcriptId?: string
}

export type AnalyzeTranscriptResult = {
  analysis: TranscriptAnalysis
  detectedLanguage: SupportedLanguage
}

/**
 * Detect the primary language of a transcript using Claude Haiku.
 * Cheap and fast (~50 tokens, sub-second). Falls back to 'en' on any
 * uncertainty or error — analysis works either way, only the language
 * directive injection differs.
 */
async function detectTranscriptLanguage(
  transcriptText: string,
  tenantId: string
): Promise<SupportedLanguage> {
  const apiKey = await resolveAnthropicKey(tenantId)
  const anthropic = new Anthropic({ apiKey, maxRetries: 3, timeout: 300_000 })
  const sample = transcriptText.slice(0, 500)
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `What language is this text written in? Reply ONLY with a BCP 47 short code from this list: ${SUPPORTED_LANGUAGES.join(', ')}. If uncertain or not in the list, reply "en".\n\nText:\n${sample}`,
        },
      ],
    })
    const block = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    )
    const code = block?.text.trim().toLowerCase().slice(0, 2)
    return isSupportedLanguage(code) ? code : 'en'
  } catch (err) {
    console.warn(
      `[transcript-analysis] language detection failed, defaulting to 'en':`,
      err instanceof Error ? err.message : err
    )
    return 'en'
  }
}

export async function analyzeTranscriptWithClaude(
  input: AnalysisInput
): Promise<AnalyzeTranscriptResult> {
  let apiKey: string
  if (input.tenantId) {
    apiKey = await resolveAnthropicKey(input.tenantId)
  } else {
    console.warn('[transcript-analysis] no tenantId — falling back to env API key')
    const envKey = process.env.ANTHROPIC_API_KEY
    if (!envKey) throw new Error('No Anthropic API key configured')
    apiKey = envKey
  }
  // Match the resilience config used by other AI calls in the codebase —
  // built-in exponential backoff handles transient network blips and
  // 429/529/500 responses that would otherwise surface as "Connection error".
  // Long transcripts (60+ minute meetings ≈ 100K+ tokens) need a longer
  // timeout — Claude can take 60-180s to process large inputs.
  const anthropic = new Anthropic({ apiKey, maxRetries: 3, timeout: 300_000 })

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
${input.roleDescription}${questionsBlock}${formatManagerPriorities(input.priorityKeywords)}

Score 4 dimensions:
- communication: clarity, fluency, confidence, listening
- technical_depth: accuracy, depth, concrete examples
- problem_solving: structure, approach, adaptability
- social_fit: collaboration language, humility, team-first framing

${input.packQuestions?.length ? 'Map transcript excerpts to each interview question and score quality (strong/acceptable/weak).' : 'Provide overall assessment without per-question breakdown.'}

Numeric scores are language-agnostic. Reasoning text and the summary must be in the response language indicated below.`

  // Detect language BEFORE the main analysis call so we can inject the
  // language directive into the uncached per-transcript block. Putting
  // it in the cached system block would fragment the prompt cache per
  // language. Falls back to 'en' on any failure (analysis still works).
  const detectedLanguage = await detectTranscriptLanguage(input.transcriptText, input.tenantId ?? '')
  console.log(
    `[transcript-analysis] detected language=${detectedLanguage} for transcript=${input.transcriptId ?? '<unknown>'}`
  )
  const languageDirective = formatLanguageDirective(detectedLanguage)

  // HR skill block — gated by per-tenant `hr_skill_enabled` (issue #198).
  // Unlike `claude.ts` / `interview.ts`, this call site historically has
  // no top-level `system` field — the "teaching" block lives inline as
  // the first cached user-content text. To preserve byte-identical
  // behaviour when the toggle is OFF we ONLY add `system: [...]` to the
  // request shape when the skill is ON. The skill block goes BEFORE the
  // existing role-context user block so it inherits the cache prefix
  // (system blocks are always processed before user content).
  const hrSettings = await getHrSkillSettings(input.tenantId ?? '')
  const hrSkill = hrSettings.enabled ? loadHrSkill(hrSettings.profile) : null

  const startedAt = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [TRANSCRIPT_ANALYSIS_TOOL],
    tool_choice: { type: 'any' },
    ...(hrSkill
      ? {
          system: [
            {
              type: 'text' as const,
              text: `HR_POLICY:\n${hrSkill.content}`,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
        }
      : {}),
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
            text: `TRANSCRIPT:\n${
              input.transcriptText.length > MAX_TRANSCRIPT_CHARS
                ? input.transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) +
                  '\n\n[...transcript truncated to fit AI context window...]'
                : input.transcriptText
            }\n\nUse the submit_transcript_analysis tool to return your structured assessment.${languageDirective}`,
          },
        ],
      },
    ],
  })

  if (input.tenantId) {
    logAiUsage({
      tenantId: input.tenantId,
      userId: null,
      operation: 'transcript_analysis',
      model: response.model,
      usage: anthropicUsageToInput(response.usage),
      durationMs: Date.now() - startedAt,
      metadata: { transcriptId: input.transcriptId, roleTitle: input.roleTitle },
    }).catch(() => {})
  }

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

  return { analysis: parsed.data, detectedLanguage }
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

    const { analysis: result, detectedLanguage } = await analyzeTranscriptWithClaude({
      transcriptText: transcript.rawTranscriptText,
      roleTitle: role.title,
      roleDescription: role.description,
      roleRequirements: role.requirements,
      packQuestions,
      priorityKeywords: role.priorityKeywords,
      tenantId,
      transcriptId,
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
      detectedLanguage,
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
    // Include type/cause/stack in the server log for diagnosis
    const detail = err instanceof Error
      ? `name=${err.name} message=${err.message} cause=${JSON.stringify((err as Error & { cause?: unknown }).cause)}`
      : String(err)
    console.error(`[transcript-analysis] FAILED for ${transcriptId}:`, detail)
    if (err instanceof Error && err.stack) {
      console.error(`[transcript-analysis] stack:\n${err.stack}`)
    }
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(interviewTranscripts)
        .set({ analysisStatus: 'failed', errorMessage: message, updatedAt: new Date() })
        .where(eq(interviewTranscripts.id, transcriptId))
    })
  }
}
