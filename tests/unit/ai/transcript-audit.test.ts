/**
 * Unit tests for `transcript_analysis.completed` / `transcript_analysis.failed`
 * audit emits + `skill_used` metadata enrichment in
 * `src/lib/ai/transcript-analysis.ts` (closes #212, part of Epic #190).
 *
 * Why a dedicated test file:
 *   - Mirrors `scoring-skill-audit.test.ts` (PR #209) which lives next to
 *     each AI surface under test rather than co-located with the action.
 *   - `triggerTranscriptAnalysis` is the outermost orchestrator and writes
 *     the audit row. The inner `analyzeTranscriptWithClaude` is mocked here.
 *
 * Coverage:
 *   1. Happy path, toggle OFF → `transcript_analysis.completed` with
 *      `skill_used: null` and the existing metadata fields preserved.
 *   2. Happy path, toggle ON  → same emit with `skill_used: 'recruiter-eu-uk'`.
 *   3. Failure path, toggle OFF → `transcript_analysis.failed` with
 *      `error` + `skill_used: null`.
 *   4. Failure path, toggle ON  → same emit with `skill_used: <profile>`.
 *
 * Mocked surface (mirrors scoring-skill-audit.test.ts):
 *   - `@/db`                              — withTenant invokes callback with stub tx
 *   - `@/db/schema`                       — table stubs
 *   - `drizzle-orm`                       — eq pass-through
 *   - `@/lib/audit-middleware`            — emitAudit spy
 *   - `@/actions/settings`                — getHrSkillSettings (toggle off/on)
 *   - `./skills`                          — loadHrSkill returns { name, content: '' }
 *   - `./transcript-analysis` (inner)     — analyzeTranscriptWithClaude mocked
 *     via a re-export trick: we mock the underlying anthropic SDK and key
 *     resolver so the function's own logic short-circuits. Cleaner: mock the
 *     orchestrator's dependencies on the same module — see below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID     = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TRANSCRIPT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ROLE_ID       = '11111111-1111-4111-8111-111111111111'

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────

const {
  mockEmitAudit,
  mockGetHrSkillSettings,
  mockAnalyzeTranscriptWithClaude,
} = vi.hoisted(() => ({
  mockEmitAudit: vi.fn(),
  mockGetHrSkillSettings: vi.fn(),
  mockAnalyzeTranscriptWithClaude: vi.fn(),
}))

// withTenant returns row-sets queued in arrival order. Each `tx.select()`
// dequeues one row-set; `tx.update()` is a no-op. Mirrors the helper in
// scoring-skill-audit.test.ts.
let queueSelectRows: unknown[][] = []
let _selectCallIndex = 0

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  const resolved = Promise.resolve(rows)
  c.then  = resolved.then.bind(resolved)
  c.catch = resolved.catch.bind(resolved)
  c.from  = vi.fn(() => c)
  c.where = vi.fn(() => c)
  c.limit = vi.fn(() => Promise.resolve(rows))
  return c
}

vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => {
          const nextRows = queueSelectRows[_selectCallIndex] ?? []
          _selectCallIndex++
          return makeSelectChain(nextRows)
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          })),
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  interviewTranscripts: { id: 'id' },
  transcriptAnalyses: { transcriptId: 'tid' },
  roles: { id: 'id' },
  interviewQuestions: {
    questionText: 'qtext',
    strongAnswerSignals: 'signals',
    packId: 'pid',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
}))

vi.mock('@/lib/audit-middleware', () => ({
  emitAudit: (...args: unknown[]) => mockEmitAudit(...args),
}))

vi.mock('@/actions/settings', () => ({
  getHrSkillSettings: (...args: unknown[]) => mockGetHrSkillSettings(...args),
}))

vi.mock('@/lib/ai/skills', () => ({
  loadHrSkill: (profile: string) => ({ name: profile, content: '' }),
}))

// We mock `analyzeTranscriptWithClaude` by intercepting the module — the
// orchestrator imports it relatively (`./transcript-schemas`, then calls the
// in-file `analyzeTranscriptWithClaude`). Because the function lives in the
// SAME module as `triggerTranscriptAnalysis`, we cannot easily mock just one
// export without breaking the other. Instead we mock the underlying SDK +
// key resolver so the real `analyzeTranscriptWithClaude` short-circuits via
// our stubbed Anthropic client. This matches the pattern used elsewhere in
// the test suite for in-module collaborators.
vi.mock('@anthropic-ai/sdk', () => {
  // Default export is the Anthropic constructor — must be `new`-able.
  class Anthropic {
    messages = {
      create: (...args: unknown[]) => mockAnalyzeTranscriptWithClaude(...args),
    }
  }
  return { default: Anthropic }
})

vi.mock('@/lib/ai/keys', () => ({
  resolveAnthropicKey: vi.fn().mockResolvedValue('test-key'),
}))

vi.mock('@/lib/ai/usage-logger', () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
  anthropicUsageToInput: vi.fn(() => ({})),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_ANALYSIS_TOOL_INPUT = {
  overall_score: 82,
  dimensions: {
    communication:    { score: 80, reasoning: 'clear' },
    technical_depth:  { score: 85, reasoning: 'deep' },
    problem_solving:  { score: 78, reasoning: 'structured' },
    social_fit:       { score: 84, reasoning: 'collaborative' },
  },
  summary: 'Solid interview performance.',
  strengths: ['communication', 'examples'],
  red_flags: [],
  recommended_decision: 'proceed',
  question_responses: [],
}

// Anthropic `messages.create` response shape — the orchestrator calls
// `analyzeTranscriptWithClaude` which calls Anthropic twice: once for
// language detection (Haiku, returns text block) and once for the main
// analysis (Sonnet, returns tool_use block). We return a single canned
// response that satisfies BOTH paths — the language detector reads
// `content[].text` and the analyzer reads `content[].tool_use`.
const FAKE_ANTHROPIC_RESPONSE = {
  id: 'msg_test',
  model: 'claude-sonnet-4-6',
  usage: { input_tokens: 100, output_tokens: 50 },
  content: [
    // Satisfies language detection — first text block, "en" inferred.
    { type: 'text', text: 'en' },
    // Satisfies main analysis — tool_use block with parsed input.
    { type: 'tool_use', name: 'submit_transcript_analysis', input: FAKE_ANALYSIS_TOOL_INPUT },
  ],
}

function queueRowsForHappyPath() {
  // triggerTranscriptAnalysis select-order:
  //   1. transcript (select.from.where.limit)
  //   2. role (select.from.where.limit)
  //   (no pack questions — transcript.packId is null)
  queueSelectRows = [
    [{
      id: TRANSCRIPT_ID,
      roleId: ROLE_ID,
      packId: null,
      rawTranscriptText: 'Interviewer: Tell me about yourself...',
    }],
    [{
      id: ROLE_ID,
      title: 'Senior Engineer',
      description: 'Build things',
      requirements: 'TypeScript',
      priorityKeywords: [],
    }],
  ]
  _selectCallIndex = 0
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('triggerTranscriptAnalysis — audit emits + skill_used metadata (#212)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueRowsForHappyPath()
    mockAnalyzeTranscriptWithClaude.mockResolvedValue(FAKE_ANTHROPIC_RESPONSE)
  })

  it('emits transcript_analysis.completed with skill_used: null when HR skill toggle is OFF', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })

    const { triggerTranscriptAnalysis } = await import('@/lib/ai/transcript-analysis')
    await triggerTranscriptAnalysis(TRANSCRIPT_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'transcript_analysis.completed',
        entityType: 'transcript',
        entityId: TRANSCRIPT_ID,
        metadata: expect.objectContaining({
          model: 'claude',
          overallScore: 82,
          skill_used: null,
        }),
      })
    )
    // durationMs is non-deterministic but should be a number ≥ 0
    const call = mockEmitAudit.mock.calls.find(
      (c) => (c[1] as { action: string }).action === 'transcript_analysis.completed'
    )
    expect(call).toBeDefined()
    expect(typeof (call![1] as { metadata: { durationMs: number } }).metadata.durationMs).toBe('number')
  })

  it('emits transcript_analysis.completed with skill_used: profile name when HR skill toggle is ON', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })

    const { triggerTranscriptAnalysis } = await import('@/lib/ai/transcript-analysis')
    await triggerTranscriptAnalysis(TRANSCRIPT_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'transcript_analysis.completed',
        metadata: expect.objectContaining({ skill_used: 'recruiter-eu-uk' }),
      })
    )
  })

  it('emits transcript_analysis.failed with error + skill_used: null when toggle is OFF and Claude throws', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })
    mockAnalyzeTranscriptWithClaude.mockRejectedValue(new Error('Claude exploded'))

    const { triggerTranscriptAnalysis } = await import('@/lib/ai/transcript-analysis')
    await triggerTranscriptAnalysis(TRANSCRIPT_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'transcript_analysis.failed',
        entityType: 'transcript',
        entityId: TRANSCRIPT_ID,
        metadata: expect.objectContaining({
          error: 'Claude exploded',
          skill_used: null,
        }),
      })
    )
  })

  it('emits transcript_analysis.failed with skill_used: profile name when toggle is ON and Claude throws', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'talent-acquisition' })
    mockAnalyzeTranscriptWithClaude.mockRejectedValue(new Error('Tool input invalid'))

    const { triggerTranscriptAnalysis } = await import('@/lib/ai/transcript-analysis')
    await triggerTranscriptAnalysis(TRANSCRIPT_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'transcript_analysis.failed',
        metadata: expect.objectContaining({
          error: 'Tool input invalid',
          skill_used: 'talent-acquisition',
        }),
      })
    )
  })
})
