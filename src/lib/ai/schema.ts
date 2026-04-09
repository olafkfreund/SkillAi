/**
 * Zod schema for Claude structured output scoring response
 *
 * Every Claude API call for candidate scoring must return data
 * matching this schema. Validation failures set score_status='failed'.
 */

import { z } from 'zod'

const DimensionSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
})

export const CandidateScoreSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  dimensions: z.object({
    technical_skills: DimensionSchema,
    experience_level: DimensionSchema,
    cultural_fit: DimensionSchema,
    communication: DimensionSchema,
  }),
  summary: z.string().min(10),
})

export type CandidateScore = z.infer<typeof CandidateScoreSchema>
