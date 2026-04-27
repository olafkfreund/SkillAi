import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicKey } from './keys'
import { formatManagerPriorities } from './priorities'
import { logAiUsage, anthropicUsageToInput } from './usage-logger'

type RoleInput = {
  roleId: string
  roleTitle: string
  roleRequirements: string
  priorityKeywords?: readonly string[]
}

export type RoleFitResult = {
  roleId: string
  fitScore: number       // 0-100
  pros: string[]         // 2-4 items
  cons: string[]         // 1-3 items
  headline: string       // one-sentence summary, e.g. "Strong technical fit, limited leadership experience"
}

// Shape returned by the tool_use block
type ToolResultPayload = {
  results: Array<{
    roleId: string
    fitScore: number
    headline: string
    pros: string[]
    cons: string[]
  }>
}

/**
 * Analyse how well a candidate's CV fits a set of active roles.
 *
 * Sends a single Claude request using forced tool calling so the response is
 * always a structured JSON array — no unstructured text parsing required.
 *
 * @param candidateName - Full name of the candidate (used in prompt for readability)
 * @param cvText        - Raw CV text extracted from the uploaded file
 * @param roles         - Active roles the candidate has NOT yet been scored against
 * @param tenantId      - Used to resolve the correct Anthropic API key
 * @returns             - Sorted array of RoleFitResult (Claude may omit roles it cannot analyse)
 */
export async function analyseRoleFitForCandidate(
  candidateName: string,
  cvText: string,
  roles: RoleInput[],
  tenantId: string
): Promise<RoleFitResult[]> {
  if (roles.length === 0) return []

  const apiKey = await resolveAnthropicKey(tenantId)
  const client = new Anthropic({ apiKey })

  const rolesBlock = roles
    .map(
      (r, i) =>
        `${i + 1}. ${r.roleTitle} (id: ${r.roleId})\nRequirements: ${r.roleRequirements.slice(0, 500)}${formatManagerPriorities(r.priorityKeywords)}`
    )
    .join('\n\n')

  const userPrompt = `You are a senior recruiter. Analyse how well this candidate fits each of the following roles.

CANDIDATE: ${candidateName}
CV (excerpt):
${cvText.slice(0, 6000)}

ROLES TO ANALYSE:
${rolesBlock}

For each role, return:
- fitScore: 0-100 overall fit
- headline: one-sentence summary of the fit
- pros: 2-4 specific strengths from the CV that match this role
- cons: 1-3 gaps or weaknesses relative to this role's requirements

Be specific and reference the CV content. Use the submit_role_fits tool.`

  const startedAt = Date.now()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tool_choice: { type: 'tool', name: 'submit_role_fits' },
    tools: [
      {
        name: 'submit_role_fits',
        description: 'Submit the role-fit analysis results for all evaluated roles.',
        input_schema: {
          type: 'object' as const,
          properties: {
            results: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  roleId: { type: 'string' as const },
                  fitScore: { type: 'integer' as const, minimum: 0, maximum: 100 },
                  headline: { type: 'string' as const },
                  pros: { type: 'array' as const, items: { type: 'string' as const } },
                  cons: { type: 'array' as const, items: { type: 'string' as const } },
                },
                required: ['roleId', 'fitScore', 'headline', 'pros', 'cons'],
              },
            },
          },
          required: ['results'],
        },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  logAiUsage({
    tenantId,
    userId: null,
    operation: 'role_fit',
    model: message.model,
    usage: anthropicUsageToInput(message.usage),
    durationMs: Date.now() - startedAt,
    metadata: { candidateName, roleCount: roles.length },
  }).catch(() => {})

  // Extract the tool_use block from the response
  const toolUseBlock = message.content.find((block) => block.type === 'tool_use')
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    console.error('[role-fit] Claude did not return a tool_use block')
    return []
  }

  const payload = toolUseBlock.input as ToolResultPayload

  if (!Array.isArray(payload.results)) {
    console.error('[role-fit] Tool payload missing results array')
    return []
  }

  // Validate and normalise each result; silently drop malformed entries
  const results: RoleFitResult[] = payload.results.flatMap((r) => {
    if (
      typeof r.roleId !== 'string' ||
      typeof r.fitScore !== 'number' ||
      typeof r.headline !== 'string' ||
      !Array.isArray(r.pros) ||
      !Array.isArray(r.cons)
    ) {
      return []
    }
    return [
      {
        roleId: r.roleId,
        fitScore: Math.min(100, Math.max(0, Math.round(r.fitScore))),
        headline: r.headline,
        pros: r.pros.filter((p): p is string => typeof p === 'string'),
        cons: r.cons.filter((c): c is string => typeof c === 'string'),
      },
    ]
  })

  return results
}
