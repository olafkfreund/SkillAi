/**
 * Welcome letter generator — Claude Haiku produces a friendly,
 * motivating prep letter for a candidate ahead of an interview
 * (and/or a Karat technical assessment).
 *
 * Mirrors src/lib/ai/interview.ts:
 * - Anthropic tool-use with a JSON schema matching WelcomeLetterSchema
 * - Three-block prompt: cached system (teaching content), cached role
 *   context, uncached per-candidate block (with language directive)
 * - Best-effort AI usage logging
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  WelcomeLetterSchema,
  type WelcomeLetter,
  type InterviewType,
} from './welcome-letter-schemas'
import { formatLanguageDirective, TOOL_LANGUAGE_REINFORCEMENT, type SupportedLanguage } from './language'
import { logAiUsage, anthropicUsageToInput } from './usage-logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60_000,
  maxRetries: 3,
})

const KARAT_LINK = 'https://karat.com/candidate-experience/'

const WELCOME_LETTER_TOOL: Anthropic.Tool = {
  name: 'submit_welcome_letter',
  description: `Submit a personalised candidate welcome letter. ${TOOL_LANGUAGE_REINFORCEMENT}`,
  input_schema: {
    type: 'object' as const,
    properties: {
      greeting: { type: 'string' },
      intro: { type: 'string' },
      interviewProcess: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          sections: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['heading', 'body'],
            },
          },
        },
        required: ['title', 'sections'],
      },
      karatSection: {
        type: 'object',
        description: 'Karat assessment teaching block. Omit this key entirely (or set to null) when the interview type is standard-only.',
        properties: {
          title: { type: 'string' },
          whatItIs: { type: 'string' },
          whatToExpect: { type: 'string' },
          link: { type: 'string' },
        },
        required: ['title', 'whatItIs', 'whatToExpect', 'link'],
      },
      starFormat: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          situation: { type: 'string' },
          task: { type: 'string' },
          action: { type: 'string' },
          result: { type: 'string' },
          workedExample: { type: 'string' },
        },
        required: ['title', 'description', 'situation', 'task', 'action', 'result', 'workedExample'],
      },
      tipsAndTricks: {
        type: 'array',
        minItems: 4,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['heading', 'body'],
        },
      },
      gapsToBridge: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            area: { type: 'string' },
            suggestion: { type: 'string' },
          },
          required: ['area', 'suggestion'],
        },
      },
      motivation: { type: 'string' },
      signoff: { type: 'string' },
    },
    required: [
      'greeting',
      'intro',
      'interviewProcess',
      'starFormat',
      'tipsAndTricks',
      'gapsToBridge',
      'motivation',
      'signoff',
    ],
  },
}

const SYSTEM_PROMPT = `You are a senior recruiter writing a warm, encouraging prep letter to a candidate ahead of their interview. Tone: professional, supportive, motivating — never patronising. Concrete and useful, not fluffy. The letter is candidate-facing, never customer-facing.

STAR FORMAT — TEACHING CONTENT
The STAR format is a structured way for candidates to answer behavioural and competency questions:
- Situation: set the scene briefly — context of the example.
- Task: what was specifically expected of them, what was their role, what challenge.
- Action: what they personally did (use "I", not "we") — concrete steps.
- Result: the outcome — quantified where possible (metrics, percentages, time saved, money saved).

A good STAR answer is 60–90 seconds spoken, focused, and shows ownership. Encourage candidates to prepare 3–5 STAR examples covering different competencies they expect to be asked about (leadership, conflict, technical decision, failure-and-learning, cross-team collaboration).

The "workedExample" field must be a complete worked-through STAR example (Situation through Result inline as one short narrative paragraph) tailored to a typical question for this candidate's seniority and domain.

KARAT — FACTUAL CONTENT (only use these facts; do not invent)
Karat runs technical assessments on behalf of hiring companies. Key facts:
- Format: 60-minute interview = ~10 minutes guided technical discussion + ~40 minutes coding.
- Tooling: a fully-tooled web IDE in the Karat platform — no local setup needed.
- Interviewer: a professional Interview Engineer (IVE) — not someone from the hiring team. The IVE is a vetted senior engineer.
- The session is video-recorded for the hiring company to review later.
- Candidate experience reference: ${KARAT_LINK}

When the karatSection is requested, populate it ONLY with the facts above. If unsure of a detail, omit it. Always set "link" to ${KARAT_LINK}.

LETTER STRUCTURE
- "greeting" addresses the candidate by first name (e.g. "Dear Anna,") in the target language and register.
- "intro" is 2–3 sentences: warm welcome, context for the letter, brief reassurance.
- "interviewProcess" has 2–4 sections covering what to expect (format, who's interviewing, focus areas, logistics) — keep it grounded in the role context provided.
- "karatSection" is null when only a standard interview applies; otherwise it teaches the Karat process.
- "starFormat" teaches STAR with the worked example (see above).
- "tipsAndTricks" is 4–6 short, specific, actionable tips (research the company, prepare questions to ask, sleep, talk through reasoning, ask for clarification, etc.).
- "gapsToBridge" suggests free or well-known learning routes for genuine gaps between the candidate's CV and the role's requirements/priorities. Compute gaps as (role requirements ∪ priority keywords) MINUS the candidate's existing technical skills. If there are no real gaps, return an empty array — never invent gaps to fill the section.
- "motivation" is one short paragraph closing on a confident, encouraging note.
- "signoff" is a localised, formal-register-aware closing including the team name (provided per request).`

export interface GenerateWelcomeLetterArgs {
  candidate: {
    id: string
    firstName: string
    lastName: string
    experienceLevel?: string | null
  }
  role: {
    id: string
    title: string
    description: string | null
    requirements: string[] | null
    priorityKeywords: string[] | null
  } | null
  cvProfile: {
    summary: string
    technicalSkills: string[]
    experienceLevel: string | null
  } | null
  language: SupportedLanguage
  interviewType: InterviewType
  tenantName: string
  tenantId: string
  userId: string
}

export async function generateWelcomeLetter(args: GenerateWelcomeLetterArgs): Promise<WelcomeLetter> {
  const {
    candidate,
    role,
    cvProfile,
    language,
    interviewType,
    tenantName,
    tenantId,
    userId,
  } = args

  const includeKarat = interviewType !== 'standard'
  const isBoth = interviewType === 'both'

  // Cached role context — distinct text block (not in system) so a role with
  // many candidates re-uses the same cached prefix across letters. Empty when
  // no role is selected; the AI then writes a generic "interview process"
  // block with no role-specific claims.
  const roleContextText = role
    ? `ROLE CONTEXT (use to ground the interview process and gap analysis):
TITLE: ${role.title}
${role.description ? `DESCRIPTION:\n${role.description}\n` : ''}${role.requirements && role.requirements.length > 0 ? `REQUIREMENTS:\n${role.requirements.map((r) => `- ${r}`).join('\n')}\n` : ''}${role.priorityKeywords && role.priorityKeywords.length > 0 ? `PRIORITY KEYWORDS:\n${role.priorityKeywords.map((k) => `- ${k}`).join('\n')}` : ''}`
    : 'ROLE CONTEXT: no specific role selected. Write a general-purpose interview prep letter and return gapsToBridge as an empty array.'

  const candidateExperienceLevel =
    candidate.experienceLevel ?? cvProfile?.experienceLevel ?? 'mid'

  // Skill list bounded to 30 to keep the per-candidate block small and
  // predictable; matches the cap already enforced in CvProfileSchema.
  const candidateSkills = (cvProfile?.technicalSkills ?? []).slice(0, 30)

  const interviewTypeInstruction = (() => {
    if (interviewType === 'standard') {
      return 'INTERVIEW TYPE: Standard interview only. Set karatSection to null. Do not mention Karat anywhere in the letter.'
    }
    if (interviewType === 'karat') {
      return 'INTERVIEW TYPE: Karat technical assessment only. Populate karatSection using ONLY the Karat facts in the system message. The interviewProcess block should focus on overall preparation; the Karat-specific format details belong in karatSection.'
    }
    // 'both'
    return 'INTERVIEW TYPE: Both a standard interview AND a Karat technical assessment. Populate karatSection using ONLY the Karat facts in the system message. The interviewProcess block should describe the standard portion; karatSection covers the technical assessment.'
  })()

  // Per-candidate user block — uncached. Language directive lives here, NOT
  // in the cached system block, per the architectural note in language.ts:
  // putting it in the cached prefix would fragment the cache per language.
  const perCandidateText = `CANDIDATE
- First name: ${candidate.firstName}
- Experience level: ${candidateExperienceLevel}
${cvProfile ? `- Profile summary: ${cvProfile.summary}\n` : ''}${candidateSkills.length > 0 ? `- Technical skills: ${candidateSkills.join(', ')}\n` : ''}
${interviewTypeInstruction}

TEAM NAME (use in signoff): ${tenantName}

Write the welcome letter now. Submit via the submit_welcome_letter tool.${formatLanguageDirective(language)}`

  const startedAt = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [WELCOME_LETTER_TOOL],
    tool_choice: { type: 'tool', name: 'submit_welcome_letter' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: roleContextText,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: perCandidateText,
          },
        ],
      },
    ],
  })

  console.log(
    `Welcome letter: model=${response.model}, language=${language}, interviewType=${interviewType}, includeKarat=${includeKarat}, both=${isBoth}, usage=${JSON.stringify(response.usage)}`
  )

  logAiUsage({
    tenantId,
    userId,
    operation: 'welcome_letter_generate',
    model: response.model,
    usage: anthropicUsageToInput(response.usage),
    durationMs: Date.now() - startedAt,
    metadata: {
      candidateId: candidate.id,
      roleId: role?.id ?? null,
      language,
      interviewType,
      hasRole: !!role,
      hasCvProfile: !!cvProfile,
    },
  }).catch(() => {})

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolBlock) {
    throw new Error(
      `Welcome letter: Claude did not return a tool_use response (stop_reason: ${response.stop_reason})`
    )
  }

  // Normalise: tool schema doesn't list karatSection in required (so the model
  // can legitimately omit it for standard interviews), but the Zod contract
  // demands the key be present as object-or-null. Default missing to null.
  const rawInput = toolBlock.input as Record<string, unknown>
  const normalised = 'karatSection' in rawInput ? rawInput : { ...rawInput, karatSection: null }

  const parsed = WelcomeLetterSchema.safeParse(normalised)
  if (!parsed.success) {
    throw new Error(
      `Welcome letter schema validation failed (stop_reason: ${response.stop_reason}): ${parsed.error.message}`
    )
  }

  // Belt-and-braces: when interviewType === 'standard' the model MUST emit
  // null. If it slipped a section in anyway, drop it server-side rather than
  // surface contradictory content to the candidate.
  if (interviewType === 'standard' && parsed.data.karatSection !== null) {
    return { ...parsed.data, karatSection: null }
  }

  // Belt-and-braces: when Karat IS in scope, force the link to the canonical
  // URL — guards against the model paraphrasing the URL despite instructions.
  if (interviewType !== 'standard' && parsed.data.karatSection !== null) {
    return {
      ...parsed.data,
      karatSection: { ...parsed.data.karatSection, link: KARAT_LINK },
    }
  }

  return parsed.data
}
