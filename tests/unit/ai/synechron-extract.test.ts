/**
 * Unit tests for extractSynechronCvData.
 *
 * Mocks the Anthropic SDK at the module boundary, plus @/db (withTenant)
 * and @/lib/audit. Asserts on the publicly observable behaviour:
 *  - returns parsed SynechronCvData when Claude returns a valid tool_use block
 *  - throws when the candidate has no CV text
 *  - throws when Claude returns no tool_use block
 *  - throws when the tool_use input fails Zod validation
 *
 * Error messages are not asserted — only the throw is verified — so the
 * extractor's wording can change without breaking these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockCreate, mockSelectResult, mockUpdateRun } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSelectResult: vi.fn().mockResolvedValue([{ cvText: 'Default CV text body' }]),
  mockUpdateRun: vi.fn().mockResolvedValue(undefined),
}))

// Anthropic SDK — default export is a class with `messages.create`.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

// withTenant runs the callback with a fake tx that supports both
// `select().from().where().limit()` (load) and `update().set().where()` (persist).
vi.mock('@/db', () => ({
  db: {},
  withTenant: async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => mockSelectResult(),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => mockUpdateRun(),
        }),
      }),
    }
    return fn(tx)
  },
}))

vi.mock('@/db/schema/candidates', () => ({
  candidates: {
    id: 'id',
    tenantId: 'tenant_id',
    cvText: 'cv_text',
    synechronCvData: 'synechron_cv_data',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  // Schema files use `sql\`'{}'::text[]\`` for array column defaults; stub it.
  sql: Object.assign(
    vi.fn(() => ({ _sql: true })),
    { raw: vi.fn(() => ({ _sql: 'raw' })) }
  ),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

// ── Module under test (imported AFTER mocks) ─────────────────────────────────
import { extractSynechronCvData } from '@/lib/ai/synechron-extract'

const CANDIDATE_ID = '00000000-0000-0000-0000-0000000000aa'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const VALID_TOOL_INPUT = {
  candidateName: 'Jane Doe',
  jobTitle: 'Senior Engineer',
  overallExperience: '12+ years',
  skillsCategorised: [{ category: 'Languages', skills: ['Go', 'TypeScript'] }],
  employmentHistory: [
    {
      company: 'Acme',
      role: 'Senior Engineer',
      dates: 'Jan 2020 – Present',
      responsibilities: ['Code review'],
    },
  ],
}

function mockClaudeToolUseResponse(input: unknown) {
  return {
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 200 },
    content: [
      {
        type: 'tool_use',
        name: 'synechron_cv_data',
        input,
      },
    ],
  }
}

describe('extractSynechronCvData()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: candidate has CV text available.
    mockSelectResult.mockResolvedValue([{ cvText: 'Jane Doe — 12 years experience...' }])
    mockUpdateRun.mockResolvedValue(undefined)
  })

  it('returns parsed SynechronCvData when Claude returns a valid tool_use block', async () => {
    mockCreate.mockResolvedValueOnce(mockClaudeToolUseResponse(VALID_TOOL_INPUT))

    const result = await extractSynechronCvData(CANDIDATE_ID, TENANT_ID)

    expect(result.candidateName).toBe('Jane Doe')
    expect(result.jobTitle).toBe('Senior Engineer')
    expect(result.skillsCategorised).toEqual([
      { category: 'Languages', skills: ['Go', 'TypeScript'] },
    ])
    // Persistence ran.
    expect(mockUpdateRun).toHaveBeenCalledOnce()
  })

  it('returns parsed data even when AI emits an empty object (all fields optional)', async () => {
    mockCreate.mockResolvedValueOnce(mockClaudeToolUseResponse({}))

    const result = await extractSynechronCvData(CANDIDATE_ID, TENANT_ID)

    expect(result).toEqual({})
    expect(mockUpdateRun).toHaveBeenCalledOnce()
  })

  it('throws when candidate has no CV text', async () => {
    mockSelectResult.mockResolvedValueOnce([{ cvText: null }])

    await expect(extractSynechronCvData(CANDIDATE_ID, TENANT_ID)).rejects.toThrow()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdateRun).not.toHaveBeenCalled()
  })

  it('throws when candidate row is missing entirely', async () => {
    mockSelectResult.mockResolvedValueOnce([])

    await expect(extractSynechronCvData(CANDIDATE_ID, TENANT_ID)).rejects.toThrow()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws when Claude returns no tool_use block (text-only response)', async () => {
    mockCreate.mockResolvedValueOnce({
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
      content: [{ type: 'text', text: "Sorry, I can't structure that." }],
    })

    await expect(extractSynechronCvData(CANDIDATE_ID, TENANT_ID)).rejects.toThrow()
    // No persistence on failure.
    expect(mockUpdateRun).not.toHaveBeenCalled()
  })

  it('throws when tool_use input fails schema validation', async () => {
    // domains: string is a shape mismatch — schema demands string[].
    mockCreate.mockResolvedValueOnce(
      mockClaudeToolUseResponse({ domains: 'Banking' })
    )

    await expect(extractSynechronCvData(CANDIDATE_ID, TENANT_ID)).rejects.toThrow()
    expect(mockUpdateRun).not.toHaveBeenCalled()
  })
})
