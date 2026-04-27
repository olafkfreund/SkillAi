/**
 * AI CV reformatting
 *
 * Cleans up raw extracted CV text (PDF/DOCX/etc) into well-structured
 * markdown using Claude Haiku. Persists the result to candidates.cv_text_formatted
 * so the display and PDF export can use it without re-running the AI.
 *
 * Pattern mirrors src/lib/ai/cv-profile.ts — same tool_use approach,
 * same model, same fire-and-forget upsert flow.
 */

import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates } from '@/db/schema'
import { logAiUsage, anthropicUsageToInput } from './usage-logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 120_000,
})

const REFORMAT_TOOL: Anthropic.Tool = {
  name: 'submit_formatted_cv',
  description: 'Submit a cleanly reformatted CV in markdown',
  input_schema: {
    type: 'object' as const,
    properties: {
      formatted_cv: {
        type: 'string',
        description: 'The CV reformatted as clean, well-structured markdown',
      },
    },
    required: ['formatted_cv'],
  },
}

const MAX_INPUT_CHARS = 12_000

/**
 * Use Claude Haiku to reformat raw CV text into clean markdown.
 *
 * The prompt explicitly forbids inventing or dropping facts — formatting
 * only. Output uses standard markdown: # / ## headings, - bullets, blank
 * lines between sections.
 */
export async function reformatCvText(
  cvText: string,
  tenantId: string,
  candidateId?: string
): Promise<string> {
  const truncated = cvText.length > MAX_INPUT_CHARS
  const input = truncated ? cvText.slice(0, MAX_INPUT_CHARS) : cvText

  const startedAt = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    tools: [REFORMAT_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: `Reformat this raw CV text into clean, well-structured markdown.

RULES:
- Preserve ALL original information — every company, role, date, achievement, contact detail, skill must remain
- DO NOT invent or fabricate any facts
- DO NOT drop any content
- Fix structural problems: collapse multiple blank lines, remove mid-sentence line breaks, restore paragraph spacing, recover bullet lists where they were squashed
- Use markdown:
  - "# Name" for the candidate name at the top (if present)
  - "## SECTION HEADERS" for sections like Summary, Experience, Education, Skills, Projects, etc.
  - "### Job Title · Company" for individual roles within Experience (use middle dot · as separator)
  - "**Date range**" on its own line under each role
  - "- " for bulleted achievements / responsibilities
  - Blank line between sections
- Keep contact info (email, phone, location, links) at the top, one per line
- If the input has obvious table-like structures (dates left-aligned, content right), convert them to markdown lists or "Date — Content" lines
- Do not add emoji, do not editorialise, do not add a "Reformatted by AI" footer

Output via the submit_formatted_cv tool with the markdown only — no preamble, no code fences.

${truncated ? 'Note: input was truncated. Format what you have.\n\n' : ''}RAW CV TEXT:
${input}`,
      },
    ],
  })

  logAiUsage({
    tenantId,
    userId: null,
    operation: 'cv_reformat',
    model: response.model,
    usage: anthropicUsageToInput(response.usage),
    durationMs: Date.now() - startedAt,
    metadata: { candidateId, inputChars: input.length, truncated },
  }).catch(() => {})

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  )
  if (!toolBlock) {
    throw new Error(`CV reformat: Claude did not return a tool_use response (stop_reason: ${response.stop_reason})`)
  }

  const input2 = toolBlock.input as { formatted_cv?: string }
  if (!input2.formatted_cv || typeof input2.formatted_cv !== 'string') {
    throw new Error('CV reformat: tool response missing formatted_cv')
  }

  console.log(
    `[cv-reformat] model=${response.model}, in=${input.length} chars, out=${input2.formatted_cv.length} chars, usage=${JSON.stringify(response.usage)}`
  )

  return input2.formatted_cv
}

/**
 * Run reformat for a candidate and persist to cv_text_formatted column.
 * Throws on error so the caller (server action) can surface the message
 * to the user.
 */
export async function triggerCvReformat(candidateId: string, tenantId: string): Promise<void> {
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx.select({ cvText: candidates.cvText }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  )
  if (!candidate?.cvText) {
    throw new Error('Candidate has no CV text to reformat')
  }

  const formatted = await reformatCvText(candidate.cvText, tenantId, candidateId)

  await withTenant(tenantId, async (tx) =>
    tx
      .update(candidates)
      .set({ cvTextFormatted: formatted })
      .where(eq(candidates.id, candidateId))
  )
}
