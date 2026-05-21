/**
 * Unit tests for src/actions/skills.ts
 *
 * Covers getUniqueSkillsWithCandidateCounts — the aggregation query backing
 * the Skills Explorer (epic #267 / issue #272). Uses raw SQL via tx.execute()
 * so the mock just returns canned aggregate rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let executeResult: unknown[] = []

vi.mock('@/db', () => ({
  db: {},
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn(() => Promise.resolve(executeResult)),
      }
      return fn(tx)
    },
  ),
}))

vi.mock('drizzle-orm', () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}))

const mockGetActionContext = vi.fn()
vi.mock('@/lib/auth/action-context', () => ({
  getActionContext: () => mockGetActionContext(),
}))

function ctx(role: 'admin' | 'recruiter' | 'hiring_manager' | 'viewer') {
  return { tenantId: TENANT_ID, userId: USER_ID, userRole: role }
}

describe('getUniqueSkillsWithCandidateCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeResult = []
    mockGetActionContext.mockResolvedValue(ctx('recruiter'))
  })

  it('returns [] when unauthenticated', async () => {
    mockGetActionContext.mockResolvedValue(null)
    const { getUniqueSkillsWithCandidateCounts } = await import('@/actions/skills')

    const result = await getUniqueSkillsWithCandidateCounts()

    expect(result).toEqual([])
  })

  it('returns [] for viewer role (below recruiter)', async () => {
    mockGetActionContext.mockResolvedValue(ctx('viewer'))
    const { getUniqueSkillsWithCandidateCounts } = await import('@/actions/skills')

    const result = await getUniqueSkillsWithCandidateCounts()

    expect(result).toEqual([])
  })

  it('returns [] for hiring_manager role (below recruiter)', async () => {
    mockGetActionContext.mockResolvedValue(ctx('hiring_manager'))
    const { getUniqueSkillsWithCandidateCounts } = await import('@/actions/skills')

    const result = await getUniqueSkillsWithCandidateCounts()

    expect(result).toEqual([])
  })

  it('returns [] when no skills aggregate', async () => {
    executeResult = []
    const { getUniqueSkillsWithCandidateCounts } = await import('@/actions/skills')

    const result = await getUniqueSkillsWithCandidateCounts()

    expect(result).toEqual([])
  })

  it('maps aggregate rows to SkillAggregate shape with Number coercion', async () => {
    executeResult = [
      { skill_key: 'react',      display_name: 'React',      candidate_count: '27' },
      { skill_key: 'typescript', display_name: 'TypeScript', candidate_count: 19 },
      { skill_key: 'rust',       display_name: 'Rust',       candidate_count: '4' },
    ]
    const { getUniqueSkillsWithCandidateCounts } = await import('@/actions/skills')

    const result = await getUniqueSkillsWithCandidateCounts()

    expect(result).toEqual([
      { skillKey: 'react',      displayName: 'React',      candidateCount: 27 },
      { skillKey: 'typescript', displayName: 'TypeScript', candidateCount: 19 },
      { skillKey: 'rust',       displayName: 'Rust',       candidateCount: 4 },
    ])
  })

  it('works for admin role too', async () => {
    mockGetActionContext.mockResolvedValue(ctx('admin'))
    executeResult = [{ skill_key: 'go', display_name: 'Go', candidate_count: '12' }]
    const { getUniqueSkillsWithCandidateCounts } = await import('@/actions/skills')

    const result = await getUniqueSkillsWithCandidateCounts()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ skillKey: 'go', displayName: 'Go', candidateCount: 12 })
  })
})
