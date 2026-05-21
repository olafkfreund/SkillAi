/**
 * Unit tests for src/actions/auto-match.ts
 *
 * Covers triggerAutoMatch — the orchestrator that combines pre-filter
 * (#268) + Claude scoring (#269) with audit logging. Must NEVER throw —
 * failures surface as role.auto_match_failed audit rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrefilterResult, AutoMatchScoringResult } from '@/lib/auto-match'

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROLE_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const mockPrefilter = vi.fn()
const mockScoring   = vi.fn()
vi.mock('@/lib/auto-match', () => ({
  prefilterCandidatesForRole: (...args: unknown[]) => mockPrefilter(...args),
  triggerAutoMatchScoring:    (...args: unknown[]) => mockScoring(...args),
}))

const mockAudit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockAudit(...args),
}))

function survivor(id: string): PrefilterResult {
  return {
    candidateId: id,
    similarity: 85,
    rateMatch: 'within',
    rateOveragePercent: null,
    availability: { status: 'available' },
  }
}

function scoringSuccess(
  ids: string[],
  failed: string[] = [],
  reused: string[] = [],
): AutoMatchScoringResult {
  return {
    skipped: false,
    scoredCandidateIds: ids,
    failedCandidateIds: failed,
    reusedExistingScores: reused,
  }
}

function scoringSkipped(spent: number, cap: number): AutoMatchScoringResult {
  return {
    skipped: true,
    reason: 'daily_cost_cap_exceeded',
    spentTodayUsd: spent,
    capUsd: cap,
  }
}

describe('triggerAutoMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrefilter.mockReset()
    mockScoring.mockReset()
    mockAudit.mockReset()
    mockAudit.mockResolvedValue(undefined)
    // Default: scoring returns the candidates as scored
    mockScoring.mockImplementation(async (_roleId, _tenantId, ids: string[]) =>
      scoringSuccess(ids),
    )
  })

  it('writes started then completed audit rows on the happy path', async () => {
    mockPrefilter.mockResolvedValue([
      survivor('c-1'),
      survivor('c-2'),
      survivor('c-3'),
    ])
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockAudit).toHaveBeenCalledTimes(2)
    expect(mockAudit.mock.calls[0][1]).toMatchObject({
      action: 'role.auto_match_started',
      entityType: 'role',
      entityId: ROLE_ID,
    })
    expect(mockAudit.mock.calls[1][1]).toMatchObject({
      action: 'role.auto_match_completed',
      entityType: 'role',
      entityId: ROLE_ID,
    })
  })

  it('passes the top-3 candidate IDs to the scoring step', async () => {
    mockPrefilter.mockResolvedValue([
      survivor('c-1'),
      survivor('c-2'),
      survivor('c-3'),
      survivor('c-4'),
      survivor('c-5'),
    ])
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockScoring).toHaveBeenCalledWith(ROLE_ID, TENANT_ID, ['c-1', 'c-2', 'c-3'])
  })

  it('records scored/failed/reused buckets in completed metadata with scoringPending=false', async () => {
    mockPrefilter.mockResolvedValue([survivor('c-1'), survivor('c-2'), survivor('c-3')])
    mockScoring.mockResolvedValue(scoringSuccess(['c-1', 'c-3'], ['c-2'], []))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    const completed = mockAudit.mock.calls[1][1]
    expect(completed.metadata).toMatchObject({
      candidateIds: ['c-1', 'c-2', 'c-3'],
      survivorCount: 3,
      scoredCandidateIds: ['c-1', 'c-3'],
      failedCandidateIds: ['c-2'],
      reusedExistingScores: [],
      scoringPending: false,
    })
    expect(typeof completed.metadata.durationMs).toBe('number')
  })

  it('writes completed with empty buckets when prefilter returns no survivors', async () => {
    mockPrefilter.mockResolvedValue([])
    mockScoring.mockResolvedValue(scoringSuccess([], [], []))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockScoring).toHaveBeenCalledWith(ROLE_ID, TENANT_ID, [])
    const completed = mockAudit.mock.calls[1][1]
    expect(completed.action).toBe('role.auto_match_completed')
    expect(completed.metadata.candidateIds).toEqual([])
    expect(completed.metadata.survivorCount).toBe(0)
  })

  it('writes failed audit with daily_cost_cap_exceeded when scoring is skipped', async () => {
    mockPrefilter.mockResolvedValue([survivor('c-1'), survivor('c-2'), survivor('c-3')])
    mockScoring.mockResolvedValue(scoringSkipped(51.23, 50))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockAudit).toHaveBeenCalledTimes(2)
    const failed = mockAudit.mock.calls[1][1]
    expect(failed.action).toBe('role.auto_match_failed')
    expect(failed.metadata).toMatchObject({
      reason: 'daily_cost_cap_exceeded',
      candidateIds: ['c-1', 'c-2', 'c-3'],
      survivorCount: 3,
      spentTodayUsd: 51.23,
      capUsd: 50,
    })
    expect(typeof failed.metadata.durationMs).toBe('number')
  })

  it('writes failed audit when prefilter throws', async () => {
    mockPrefilter.mockRejectedValue(new Error('pgvector unavailable'))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockAudit).toHaveBeenCalledTimes(2)
    const failed = mockAudit.mock.calls[1][1]
    expect(failed.action).toBe('role.auto_match_failed')
    expect(failed.metadata.error).toBe('pgvector unavailable')
  })

  it('writes failed audit when scoring throws unexpectedly', async () => {
    mockPrefilter.mockResolvedValue([survivor('c-1')])
    mockScoring.mockRejectedValue(new Error('scoring blew up'))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    const failed = mockAudit.mock.calls[1][1]
    expect(failed.action).toBe('role.auto_match_failed')
    expect(failed.metadata.error).toBe('scoring blew up')
  })

  it('never throws — failure paths resolve undefined', async () => {
    mockPrefilter.mockRejectedValue(new Error('boom'))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await expect(triggerAutoMatch(ROLE_ID, TENANT_ID)).resolves.toBeUndefined()
  })

  it('coerces non-Error throwables to a string in the failed metadata', async () => {
    mockPrefilter.mockRejectedValue('a bare string')
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockAudit.mock.calls[1][1].metadata.error).toBe('a bare string')
  })
})
