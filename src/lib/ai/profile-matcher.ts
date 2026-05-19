/**
 * AI profile-match verification helper
 *
 * Verifies whether candidate online profiles (LinkedIn, GitHub, Stack Overflow,
 * Dev.to, Medium, personal sites) belong to the same person described in a CV.
 * Used by the candidate-enrichment v2 pipeline to disambiguate same-name hits
 * before persisting links.
 *
 * Pattern mirrors src/lib/ai/synechron-extract.ts (Claude Haiku + tool_use
 * structured output, retry/timeout config) and src/lib/ai/role-fit.ts (batch
 * multi-input AI analysis returning an array of verdicts).
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { logAiUsage, anthropicUsageToInput } from './usage-logger'
import { resolveAnthropicKey } from './keys'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_OUTPUT_TOKENS = 2048

export interface CvSignals {
  fullName: string
  email?: string
  currentCompany?: string
  pastCompanies?: string[]
  location?: string
  topSkills?: string[]
}

export interface ProfileCandidate {
  url: string
  snippet: string
  source: 'linkedin' | 'github' | 'stack_overflow' | 'devto' | 'medium' | 'personal' | 'web'
}

export const MatchVerdictSchema = z.object({
  url: z.string(),
  confidence: z.number().min(0).max(100),
  category: z.enum(['high', 'medium', 'low', 'not_match']),
  reason: z.string().max(200),
})
export type MatchVerdict = z.infer<typeof MatchVerdictSchema>

const PROFILE_MATCHER_SCHEMA = {
  type: 'object' as const,
  properties: {
    verdicts: {
      type: 'array',
      description: 'One verdict per input candidate URL, in the same order',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          category: { type: 'string', enum: ['high', 'medium', 'low', 'not_match'] },
          reason: { type: 'string', description: 'Short explanation, <=20 words' },
        },
        required: ['url', 'confidence', 'category', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}

const PROFILE_MATCHER_TOOL: Anthropic.Tool = {
  name: 'submit_profile_verdicts',
  description: 'Submit a verdict for each candidate URL on whether it belongs to the same person as the CV.',
  input_schema: PROFILE_MATCHER_SCHEMA,
}

const SYSTEM_PROMPT = `You verify whether online profiles belong to the same person described by a CV.

Rules:
- Compare profile snippet against CV signals (name, company, location, skills, email).
- High confidence (85-100): two or more strong signals match (e.g. exact name + same company OR same email).
- Medium (60-84): name match plus weak corroboration (e.g. similar location, generic profession match).
- Low (40-59): name match alone with no corroborating signal.
- Not match (0-39): name doesn't match, or signals contradict.
- Be cautious. Common names without disambiguating signals → low or not_match. NEVER guess.
- Output one verdict per input URL, in the same order.
- Reasoning must be <=20 words and cite the specific evidence.`

/**
 * Verify a batch of candidate URLs against a CV. Returns one verdict per URL.
 * Empty input → empty array (no API call).
 *
 * tenantId is required — this function must always run in a tenant context.
 * The only caller (enrichCandidate in src/actions/enrichment.ts) derives
 * tenantId from getActionContext(), which throws 'Not authenticated' before
 * this function is reached if context is absent. There is no background-job
 * or cron path that calls this function without a tenantId.
 *
 * If you add a new call site, you MUST pass a valid tenantId so the correct
 * per-tenant API key is used. Passing undefined would otherwise silently fall
 * through to a shared env key, crossing tenant API-key boundaries.
 */
export async function verifyProfilesAgainstCv(
  cvSignals: CvSignals,
  candidates: ProfileCandidate[],
  tenantId: string,
  candidateId?: string,
): Promise<MatchVerdict[]> {
  if (candidates.length === 0) return []

  // resolveAnthropicKey resolves the per-tenant key from DB first, then falls
  // back to the ANTHROPIC_API_KEY env var if the tenant has not set one.
  // Both paths are tenant-scoped — there is no shared-key bypass here.
  const apiKey = await resolveAnthropicKey(tenantId)
  const anthropic = new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 })

  const cvBlock = [
    `Name: ${cvSignals.fullName}`,
    cvSignals.email && `Email: ${cvSignals.email}`,
    cvSignals.currentCompany && `Current company: ${cvSignals.currentCompany}`,
    cvSignals.pastCompanies?.length && `Past companies: ${cvSignals.pastCompanies.join(', ')}`,
    cvSignals.location && `Location: ${cvSignals.location}`,
    cvSignals.topSkills?.length && `Top skills: ${cvSignals.topSkills.slice(0, 10).join(', ')}`,
  ].filter(Boolean).join('\n')

  const candidatesBlock = candidates
    .map((c, i) => `[${i + 1}] ${c.source.toUpperCase()} | ${c.url}\n    Snippet: ${c.snippet}`)
    .join('\n\n')

  const startedAt = Date.now()
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [PROFILE_MATCHER_TOOL],
    tool_choice: { type: 'tool', name: 'submit_profile_verdicts' },
    messages: [
      {
        role: 'user',
        content: `CV SIGNALS:\n${cvBlock}\n\nCANDIDATE URLS:\n${candidatesBlock}\n\nFor each candidate URL, return a verdict. Output one verdict per input URL via the submit_profile_verdicts tool.`,
      },
    ],
  })

  console.log(
    `[profile-matcher] model=${response.model}, candidates=${candidates.length}, usage=${JSON.stringify(response.usage)}`,
  )

  if (tenantId) {
    logAiUsage({
      tenantId,
      userId: null,
      operation: 'profile_match',
      model: response.model,
      usage: anthropicUsageToInput(response.usage),
      durationMs: Date.now() - startedAt,
      metadata: { candidateId, profileCount: candidates.length },
    }).catch(() => {})
  }

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (!toolBlock) {
    throw new Error(`profile-matcher: Claude did not return a tool_use response (stop_reason: ${response.stop_reason})`)
  }

  const parsed = z.object({ verdicts: z.array(MatchVerdictSchema) }).safeParse(toolBlock.input)
  if (!parsed.success) {
    throw new Error(`profile-matcher: tool response failed schema validation: ${parsed.error.message}`)
  }

  return parsed.data.verdicts
}
