/**
 * Unit tests for `skill_used` audit-metadata enrichment in
 * `src/lib/ai/scoring.ts` (closes #199).
 *
 * Why a dedicated test file rather than extending `tests/unit/actions/scores.test.ts`:
 *   - `triggerScoring` lives at `src/lib/ai/scoring.ts`, not in `src/actions`.
 *   - The scores-action test covers `rescoreCandidate` + `removeCandidateFromRole`,
 *     not `triggerScoring`. Co-locating these assertions in the action file
 *     would obscure where the behaviour lives.
 *
 * Coverage:
 *   1. Toggle OFF → audit metadata includes `skill_used: null` (NOT absent).
 *   2. Toggle ON  → audit metadata includes `skill_used: 'recruiter-eu-uk'`.
 *
 * Mocked surface:
 *   - `@/db`                              — withTenant + db.transaction
 *   - `@/db/schema`                       — table stubs
 *   - `drizzle-orm`                       — eq / and / sql pass-throughs
 *   - `@/lib/audit-middleware`            — emitAudit spy
 *   - `@/lib/notifications/dispatcher`    — dispatchHighScoreNotification no-op
 *   - `./claude`                          — scoreCandidateWithClaude returns canned score
 *   - `./gemini`                          — scoreCandidateWithGemini (unused, present for symmetry)
 *   - `@/actions/settings`                — getHrSkillSettings (toggle off/on)
 *   - `./skills`                          — loadHrSkill returns { name, content: '' }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROLE_ID      = '11111111-1111-4111-8111-111111111111'

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────

const { mockEmitAudit, mockGetHrSkillSettings, mockScoreCandidateWithClaude } = vi.hoisted(() => ({
  mockEmitAudit: vi.fn(),
  mockGetHrSkillSettings: vi.fn(),
  mockScoreCandidateWithClaude: vi.fn(),
}))

// withTenant: invoke the callback with a stub tx that resolves to the
// per-query rows configured via the module-scoped `queueSelectRows` array.
// This lets each test queue the candidate row, role row, and model-setting row
// in arrival order without rebuilding the whole mock each time.
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
  db: {
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn(() => makeSelectChain([])), // no framework rows
      }
      return fn(tx)
    }),
  },
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      // Each tx instance lazily dequeues a row-set on its first `.select()` call.
      // This avoids incrementing the queue on update-only `withTenant` blocks
      // (e.g. the "mark as processing" prelude).
      const tx = {
        select: vi.fn(() => {
          const nextRows = queueSelectRows[_selectCallIndex] ?? []
          _selectCallIndex++
          return makeSelectChain(nextRows)
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
        })),
      }
      return fn(tx)
    }
  ),
}))

vi.mock('@/db/schema', () => ({
  candidates: { id: 'id' },
  roles: { id: 'id' },
  scores: { candidateId: 'cid', roleId: 'rid' },
  customerFrameworks: { customerId: 'cust' },
  tenantSettings: { tenantId: 'tid', key: 'key', value: 'value' },
}))

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: vi.fn((strings: TemplateStringsArray) => ({ type: 'sql', strings })),
}))

vi.mock('@/lib/audit-middleware', () => ({
  emitAudit: (...args: unknown[]) => mockEmitAudit(...args),
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchHighScoreNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ai/claude', () => ({
  scoreCandidateWithClaude: (...args: unknown[]) => mockScoreCandidateWithClaude(...args),
}))

vi.mock('@/lib/ai/gemini', () => ({
  scoreCandidateWithGemini: vi.fn(),
}))

vi.mock('@/actions/settings', () => ({
  getHrSkillSettings: (...args: unknown[]) => mockGetHrSkillSettings(...args),
}))

// Stub loader — returns a fixed shape; the test only cares about `.name`.
vi.mock('@/lib/ai/skills', () => ({
  loadHrSkill: (profile: string) => ({ name: profile, content: '' }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_SCORE = {
  overall_score: 87,
  dimensions: {
    technical_skills: { score: 90, reasoning: 'strong' },
    experience_level: { score: 85, reasoning: 'fits' },
    cultural_fit:     { score: 84, reasoning: 'aligned' },
    communication:    { score: 88, reasoning: 'clear' },
  },
  summary: 'Strong fit.',
}

function queueRowsForHappyPath() {
  // triggerScoring select-order:
  //   1. candidate (select.from.where.limit)
  //   2. role (select.from.where.limit)
  //   3. modelSetting (select.from.where.limit)  — empty → default Claude
  queueSelectRows = [
    [{ id: CANDIDATE_ID, firstName: 'Ada', lastName: 'Lovelace', cvText: 'CV...', candidateRate: null, rateCurrency: null }],
    [{ id: ROLE_ID, title: 'Engineer', description: 'desc', requirements: 'req', frameworkLevelId: null, customerId: null, customerDayRate: null, rateCurrency: null, priorityKeywords: [] }],
    [], // no model setting → Claude path
  ]
  _selectCallIndex = 0
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('triggerScoring — skill_used audit metadata (#199)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueRowsForHappyPath()
    mockScoreCandidateWithClaude.mockResolvedValue(FAKE_SCORE)
  })

  it('emits score.completed with skill_used: null when HR skill toggle is OFF', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })

    const { triggerScoring } = await import('@/lib/ai/scoring')
    await triggerScoring(CANDIDATE_ID, ROLE_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'score.completed',
        metadata: expect.objectContaining({ skill_used: null }),
      })
    )
  })

  it('emits score.completed with skill_used: profile name when HR skill toggle is ON', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })

    const { triggerScoring } = await import('@/lib/ai/scoring')
    await triggerScoring(CANDIDATE_ID, ROLE_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'score.completed',
        metadata: expect.objectContaining({ skill_used: 'recruiter-eu-uk' }),
      })
    )
  })

  it('preserves the existing metadata fields alongside skill_used', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })

    const { triggerScoring } = await import('@/lib/ai/scoring')
    await triggerScoring(CANDIDATE_ID, ROLE_ID, TENANT_ID)

    // Confirms #199 is metadata enrichment, NOT a metadata rewrite.
    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'score.completed',
        metadata: expect.objectContaining({
          roleId: ROLE_ID,
          overallScore: 87,
          model: 'claude',
          skill_used: null,
        }),
      })
    )
  })

  it('emits score.failed with skill_used when Claude call throws', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'talent-acquisition' })
    mockScoreCandidateWithClaude.mockRejectedValueOnce(new Error('Claude exploded'))

    const { triggerScoring } = await import('@/lib/ai/scoring')
    await triggerScoring(CANDIDATE_ID, ROLE_ID, TENANT_ID)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        action: 'score.failed',
        metadata: expect.objectContaining({
          error: 'Claude exploded',
          skill_used: 'talent-acquisition',
        }),
      })
    )
  })
})
