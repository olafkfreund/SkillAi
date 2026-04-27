import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicKey } from './keys'
import { formatManagerPriorities } from './priorities'

type CandidateSummaryInput = {
  name: string
  overallScore: number
  technicalScore: number | null
  experienceScore: number | null
  culturalFitScore: number | null
  communicationScore: number | null
  aiSummary: string | null
}

export async function generateShortlistSummary(
  roleTitle: string,
  roleRequirements: string,
  candidates: CandidateSummaryInput[],
  tenantId: string,
  priorityKeywords?: readonly string[]
): Promise<string> {
  const apiKey = await resolveAnthropicKey(tenantId)
  const client = new Anthropic({ apiKey })

  const candidateDescriptions = candidates
    .slice(0, 5)
    .map((c, i) => `
${i + 1}. ${c.name} — Overall: ${c.overallScore}/100
   Technical: ${c.technicalScore ?? 'N/A'}, Experience: ${c.experienceScore ?? 'N/A'}, Cultural Fit: ${c.culturalFitScore ?? 'N/A'}, Communication: ${c.communicationScore ?? 'N/A'}
   AI Summary: ${c.aiSummary ?? 'Not available'}
    `.trim()).join('\n\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a senior recruitment advisor. Write a concise hiring recommendation for the following role and shortlisted candidates.

ROLE: ${roleTitle}
REQUIREMENTS: ${roleRequirements}${formatManagerPriorities(priorityKeywords)}

SHORTLISTED CANDIDATES:
${candidateDescriptions}

Write a 3-4 paragraph recommendation that:
1. Identifies the strongest candidate and why
2. Notes key differentiators between the top 2-3 candidates
3. Highlights any red flags or notable weaknesses
4. Recommends the interview order (who to see first)

Be direct and specific. Reference candidate names. Keep it under 300 words.`
    }]
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')
  return content.text
}
