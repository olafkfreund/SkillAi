/**
 * Zod schema and Anthropic tool definition for transcript analysis
 *
 * Claude uses tool_use to return a structured TranscriptAnalysis object.
 * All Claude calls for transcript scoring must produce data matching
 * TranscriptAnalysisSchema. Validation failures set analysisStatus='failed'.
 */

import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'

const DimensionSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
})

export const TranscriptAnalysisSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  dimensions: z.object({
    communication: DimensionSchema,
    technical_depth: DimensionSchema,
    problem_solving: DimensionSchema,
    social_fit: DimensionSchema,
  }),
  summary: z.string().min(1),
  strengths: z.array(z.string()).max(5),
  red_flags: z.array(z.string()).max(5),
  recommended_decision: z.enum(['proceed', 'consider', 'decline']),
  question_responses: z
    .array(
      z.object({
        question_text: z.string(),
        transcript_excerpt: z.string(),
        quality: z.enum(['strong', 'acceptable', 'weak']),
        notes: z.string(),
      })
    )
    .optional()
    .default([]),
})

export type TranscriptAnalysis = z.infer<typeof TranscriptAnalysisSchema>

export const TRANSCRIPT_ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'submit_transcript_analysis',
  description:
    'Submit a structured analysis of an interview transcript against a job role',
  input_schema: {
    type: 'object' as const,
    properties: {
      overall_score: {
        type: 'integer',
        description: 'Overall interview performance score 0-100',
        minimum: 0,
        maximum: 100,
      },
      dimensions: {
        type: 'object',
        properties: {
          communication: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
          technical_depth: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
          problem_solving: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
          social_fit: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
          },
        },
        required: ['communication', 'technical_depth', 'problem_solving', 'social_fit'],
      },
      summary: {
        type: 'string',
        description: 'Overall assessment summary (2-4 sentences)',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description: 'Up to 5 key candidate strengths observed in the interview',
      },
      red_flags: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description: 'Up to 5 concerns or red flags observed',
      },
      recommended_decision: {
        type: 'string',
        enum: ['proceed', 'consider', 'decline'],
        description: 'Recommended hiring decision based on interview performance',
      },
      question_responses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question_text: { type: 'string' },
            transcript_excerpt: { type: 'string' },
            quality: { type: 'string', enum: ['strong', 'acceptable', 'weak'] },
            notes: { type: 'string' },
          },
          required: ['question_text', 'transcript_excerpt', 'quality', 'notes'],
        },
        description: 'Per-question breakdown (only when interview pack questions are provided)',
      },
    },
    required: [
      'overall_score',
      'dimensions',
      'summary',
      'strengths',
      'red_flags',
      'recommended_decision',
    ],
  },
}
