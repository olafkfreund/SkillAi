/**
 * Claude API client for CV scoring
 *
 * Uses structured outputs (tool_use) to guarantee a valid JSON response
 * matching CandidateScoreSchema. Prompt caching applied to the role
 * context block to reduce costs on repeated scoring against the same role.
 */

import Anthropic from '@anthropic-ai/sdk'
import { CandidateScoreSchema, type CandidateScore } from './schema'
import { formatManagerPriorities } from './priorities'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 120_000,
  maxRetries: 3,
})

const SCORING_TOOL: Anthropic.Tool = {
  name: 'submit_candidate_score',
  description: 'Submit a structured score for a candidate against a job role',
  input_schema: {
    type: 'object' as const,
    properties: {
      overall_score: {
        type: 'integer',
        description: 'Overall fit score 0-100',
        minimum: 0,
        maximum: 100,
      },
      dimensions: {
        type: 'object',
        properties: {
          technical_skills: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
          experience_level: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
          cultural_fit: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
          communication: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
        },
        required: ['technical_skills', 'experience_level', 'cultural_fit', 'communication'],
      },
      summary: {
        type: 'string',
        description: 'Brief AI summary of the candidate fit (2-4 sentences)',
      },
    },
    required: ['overall_score', 'dimensions', 'summary'],
  },
}

type ScoringInput = {
  roleTitle: string
  roleDescription: string
  roleRequirements: string
  cvText: string
  candidateName: string
  frameworkContext?: string
  budgetContext?: string
  priorityKeywords?: readonly string[]
}

export async function scoreCandidateWithClaude(input: ScoringInput): Promise<CandidateScore> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: 'You are an expert recruiter scoring candidates against job roles. Evaluate candidates objectively on technical skills, experience level, cultural fit, and communication. Provide specific reasoning tied to CV evidence.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [SCORING_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `ROLE: ${input.roleTitle}

DESCRIPTION:
${input.roleDescription}

REQUIREMENTS:
${input.roleRequirements}${input.frameworkContext ? `\n\nHIRING FRAMEWORK CONTEXT:\n${input.frameworkContext}` : ''}${formatManagerPriorities(input.priorityKeywords)}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Score this candidate:

CANDIDATE: ${input.candidateName}
${input.budgetContext ? `\n${input.budgetContext}\n` : ''}
CV:
${input.cvText.slice(0, 8000)}

Evaluate on: technical_skills, experience_level, cultural_fit, communication.
Use the submit_candidate_score tool to return your assessment.`,
          },
        ],
      },
    ],
  })

  console.log(`Scoring: model=${response.model}, usage=${JSON.stringify(response.usage)}`)

  // Extract the tool_use block
  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolBlock) {
    throw new Error('Claude did not return a tool_use response')
  }

  // Validate against Zod schema
  const parsed = CandidateScoreSchema.safeParse(toolBlock.input)
  if (!parsed.success) {
    throw new Error(`Claude response failed schema validation: ${parsed.error.message}`)
  }

  return parsed.data
}
