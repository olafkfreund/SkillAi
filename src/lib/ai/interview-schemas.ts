/**
 * Zod schemas for the two-stage interview question generation pipeline
 */

import { z } from 'zod'

// Stage 1: CV profile extraction
export const CvProfileSchema = z.object({
  experience_level: z.enum(['junior', 'mid', 'senior', 'lead']).optional(),
  // Accept any length from Claude and truncate to 800 chars for safety — some
  // candidates have rich enough backgrounds that Claude writes a slightly
  // longer summary. Rejecting a 601-char summary would fail the whole extraction.
  summary: z
    .string()
    .optional()
    .transform((s) => (s && s.length > 800 ? s.slice(0, 797) + '…' : s)),
  companies: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        key_achievements: z.array(z.string()),
      })
    )
    .transform((arr) => arr.slice(0, 5)),
  technical_skills: z.array(z.string()).transform((arr) => arr.slice(0, 30)),
  personalizable_moments: z.array(z.string()).optional().default([]).transform((arr) => arr.slice(0, 10)),
})

export type CvProfile = z.infer<typeof CvProfileSchema>

// Stage 2: Interview pack generation
const QuestionSchema = z.object({
  question_type: z.enum(['behavioral', 'technical', 'situational', 'cultural']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  question_text: z.string().min(10),
  rationale: z.string(),
  follow_ups: z.array(z.object({ question: z.string() })).transform((arr) => arr.slice(0, 3)),
  strong_answer_signals: z.array(z.string()),
  acceptable_answer_signals: z.array(z.string()),
  weak_answer_signals: z.array(z.string()),
  cv_references: z.array(z.string()),
})

const CodeChallengeSchema = z.object({
  title: z.string(),
  problem_description: z.string(),
  starter_code: z.string(),
  language: z.string(),
  unit_tests: z.string(),
  evaluation_criteria: z.string(),
  estimated_minutes: z.number().int().positive(),
})

export const InterviewPackSchema = z.object({
  experience_level: z.enum(['junior', 'mid', 'senior', 'lead']),
  recommended_duration_minutes: z.number().int().positive(),
  questions: z.array(QuestionSchema).min(5).max(15),
  code_challenge: CodeChallengeSchema.optional(),
})

export type InterviewPackOutput = z.infer<typeof InterviewPackSchema>
