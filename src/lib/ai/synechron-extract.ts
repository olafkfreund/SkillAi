/**
 * AI Synechron-format CV extraction
 *
 * Converts a candidate's free-form CV text into the structured Synechron
 * corporate CV template format using Claude Haiku with tool_use structured
 * output. Persists the result to candidates.synechron_cv_data so the PDF
 * exporter can render it without re-running the AI.
 *
 * Pattern mirrors src/lib/ai/cv-reformat.ts — same model, same tool_use
 * approach, same fetch-extract-persist-audit flow.
 */

import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema/candidates'
import { writeAuditLog } from '@/lib/audit'
import {
  SynechronCvDataSchema,
  type SynechronCvData,
} from './synechron-schema'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60_000,
})

const MODEL = 'claude-haiku-4-5-20251001'
const INPUT_CHAR_CAP = 10_000
const MAX_OUTPUT_TOKENS = 4096

/**
 * Hand-written JSON Schema mirroring SynechronCvDataSchema.
 *
 * Kept in sync manually rather than introducing a zod-to-json-schema
 * dependency for a single use site. Every field is optional — the model
 * is instructed to leave fields blank rather than guess. Final validation
 * is performed by SynechronCvDataSchema (Zod) on the returned tool input.
 */
const SYNECHRON_TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    candidateName: {
      type: 'string',
      description: 'Full name of the candidate as printed on the CV',
    },
    jobTitle: {
      type: 'string',
      description: 'Current or most recent job title',
    },
    overallExperience: {
      type: 'string',
      description: 'Total professional experience, e.g. "12+ years"',
    },
    relevantExperience: {
      type: 'string',
      description: 'Experience relevant to the candidate\'s primary discipline',
    },
    skillsCategorised: {
      type: 'array',
      description: 'Skills grouped by category (e.g. Languages, Cloud, Databases)',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
        },
        required: ['category', 'skills'],
      },
    },
    domains: {
      type: 'array',
      description: 'Industry domains the candidate has worked in (e.g. Banking, Healthcare)',
      items: { type: 'string' },
    },
    achievements: {
      type: 'array',
      description: 'Notable achievements explicitly stated in the CV',
      items: { type: 'string' },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          degree: { type: 'string' },
          institution: { type: 'string' },
          year: { type: 'string' },
        },
        required: ['degree', 'institution'],
      },
    },
    visa: {
      type: 'string',
      description: 'Visa or work-eligibility status if explicitly mentioned',
    },
    trainingCertifications: {
      type: 'array',
      description: 'Certifications and training programs the candidate has completed',
      items: { type: 'string' },
    },
    synopsisBullets: {
      type: 'array',
      description: 'Short candidate synopsis as 3-6 high-level bullet points',
      items: { type: 'string' },
    },
    employmentHistory: {
      type: 'array',
      description: 'Job history, most recent first. Skip jobs whose dates or company are unclear.',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          dates: { type: 'string', description: 'e.g. "Jan 2022 – Present"' },
          teamSize: { type: 'string' },
          client: { type: 'string' },
          duration: { type: 'string' },
          description: { type: 'string' },
          responsibilities: { type: 'array', items: { type: 'string' } },
          skills: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const SYNECHRON_TOOL: Anthropic.Tool = {
  name: 'synechron_cv_data',
  description:
    'Submit the candidate CV converted into the Synechron corporate CV template structure',
  input_schema: SYNECHRON_TOOL_INPUT_SCHEMA,
}

const SYSTEM_PROMPT = `You convert a candidate's CV into the Synechron corporate CV template format.

Strict rules:
- Leave fields BLANK rather than guess. The wrong information is worse than no information.
- Do NOT invent team sizes, client names, or domains that aren't directly evidenced in the CV text.
- For employment_history: include every job clearly described in the CV. Skip jobs whose dates or company names are unclear rather than guess.
- For skills: only include skills the candidate's CV explicitly mentions, never infer.
- responsibilities arrays: copy/paraphrase from the CV — do not embellish.
- For ambiguous information: prefer omission over a fabricated answer.

Output via the synechron_cv_data tool.`

/**
 * Extract Synechron-format structured CV data for a candidate.
 *
 * Loads the candidate's stored CV text, calls Claude Haiku with a tool_use
 * structured output, validates the response against SynechronCvDataSchema,
 * persists it to candidates.synechron_cv_data, and writes a (best-effort)
 * audit log entry.
 *
 * Throws if the candidate has no CV text, the model fails to return a
 * tool_use block, or the response fails Zod validation.
 */
export async function extractSynechronCvData(
  candidateId: string,
  tenantId: string
): Promise<SynechronCvData> {
  const cvText = await loadCandidateCvText(candidateId, tenantId)
  const input = capInputForClaude(cvText, candidateId)
  const response = await callClaudeWithSynechronTool(input)
  const data = parseSynechronToolResponse(response)
  await persistSynechronData(candidateId, tenantId, data)
  await logExtraction(tenantId, candidateId, response, input.length, data)
  return data
}

// 1. Load candidate's CV text under tenant context
async function loadCandidateCvText(
  candidateId: string,
  tenantId: string
): Promise<string> {
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ cvText: candidates.cvText })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1)
  )
  if (!candidate?.cvText) {
    throw new Error('Candidate has no CV text to extract Synechron data from')
  }
  return candidate.cvText
}

