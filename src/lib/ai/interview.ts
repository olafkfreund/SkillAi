/**
 * Interview question generation pipeline
 *
 * Stage 1: extractCvProfile() — Claude extracts structured profile from raw CV text
 * Stage 2: generateQuestions() — Claude generates personalised questions using
 *           the profile + role description (with prompt caching on role context)
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  CvProfileSchema,
  InterviewPackSchema,
  type CvProfile,
  type InterviewPackOutput,
} from './interview-schemas'
import { inferExperienceLevel, inferLanguage } from './interview-helpers'

export { inferExperienceLevel, inferLanguage }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// -- Stage 1: CV Profile Extraction --

const CV_PROFILE_TOOL: Anthropic.Tool = {
  name: 'submit_cv_profile',
  description: 'Submit a structured profile extracted from a CV',
  input_schema: {
    type: 'object' as const,
    properties: {
      experience_level: {
        type: 'string',
        enum: ['junior', 'mid', 'senior', 'lead'],
        description: 'Inferred experience level',
      },
      companies: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string' },
            key_achievements: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'role', 'key_achievements'],
        },
      },
      technical_skills: {
        type: 'array',
        maxItems: 30,
        items: { type: 'string' },
      },
      personalizable_moments: {
        type: 'array',
        maxItems: 10,
        items: { type: 'string' },
        description: 'Specific moments from the CV to reference in interview questions',
      },
    },
    required: ['companies', 'technical_skills'],
  },
}

export async function extractCvProfile(cvText: string): Promise<CvProfile> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [CV_PROFILE_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: `Extract a structured profile from this CV. Identify the candidate's experience level, companies worked at with key achievements, technical skills, and specific moments worth referencing in interview questions.

CV:
${cvText.slice(0, 6000)}`,
      },
    ],
  })

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolBlock) throw new Error('Stage 1: Claude did not return a tool_use response')

  const parsed = CvProfileSchema.safeParse(toolBlock.input)
  if (!parsed.success) throw new Error(`Stage 1 schema validation failed: ${parsed.error.message}`)

  return parsed.data
}

// -- Stage 2: Question Generation --

export async function generateQuestions(
  cvProfile: CvProfile,
  role: { title: string; description: string; requirements: string },
  options: { includeCodeChallenge: boolean; language?: string }
): Promise<InterviewPackOutput> {
  const language = options.language ?? inferLanguage(cvProfile.technical_skills)
  const experienceLevel = cvProfile.experience_level ?? 'mid'

  const QUESTION_TOOL: Anthropic.Tool = {
    name: 'submit_interview_pack',
    description: 'Submit a complete interview pack',
    input_schema: {
      type: 'object' as const,
      properties: {
        experience_level: { type: 'string', enum: ['junior', 'mid', 'senior', 'lead'] },
        recommended_duration_minutes: { type: 'integer', minimum: 30 },
        questions: {
          type: 'array',
          minItems: 6,
          items: {
            type: 'object',
            properties: {
              question_type: { type: 'string', enum: ['behavioral', 'technical', 'situational', 'cultural'] },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
              question_text: { type: 'string' },
              rationale: { type: 'string' },
              follow_ups: { type: 'array', maxItems: 2, items: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
              strong_answer_signals: { type: 'array', items: { type: 'string' } },
              acceptable_answer_signals: { type: 'array', items: { type: 'string' } },
              weak_answer_signals: { type: 'array', items: { type: 'string' } },
              cv_references: { type: 'array', items: { type: 'string' } },
            },
            required: ['question_type', 'difficulty', 'question_text', 'rationale', 'follow_ups', 'strong_answer_signals', 'acceptable_answer_signals', 'weak_answer_signals', 'cv_references'],
          },
        },
        code_challenge: options.includeCodeChallenge ? {
          type: 'object',
          properties: {
            title: { type: 'string' },
            problem_description: { type: 'string' },
            starter_code: { type: 'string' },
            language: { type: 'string' },
            unit_tests: { type: 'string' },
            evaluation_criteria: { type: 'string' },
            estimated_minutes: { type: 'integer', minimum: 15 },
          },
          required: ['title', 'problem_description', 'starter_code', 'language', 'unit_tests', 'evaluation_criteria', 'estimated_minutes'],
        } : undefined,
      },
      required: ['experience_level', 'recommended_duration_minutes', 'questions'],
    },
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [QUESTION_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            // Role context cached — same role, many candidates
            text: `You are an expert technical interviewer creating personalised interview packs.

ROLE: ${role.title}
DESCRIPTION: ${role.description}
REQUIREMENTS:
${role.requirements}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Create a complete interview pack for this ${experienceLevel}-level candidate.

CANDIDATE PROFILE:
- Experience level: ${experienceLevel}
- Technical skills: ${cvProfile.technical_skills.join(', ')}
- Companies: ${cvProfile.companies.map((c) => `${c.role} at ${c.name}`).join('; ')}
- Key moments to reference: ${cvProfile.personalizable_moments.join('; ')}

Requirements:
- Include 8-12 questions with a mix of behavioral (2), technical (3-4), situational (2), cultural (1-2)
- Each question must reference specific CV moments (cv_references array)
- Include scoring rubric: strong/acceptable/weak answer signals
- Include up to 2 follow-up questions per question
${options.includeCodeChallenge ? `- Include a ${language} code challenge appropriate for ${experienceLevel} level` : '- Do NOT include a code challenge'}
- Calibrate difficulty to ${experienceLevel} level`,
          },
        ],
      },
    ],
  })

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolBlock) throw new Error('Stage 2: Claude did not return a tool_use response')

  const parsed = InterviewPackSchema.safeParse(toolBlock.input)
  if (!parsed.success) throw new Error(`Stage 2 schema validation failed: ${parsed.error.message}`)

  return parsed.data
}
