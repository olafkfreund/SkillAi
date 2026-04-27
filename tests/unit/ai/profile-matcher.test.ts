/**
 * Unit tests for verifyProfilesAgainstCv.
 *
 * Mocks the Anthropic SDK at the module boundary. Asserts on the publicly
 * observable behaviour:
 *  - empty candidates input short-circuits without an API call
 *  - returns parsed MatchVerdict[] when Claude returns a valid tool_use block
 *  - prompt batches multiple candidates with [1] [2] [3] indexing
 *  - throws when Claude returns no tool_use block
 *  - throws when tool input fails Zod validation
 *  - returned array length matches input candidate count
 *
 * Error messages are not asserted — only the throw is verified — so the
 * helper's wording can change without breaking these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

// Anthropic SDK — default export is a class with `messages.create`.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

// ── Module under test (imported AFTER mocks) ─────────────────────────────────
import {
  verifyProfilesAgainstCv,
  type CvSignals,
  type ProfileCandidate,
} from '@/lib/ai/profile-matcher'

const CV_SIGNALS: CvSignals = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  currentCompany: 'Acme',
  pastCompanies: ['Initech'],
  location: 'London, UK',
  topSkills: ['TypeScript', 'Go', 'Kubernetes'],
}

const STRONG_MATCH_CANDIDATE: ProfileCandidate = {
  url: 'https://linkedin.com/in/janedoe',
  snippet: 'Jane Doe — Senior Engineer at Acme — London',
  source: 'linkedin',
}

const WEAK_MATCH_CANDIDATE: ProfileCandidate = {
  url: 'https://github.com/janedoe-dev',
  snippet: 'Jane Doe contributor',
  source: 'github',
}

const THIRD_CANDIDATE: ProfileCandidate = {
  url: 'https://stackoverflow.com/users/12345/jane-doe',
  snippet: 'Jane Doe — Stack Overflow profile',
  source: 'stack_overflow',
}

function mockClaudeToolUseResponse(input: unknown) {
  return {
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 200 },
    content: [
      {
        type: 'tool_use',
        name: 'submit_profile_verdicts',
        input,
      },
    ],
  }
}

describe('verifyProfilesAgainstCv()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] without calling Anthropic when candidates list is empty', async () => {
    const result = await verifyProfilesAgainstCv(CV_SIGNALS, [])

    expect(result).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns parsed verdicts when Claude returns a high-confidence match', async () => {
    mockCreate.mockResolvedValueOnce(
      mockClaudeToolUseResponse({
        verdicts: [
          {
            url: STRONG_MATCH_CANDIDATE.url,
            confidence: 92,
            category: 'high',
            reason: 'Exact name match plus same current company (Acme).',
          },
        ],
      }),
    )

    const result = await verifyProfilesAgainstCv(CV_SIGNALS, [STRONG_MATCH_CANDIDATE])

    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBeGreaterThanOrEqual(85)
    expect(result[0].category).toBe('high')
    expect(result[0].url).toBe(STRONG_MATCH_CANDIDATE.url)
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('lists all candidates with [1] [2] [3] indexing in the prompt', async () => {
    mockCreate.mockResolvedValueOnce(
      mockClaudeToolUseResponse({
        verdicts: [
          { url: STRONG_MATCH_CANDIDATE.url, confidence: 90, category: 'high', reason: 'name+company' },
          { url: WEAK_MATCH_CANDIDATE.url, confidence: 50, category: 'low', reason: 'name only' },
          { url: THIRD_CANDIDATE.url, confidence: 30, category: 'not_match', reason: 'no signal' },
        ],
      }),
    )

    await verifyProfilesAgainstCv(CV_SIGNALS, [
      STRONG_MATCH_CANDIDATE,
      WEAK_MATCH_CANDIDATE,
      THIRD_CANDIDATE,
    ])

    expect(mockCreate).toHaveBeenCalledOnce()
    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content as string

    expect(userMessage).toContain('[1]')
    expect(userMessage).toContain('[2]')
    expect(userMessage).toContain('[3]')
    expect(userMessage).toContain(STRONG_MATCH_CANDIDATE.url)
    expect(userMessage).toContain(WEAK_MATCH_CANDIDATE.url)
    expect(userMessage).toContain(THIRD_CANDIDATE.url)
    expect(userMessage).toContain('LINKEDIN')
    expect(userMessage).toContain('GITHUB')
    expect(userMessage).toContain('STACK_OVERFLOW')
  })

  it('throws when Claude returns no tool_use block (text-only response)', async () => {
    mockCreate.mockResolvedValueOnce({
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [{ type: 'text', text: "I can't verify these." }],
    })

    await expect(
      verifyProfilesAgainstCv(CV_SIGNALS, [STRONG_MATCH_CANDIDATE]),
    ).rejects.toThrow()
  })

  it('throws when tool input fails Zod validation (confidence > 100)', async () => {
    mockCreate.mockResolvedValueOnce(
      mockClaudeToolUseResponse({
        verdicts: [
          {
            url: STRONG_MATCH_CANDIDATE.url,
            confidence: 150, // out of bounds
            category: 'high',
            reason: 'overconfident model',
          },
        ],
      }),
    )

    await expect(
      verifyProfilesAgainstCv(CV_SIGNALS, [STRONG_MATCH_CANDIDATE]),
    ).rejects.toThrow()
  })

  it('returns array length equal to input length for batched requests', async () => {
    mockCreate.mockResolvedValueOnce(
      mockClaudeToolUseResponse({
        verdicts: [
          { url: STRONG_MATCH_CANDIDATE.url, confidence: 90, category: 'high', reason: 'name+company' },
          { url: WEAK_MATCH_CANDIDATE.url, confidence: 55, category: 'low', reason: 'name only' },
          { url: THIRD_CANDIDATE.url, confidence: 25, category: 'not_match', reason: 'no signal' },
        ],
      }),
    )

    const inputs = [STRONG_MATCH_CANDIDATE, WEAK_MATCH_CANDIDATE, THIRD_CANDIDATE]
    const result = await verifyProfilesAgainstCv(CV_SIGNALS, inputs)

    expect(result).toHaveLength(inputs.length)
  })
})
