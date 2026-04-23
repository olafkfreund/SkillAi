/**
 * Unit tests for TranscriptAnalysisSchema and analyzeTranscriptWithClaude
 *
 * Schema tests: validate/reject various inputs against the Zod schema.
 * Analysis tests: mock the Anthropic client, verify the function parses
 * tool_use output and throws on bad responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TranscriptAnalysisSchema } from '@/lib/ai/transcript-schemas'

// ── Valid fixture ─────────────────────────────────────────────────────────────

const VALID_ANALYSIS = {
  overall_score: 78,
  dimensions: {
    communication: { score: 82, reasoning: 'Clear and articulate throughout.' },
    technical_depth: { score: 75, reasoning: 'Good depth on TypeScript but shallow on infra.' },
    problem_solving: { score: 80, reasoning: 'Structured thinking, used STAR method.' },
    social_fit: { score: 74, reasoning: 'Collaborative language, mentioned team wins.' },
  },
  summary: 'Alice performed well across all dimensions with particular strength in communication.',
  strengths: ['Clear communication', 'TypeScript expertise'],
  red_flags: ['Shallow on infrastructure'],
  recommended_decision: 'proceed',
  question_responses: [
    {
      question_text: 'Tell me about TypeScript.',
      transcript_excerpt: 'I have used TypeScript for three years...',
      quality: 'strong',
      notes: 'Gave concrete examples.',
    },
  ],
}

// ── TranscriptAnalysisSchema ──────────────────────────────────────────────────

describe('TranscriptAnalysisSchema', () => {
  it('parses a fully valid analysis object', () => {
    expect(TranscriptAnalysisSchema.safeParse(VALID_ANALYSIS).success).toBe(true)
  })

  it('accepts empty question_responses array', () => {
    const input = { ...VALID_ANALYSIS, question_responses: [] }
    expect(TranscriptAnalysisSchema.safeParse(input).success).toBe(true)
  })

  it('defaults question_responses to [] when omitted', () => {
    const { question_responses: _, ...noQr } = VALID_ANALYSIS
    const result = TranscriptAnalysisSchema.safeParse(noQr)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.question_responses).toEqual([])
  })

  it('rejects overall_score below 0', () => {
    const bad = { ...VALID_ANALYSIS, overall_score: -1 }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects overall_score above 100', () => {
    const bad = { ...VALID_ANALYSIS, overall_score: 101 }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects non-integer overall_score', () => {
    const bad = { ...VALID_ANALYSIS, overall_score: 78.5 }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects invalid recommended_decision value', () => {
    const bad = { ...VALID_ANALYSIS, recommended_decision: 'maybe' }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts all valid recommended_decision values', () => {
    for (const decision of ['proceed', 'consider', 'decline']) {
      const input = { ...VALID_ANALYSIS, recommended_decision: decision }
      expect(TranscriptAnalysisSchema.safeParse(input).success).toBe(true)
    }
  })

  it('rejects dimension score above 100', () => {
    const bad = {
      ...VALID_ANALYSIS,
      dimensions: {
        ...VALID_ANALYSIS.dimensions,
        communication: { score: 101, reasoning: 'Too high' },
      },
    }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects missing required dimensions', () => {
    const bad = {
      ...VALID_ANALYSIS,
      dimensions: { communication: VALID_ANALYSIS.dimensions.communication },
    }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects question quality value outside enum', () => {
    const bad = {
      ...VALID_ANALYSIS,
      question_responses: [{ ...VALID_ANALYSIS.question_responses[0], quality: 'excellent' }],
    }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects strengths array exceeding 5 items', () => {
    const bad = { ...VALID_ANALYSIS, strengths: Array(6).fill('strength') }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects red_flags array exceeding 5 items', () => {
    const bad = { ...VALID_ANALYSIS, red_flags: Array(6).fill('flag') }
    expect(TranscriptAnalysisSchema.safeParse(bad).success).toBe(false)
  })
})

// ── analyzeTranscriptWithClaude ───────────────────────────────────────────────

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

describe('analyzeTranscriptWithClaude()', () => {
  let analyzeTranscriptWithClaude: typeof import('@/lib/ai/transcript-analysis').analyzeTranscriptWithClaude

  beforeEach(async () => {
    mockCreate.mockReset()
    const mod = await import('@/lib/ai/transcript-analysis')
    analyzeTranscriptWithClaude = mod.analyzeTranscriptWithClaude
  })

  it('returns parsed TranscriptAnalysis on valid tool_use response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'submit_transcript_analysis',
          input: VALID_ANALYSIS,
        },
      ],
    })

    const result = await analyzeTranscriptWithClaude({
      transcriptText: '[Alice]: I have used TypeScript for three years.',
      roleTitle: 'Senior Engineer',
      roleDescription: 'Build scalable systems.',
      roleRequirements: 'TypeScript, Node.js',
    })

    expect(result.overall_score).toBe(78)
    expect(result.recommended_decision).toBe('proceed')
    expect(result.dimensions.communication.score).toBe(82)
  })

  it('throws when Claude returns no tool_use block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here is my analysis...' }],
    })

    await expect(
      analyzeTranscriptWithClaude({
        transcriptText: 'Some text',
        roleTitle: 'Engineer',
        roleDescription: 'Build things',
        roleRequirements: 'TypeScript',
      })
    ).rejects.toThrow('tool_use')
  })

  it('throws when tool_use input fails schema validation', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'submit_transcript_analysis',
          input: { overall_score: 999, dimensions: {} },
        },
      ],
    })

    await expect(
      analyzeTranscriptWithClaude({
        transcriptText: 'Some text',
        roleTitle: 'Engineer',
        roleDescription: 'Build things',
        roleRequirements: 'TypeScript',
      })
    ).rejects.toThrow('schema validation')
  })

  it('includes optional pack questions in the prompt when provided', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'submit_transcript_analysis', input: VALID_ANALYSIS }],
    })

    await analyzeTranscriptWithClaude({
      transcriptText: '[Alice]: TypeScript is great.',
      roleTitle: 'Senior Engineer',
      roleDescription: 'Build scalable systems.',
      roleRequirements: 'TypeScript',
      packQuestions: [
        {
          questionText: 'Tell me about TypeScript.',
          strongAnswerSignals: ['Concrete examples', 'Type safety'],
        },
      ],
    })

    const callArg = mockCreate.mock.calls[0][0]
    const userText = JSON.stringify(callArg.messages[0].content)
    expect(userText).toContain('Tell me about TypeScript.')
    expect(userText).toContain('Concrete examples')
  })
})
