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
import { logAiUsage, anthropicUsageToInput } from './usage-logger'
import { resolveAnthropicKey } from './keys'
import {
  SynechronCvDataSchema,
  type SynechronCvData,
} from './synechron-schema'

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
      description:
        'Job history (POSITIONS HELD), most recent first. Each entry is one role at one company. Skip jobs whose dates or company are unclear. Do NOT use this array for individual client deliverables — those go in `projects`.',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          dates: { type: 'string', description: 'e.g. "Jan 2022 – Present"' },
          teamSize: { type: 'string' },
          client: { type: 'string' },
          duration: { type: 'string' },
          location: {
            type: 'string',
            description:
              'Location of the job if explicitly stated, e.g. "Sheffield, UK" or "Bangalore, India". Leave undefined otherwise.',
          },
          description: { type: 'string' },
          responsibilities: { type: 'array', items: { type: 'string' } },
          skills: { type: 'array', items: { type: 'string' } },
          keyAchievement: {
            type: 'string',
            description:
              'A single short paragraph capturing the headline impact for this job, often labelled "Key Achievement:" or appearing as a bold lead-in/summary at the end of the entry. One string, not a list. Leave undefined if no clear key achievement is stated.',
          },
        },
      },
    },
    projects: {
      type: 'array',
      description:
        'Discrete client-engagement DELIVERABLES, separate from employmentHistory. Use ONLY when the source CV has its own Projects section listing distinct named engagements (consultancy CVs commonly have 4-8 projects under a single role). If projects are merely blended into a job description, leave this array empty/undefined and keep details inside employmentHistory[].description or responsibilities. Never duplicate the same engagement here and in employmentHistory.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name as printed on the CV' },
          client: { type: 'string', description: 'Client / end customer for the project' },
          duration: {
            type: 'string',
            description: 'Project duration, e.g. "Mar 2023 – Aug 2023" or "6 months"',
          },
          role: {
            type: 'string',
            description: 'Role the candidate played on this specific project',
          },
          teamSize: { type: 'string' },
          environment: {
            description:
              'Tech / tooling environment for the project. May be a single string or an array of technologies.',
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          description: { type: 'string' },
          responsibilities: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
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
- For employmentHistory: include every job clearly described in the CV. Skip jobs whose dates or company names are unclear rather than guess.
- For skills: only include skills the candidate's CV explicitly mentions, never infer.
- responsibilities arrays: copy/paraphrase from the CV — do not embellish.
- For ambiguous information: prefer omission over a fabricated answer.

employmentHistory vs projects — this distinction matters:
- employmentHistory[] = the JOB / POSITION itself (a role the candidate held at a company, with start/end dates, ongoing responsibilities, achievements).
- projects[] = discrete client-engagement DELIVERABLES — named pieces of work tied to a client. A single role at a consultancy will often span 4-8 named projects, each with its own client / duration / role-on-project / team-size / environment.
- If the source CV has a clear "Projects" section separate from work history → populate projects[].
- If the source CV blends projects into job descriptions (no separate Projects section) → leave projects empty/undefined; details stay in employmentHistory[].description or responsibilities.
- NEVER double-count: a project should not also appear as an employmentHistory entry.

Example projects[] entry (only when the CV has a separate Projects section):
{
  "name": "Core Banking Migration",
  "client": "HSBC",
  "duration": "Mar 2023 – Aug 2023",
  "role": "Lead Business Analyst",
  "teamSize": "12",
  "environment": ["Jira", "Confluence", "BPMN", "SQL"],
  "description": "Replatformed legacy retail banking flows onto a microservices core.",
  "responsibilities": ["Authored 40+ user stories", "Ran daily refinement"]
}

keyAchievement (per employmentHistory entry):
- Many CVs (especially BA / PM / consulting CVs) end each job with a "Key Achievement:" paragraph or bold lead-in summarising the most impactful result.
- Extract that as a single string into keyAchievement. If no clear key achievement is stated, leave it undefined.
- Example: "Key Achievement: Cut onboarding time from 12 days to 3 days, saving £1.4M annually."

location (per employmentHistory entry):
- If a job entry has an explicit location annotation like "Sheffield, UK" or "Bangalore, India", extract it into location.
- Leave undefined if location is not stated for that job.

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
  const apiKey = await resolveAnthropicKey(tenantId)
  const anthropic = new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 })
  const cvText = await loadCandidateCvText(candidateId, tenantId)
  const input = capInputForClaude(cvText, candidateId)
  const startedAt = Date.now()
  const response = await callClaudeWithSynechronTool(anthropic, input)
  logAiUsage({
    tenantId,
    userId: null,
    operation: 'synechron_extract',
    model: response.model,
    usage: anthropicUsageToInput(response.usage),
    durationMs: Date.now() - startedAt,
    metadata: { candidateId, inputChars: input.length },
  }).catch(() => {})
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
  anthropic: Anthropic,
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
