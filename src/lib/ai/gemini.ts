/**
 * Gemini API client for CV scoring
 *
 * Uses Gemini 2.0 Flash (gemini-2.0-flash) with structured JSON output
 * to return a CandidateScore matching the same schema used by Claude scoring.
 *
 * Falls back to tenant API key → GEMINI_API_KEY env var.
 */

import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'
import { resolveGoogleKey } from './keys'
import { CandidateScoreSchema, type CandidateScore } from './schema'
import { formatManagerPriorities } from './priorities'
import { logAiUsage, geminiUsageToInput } from './usage-logger'
import type { AiOperation } from '@/db/schema/ai-usage'

const GEMINI_MODEL = 'models/gemini-2.0-flash'

const SCORE_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    overall_score: {
      type: SchemaType.INTEGER,
      description: 'Overall fit score 0-100',
    },
    dimensions: {
      type: SchemaType.OBJECT,
      properties: {
        technical_skills: {
          type: SchemaType.OBJECT,
          properties: {
            score: { type: SchemaType.INTEGER },
            reasoning: { type: SchemaType.STRING },
          },
          required: ['score', 'reasoning'],
        },
        experience_level: {
          type: SchemaType.OBJECT,
          properties: {
            score: { type: SchemaType.INTEGER },
            reasoning: { type: SchemaType.STRING },
          },
          required: ['score', 'reasoning'],
        },
        cultural_fit: {
          type: SchemaType.OBJECT,
          properties: {
            score: { type: SchemaType.INTEGER },
            reasoning: { type: SchemaType.STRING },
          },
          required: ['score', 'reasoning'],
        },
        communication: {
          type: SchemaType.OBJECT,
          properties: {
            score: { type: SchemaType.INTEGER },
            reasoning: { type: SchemaType.STRING },
          },
          required: ['score', 'reasoning'],
        },
      },
      required: ['technical_skills', 'experience_level', 'cultural_fit', 'communication'],
    },
    summary: {
      type: SchemaType.STRING,
      description: 'Brief summary of candidate fit (2-4 sentences)',
    },
  },
  required: ['overall_score', 'dimensions', 'summary'],
}

type ScoringInput = {
  roleTitle: string
  roleDescription: string
  roleRequirements: string
  cvText: string
  candidateName: string
  tenantId: string
  frameworkContext?: string
  budgetContext?: string
  priorityKeywords?: readonly string[]
  // Optional operation tag for ai_usage. Defaults to 'cv_scoring_gemini'.
  // Used by auto-match (#269) to tag scoring runs as 'auto_match_scoring'.
  operation?: AiOperation
}

export async function scoreCandidateWithGemini(input: ScoringInput): Promise<CandidateScore> {
  const apiKey = await resolveGoogleKey(input.tenantId)
  const genAI = new GoogleGenerativeAI(apiKey)

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SCORE_RESPONSE_SCHEMA,
    },
  })

  const prompt = `You are an expert recruiter scoring candidates against job roles.

ROLE: ${input.roleTitle}

DESCRIPTION:
${input.roleDescription}

REQUIREMENTS:
${input.roleRequirements}${input.frameworkContext ? `\n\nHIRING FRAMEWORK CONTEXT:\n${input.frameworkContext}` : ''}${formatManagerPriorities(input.priorityKeywords)}

CANDIDATE: ${input.candidateName}
${input.budgetContext ? `\n${input.budgetContext}\n` : ''}
CV:
${input.cvText.slice(0, 8000)}

Score this candidate on:
- technical_skills (0-100): depth and breadth of technical skills vs role requirements
- experience_level (0-100): seniority and experience match for the role
- cultural_fit (0-100): alignment with role context and team expectations
- communication (0-100): clarity of CV writing as a communication proxy

Return an overall_score (0-100) plus a brief summary (2-4 sentences).`

  const startedAt = Date.now()
  const result = await model.generateContent(prompt)
  const text = result.response.text()

  // Best-effort usage tracking — Gemini's usageMetadata may be absent on some responses
  const usageMeta = result.response.usageMetadata
  if (usageMeta) {
    logAiUsage({
      tenantId: input.tenantId,
      userId: null,
      operation: input.operation ?? 'cv_scoring_gemini',
      model: GEMINI_MODEL,
      usage: geminiUsageToInput(usageMeta),
      durationMs: Date.now() - startedAt,
      metadata: { candidateName: input.candidateName, roleTitle: input.roleTitle },
    }).catch(() => {})
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`)
  }

  const parsed = CandidateScoreSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Gemini response failed schema validation: ${parsed.error.message}`)
  }

  return parsed.data
}
