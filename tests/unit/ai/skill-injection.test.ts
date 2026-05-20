/**
 * HR skill injection tests for the three AI call sites touched by #197:
 *
 *   - scoreCandidateWithClaude           (src/lib/ai/claude.ts)
 *   - generateQuestions                  (src/lib/ai/interview.ts)  Stage 2
 *   - analyzeTranscriptWithClaude        (src/lib/ai/transcript-analysis.ts)
 *
 * For each call site we assert:
 *   • toggle OFF → no HR_POLICY block injected; system shape byte-identical
 *     to pre-#197 behaviour.
 *   • toggle ON  → exactly one HR_POLICY block injected at the correct
 *     position, marked with cache_control: ephemeral.
 *
 * The Anthropic SDK is fully mocked — these tests verify the request
 * shape we hand it, not any network behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- module mocks (hoisted) ---------------------------------------------

const mockMessagesCreate = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockMessagesCreate }
    },
  }
})

vi.mock('@/lib/ai/keys', () => ({
  resolveAnthropicKey: vi.fn(async () => 'sk-ant-test'),
}))

const mockGetHrSkillSettings = vi.hoisted(() => vi.fn())
const mockLoadHrSkill = vi.hoisted(() => vi.fn())

vi.mock('@/lib/skills/tenant-toggle', () => ({
  getHrSkillSettings: mockGetHrSkillSettings,
}))

vi.mock('@/lib/skills', () => ({
  loadHrSkill: mockLoadHrSkill,
}))

vi.mock('@/lib/ai/usage-logger', () => ({
  logAiUsage: vi.fn(async () => undefined),
  anthropicUsageToInput: vi.fn(() => ({ input_tokens: 0, output_tokens: 0 })),
}))

// transcript-analysis pulls in DB modules — stub them.
vi.mock('@/db', () => ({ withTenant: vi.fn(async (_t: string, fn: (tx: unknown) => unknown) => fn({})) }))
vi.mock('@/db/schema', () => ({
  interviewTranscripts: {},
  transcriptAnalyses: {},
  roles: {},
  interviewQuestions: {},
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

// ---- module imports under test (after mocks) -----------------------------

import { scoreCandidateWithClaude } from '@/lib/ai/claude'
import { generateQuestions } from '@/lib/ai/interview'
import { analyzeTranscriptWithClaude } from '@/lib/ai/transcript-analysis'
import type { CvProfile } from '@/lib/ai/interview-schemas'

const TENANT = '11111111-1111-1111-1111-111111111111'

const FAKE_SKILL = {
  profile: 'recruiter-eu-uk' as const,
  content: 'placeholder skill body for tests',
}

// Minimum-viable tool_use response the SDK would return.
function fakeAnthropicResponse(toolInput: unknown, model = 'claude-sonnet-4-6') {
  return {
    id: 'msg_test',
    model,
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
    content: [{ type: 'tool_use', name: 'submit_tool', input: toolInput }],
  }
}

const VALID_SCORE = {
  overall_score: 80,
  dimensions: {
    technical_skills: { score: 80, reasoning: 'r' },
    experience_level: { score: 80, reasoning: 'r' },
    cultural_fit: { score: 80, reasoning: 'r' },
    communication: { score: 80, reasoning: 'r' },
  },
  summary: 'ok',
}

const VALID_PACK = {
  experience_level: 'mid' as const,
  recommended_duration_minutes: 60,
  questions: Array.from({ length: 8 }, (_, i) => ({
    question_type: 'technical' as const,
    difficulty: 'medium' as const,
    // question_text must be >=10 chars per InterviewPackSchema.
    question_text: `Question number ${i + 1} for the candidate.`,
    rationale: 'reasonable rationale',
    follow_ups: [],
    strong_answer_signals: [],
    acceptable_answer_signals: [],
    weak_answer_signals: [],
    cv_references: [],
  })),
}

const VALID_TRANSCRIPT_ANALYSIS = {
  overall_score: 75,
  dimensions: {
    communication: { score: 75, reasoning: 'r' },
    technical_depth: { score: 75, reasoning: 'r' },
    problem_solving: { score: 75, reasoning: 'r' },
    social_fit: { score: 75, reasoning: 'r' },
  },
  summary: 's',
  strengths: [],
  red_flags: [],
  // Enum: 'proceed' | 'consider' | 'decline' (NOT 'hire').
  recommended_decision: 'proceed' as const,
  question_responses: [],
}

const FAKE_CV_PROFILE: CvProfile = {
  experience_level: 'mid',
  summary: 'experienced developer',
  companies: [{ name: 'Acme', role: 'Engineer', key_achievements: ['shipped'] }],
  technical_skills: ['TypeScript', 'PostgreSQL'],
  personalizable_moments: ['Led migration'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====== scoreCandidateWithClaude ===========================================

describe('scoreCandidateWithClaude — HR skill injection', () => {
  it('OFF: system array has exactly 1 block (no HR_POLICY)', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(null)
    mockMessagesCreate.mockResolvedValue(fakeAnthropicResponse(VALID_SCORE))

    await scoreCandidateWithClaude({
      roleTitle: 'Senior Engineer',
      roleDescription: 'desc',
      roleRequirements: 'reqs',
      cvText: 'cv',
      candidateName: 'Alice',
      tenantId: TENANT,
    })

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    const arg = mockMessagesCreate.mock.calls[0][0]
    expect(Array.isArray(arg.system)).toBe(true)
    expect(arg.system).toHaveLength(1)
    expect(arg.system[0].text).not.toContain('HR_POLICY:')
    // loadHrSkill must NOT be called when toggle is off — toggle gates it.
    expect(mockLoadHrSkill).not.toHaveBeenCalled()
  })

  it('ON: system array has 2 blocks; second starts with "HR_POLICY:"', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(FAKE_SKILL)
    mockMessagesCreate.mockResolvedValue(fakeAnthropicResponse(VALID_SCORE))

    await scoreCandidateWithClaude({
      roleTitle: 'Senior Engineer',
      roleDescription: 'desc',
      roleRequirements: 'reqs',
      cvText: 'cv',
      candidateName: 'Alice',
      tenantId: TENANT,
    })

    const arg = mockMessagesCreate.mock.calls[0][0]
    expect(arg.system).toHaveLength(2)
    expect(arg.system[1].text.startsWith('HR_POLICY:\n')).toBe(true)
    expect(arg.system[1].text).toContain(FAKE_SKILL.content)
    expect(arg.system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(mockLoadHrSkill).toHaveBeenCalledWith('recruiter-eu-uk')
  })

  it('ON but loadHrSkill returns null: no HR_POLICY block (graceful)', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(null)
    mockMessagesCreate.mockResolvedValue(fakeAnthropicResponse(VALID_SCORE))

    await scoreCandidateWithClaude({
      roleTitle: 'Senior Engineer',
      roleDescription: 'desc',
      roleRequirements: 'reqs',
      cvText: 'cv',
      candidateName: 'Alice',
      tenantId: TENANT,
    })

    const arg = mockMessagesCreate.mock.calls[0][0]
    expect(arg.system).toHaveLength(1)
    expect(arg.system[0].text).not.toContain('HR_POLICY:')
  })
})

// ====== generateQuestions Stage 2 =========================================

describe('generateQuestions Stage 2 — HR skill injection', () => {
  it('OFF: system array has exactly 1 block (no HR_POLICY)', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(null)
    mockMessagesCreate.mockResolvedValue(fakeAnthropicResponse(VALID_PACK))

    await generateQuestions(
      FAKE_CV_PROFILE,
      { title: 'Senior Engineer', description: 'desc', requirements: 'reqs' },
      { includeCodeChallenge: false },
      TENANT
    )

    const arg = mockMessagesCreate.mock.calls[0][0]
    expect(arg.system).toHaveLength(1)
    expect(arg.system[0].text).not.toContain('HR_POLICY:')
    expect(mockLoadHrSkill).not.toHaveBeenCalled()
  })

  it('ON: system array has 2 blocks; second is HR_POLICY with ephemeral cache', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(FAKE_SKILL)
    mockMessagesCreate.mockResolvedValue(fakeAnthropicResponse(VALID_PACK))

    await generateQuestions(
      FAKE_CV_PROFILE,
      { title: 'Senior Engineer', description: 'desc', requirements: 'reqs' },
      { includeCodeChallenge: false },
      TENANT
    )

    const arg = mockMessagesCreate.mock.calls[0][0]
    expect(arg.system).toHaveLength(2)
    expect(arg.system[1].text.startsWith('HR_POLICY:\n')).toBe(true)
    expect(arg.system[1].text).toContain(FAKE_SKILL.content)
    expect(arg.system[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('teaching block remains the FIRST block in both states (cache prefix stable)', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(FAKE_SKILL)
    mockMessagesCreate.mockResolvedValue(fakeAnthropicResponse(VALID_PACK))

    await generateQuestions(
      FAKE_CV_PROFILE,
      { title: 'Senior Engineer', description: 'desc', requirements: 'reqs' },
      { includeCodeChallenge: false },
      TENANT
    )

    const arg = mockMessagesCreate.mock.calls[0][0]
    // Teaching block must precede the HR block so cache prefix is stable.
    expect(arg.system[0].text.toLowerCase()).toContain('interviewer')
    expect(arg.system[1].text.startsWith('HR_POLICY:\n')).toBe(true)
  })
})

// ====== analyzeTranscriptWithClaude =======================================

describe('analyzeTranscriptWithClaude — HR skill injection', () => {
  it('OFF: request has NO top-level `system` field (byte-identical to pre-#197)', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: false, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(null)
    // First mock call = language detection (Haiku) returning 'en'.
    mockMessagesCreate.mockResolvedValueOnce({
      id: 'msg_lang',
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 2 },
      content: [{ type: 'text', text: 'en' }],
    })
    // Second mock call = the main analysis.
    mockMessagesCreate.mockResolvedValueOnce(fakeAnthropicResponse(VALID_TRANSCRIPT_ANALYSIS))

    await analyzeTranscriptWithClaude({
      transcriptText: 'speaker: hello',
      roleTitle: 'Senior Engineer',
      roleDescription: 'desc',
      roleRequirements: 'reqs',
      tenantId: TENANT,
    })

    // First call is language detection — not our concern. Second is analysis.
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
    const analysisArg = mockMessagesCreate.mock.calls[1][0]
    // Critical byte-identical guarantee: no `system` key on the request body.
    expect('system' in analysisArg).toBe(false)
    expect(mockLoadHrSkill).not.toHaveBeenCalled()
  })

  it('ON: request has system array with 1 HR_POLICY block', async () => {
    mockGetHrSkillSettings.mockResolvedValue({ enabled: true, profile: 'recruiter-eu-uk' })
    mockLoadHrSkill.mockReturnValue(FAKE_SKILL)
    mockMessagesCreate.mockResolvedValueOnce({
      id: 'msg_lang',
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 2 },
      content: [{ type: 'text', text: 'en' }],
    })
    mockMessagesCreate.mockResolvedValueOnce(fakeAnthropicResponse(VALID_TRANSCRIPT_ANALYSIS))

    await analyzeTranscriptWithClaude({
      transcriptText: 'speaker: hello',
      roleTitle: 'Senior Engineer',
      roleDescription: 'desc',
      roleRequirements: 'reqs',
      tenantId: TENANT,
    })

    const analysisArg = mockMessagesCreate.mock.calls[1][0]
    expect(Array.isArray(analysisArg.system)).toBe(true)
    expect(analysisArg.system).toHaveLength(1)
    expect(analysisArg.system[0].text.startsWith('HR_POLICY:\n')).toBe(true)
    expect(analysisArg.system[0].text).toContain(FAKE_SKILL.content)
    expect(analysisArg.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })
})
