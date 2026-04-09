/**
 * Extracts key skills and top requirements from a role description using Claude.
 * Returns structured tag arrays suitable for display and candidate matching.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const TAG_TOOL: Anthropic.Tool = {
  name: 'submit_role_tags',
  description: 'Submit extracted skill and requirement tags for a job role',
  input_schema: {
    type: 'object' as const,
    properties: {
      key_skills: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Up to 12 short technical skill or technology tags (e.g. "Python", "AWS", "Kubernetes", "React"). Each tag max 30 characters.',
      },
      top_requirements: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Up to 6 short must-have requirement phrases (e.g. "5+ years experience", "Team lead", "Cloud architect", "Security clearance"). Each max 40 characters.',
      },
    },
    required: ['key_skills', 'top_requirements'],
  },
}

export interface RoleTags {
  keySkills: string[]
  topRequirements: string[]
}

export async function extractRoleTags(
  title: string,
  description: string,
  requirements: string
): Promise<RoleTags> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    tools: [TAG_TOOL],
    tool_choice: { type: 'tool', name: 'submit_role_tags' },
    messages: [
      {
        role: 'user',
        content: `Extract concise skill tags and top requirements from this job role.

ROLE: ${title}

DESCRIPTION:
${description.slice(0, 2000)}

REQUIREMENTS:
${requirements.slice(0, 2000)}

Rules:
- key_skills: technical skills, tools, languages, frameworks only — short nouns (max 12 tags, max 30 chars each)
- top_requirements: critical must-have requirements as short phrases (max 6 tags, max 40 chars each)
- No duplicates between the two lists
- Be specific and concrete, not generic ("PostgreSQL" not "databases")`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return tool_use block for role tag extraction')
  }

  const raw = toolUse.input as { key_skills: string[]; top_requirements: string[] }
  return {
    keySkills: (raw.key_skills ?? []).slice(0, 12),
    topRequirements: (raw.top_requirements ?? []).slice(0, 6),
  }
}