// 2. Cap input — log if we truncated so we can revisit if it becomes common
function capInputForClaude(cvText: string, candidateId: string): string {
  const originalLength = cvText.length
  const input = cvText.slice(0, INPUT_CHAR_CAP)
  if (originalLength > INPUT_CHAR_CAP) {
    console.log(
      `[synechron-extract] candidateId=${candidateId} cvText truncated: ${originalLength} -> ${INPUT_CHAR_CAP} chars`
    )
  }
  return input
}

// 3. Call Claude with tool_use structured output
async function callClaudeWithSynechronTool(
  input: string
): Promise<Anthropic.Message> {
  return anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [SYNECHRON_TOOL],
    tool_choice: { type: 'tool', name: 'synechron_cv_data' },
    messages: [
      {
        role: 'user',
        content: `Convert the following CV into the Synechron corporate CV template structure. Remember: leave fields blank rather than guess.

CV TEXT:
${input}`,
      },
    ],
  })
}

// 4. Find the tool_use block and 5. validate against the Zod schema
function parseSynechronToolResponse(
  response: Anthropic.Message
): SynechronCvData {
  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolBlock) {
    throw new Error(
      `Synechron extract: Claude did not return a tool_use response (stop_reason: ${response.stop_reason})`
    )
  }

  const parsed = SynechronCvDataSchema.safeParse(toolBlock.input)
  if (!parsed.success) {
    throw new Error(
      `Synechron extract: tool response failed schema validation: ${parsed.error.message}`
    )
  }

  return parsed.data
}

// 6. Persist (critical write — must complete before we declare success)
async function persistSynechronData(
  candidateId: string,
  tenantId: string,
  data: SynechronCvData
): Promise<void> {
  await withTenant(tenantId, async (tx) =>
    tx
      .update(candidates)
      .set({ synechronCvData: data })
      .where(eq(candidates.id, candidateId))
  )
}

// 7. Audit (best-effort — never block return on logging failure)
async function logExtraction(
  tenantId: string,
  candidateId: string,
  response: Anthropic.Message,
  inputLength: number,
  data: SynechronCvData
): Promise<void> {
  console.log(
    `[synechron-extract] model=${response.model}, in=${inputLength} chars, usage=${JSON.stringify(response.usage)}`
  )

  const outputBytes = Buffer.byteLength(JSON.stringify(data), 'utf8')

  await writeAuditLog(tenantId, {
    action: 'candidate.synechron_cv_extracted',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: {
      model: response.model,
      inputChars: inputLength,
      outputBytes,
    },
  }).catch(() => {})
}
