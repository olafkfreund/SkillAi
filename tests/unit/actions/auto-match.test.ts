/**
 * Unit tests for src/actions/auto-match.ts
 *
 * Covers triggerAutoMatch — the orchestrator that wraps prefilter execution
 * with audit logging (epic #267, issue #268). The orchestrator MUST NOT throw;
 * failures surface as role.auto_match_failed audit rows.
 *
 * Scoring of survivors is owned by issue #269 — this test asserts the audit
 * shape carries the candidate IDs that WOULD be scored plus
 * `scoringPending: true` so the follow-up PR can flip the flag and add the
 * scoring step without changing the audit contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrefilterResult } from '@/lib/auto-match'

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROLE_ID   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const mockPrefilter = vi.fn()
vi.mock('@/lib/auto-match', () => ({
  prefilterCandidatesForRole: (...args: unknown[]) => mockPrefilter(...args),
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

describe('triggerAutoMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrefilter.mockReset()
    mockAudit.mockReset()
    mockAudit.mockResolvedValue(undefined)
  })

  it('writes started then completed audit rows on the happy path', async () => {
    mockPrefilter.mockResolvedValue([
      survivor('cand-1'),
      survivor('cand-2'),
      survivor('cand-3'),
      survivor('cand-4'),
    ])
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockAudit).toHaveBeenCalledTimes(2)
    expect(mockAudit.mock.calls[0]).toEqual([
      TENANT_ID,
      expect.objectContaining({
        action: 'role.auto_match_started',
        entityType: 'role',
        entityId: ROLE_ID,
      }),
    ])
    expect(mockAudit.mock.calls[1]).toEqual([
      TENANT_ID,
      expect.objectContaining({
        action: 'role.auto_match_completed',
        entityType: 'role',
        entityId: ROLE_ID,
      }),
    ])
  })

  it('caps candidateIds at 3 in the completed metadata', async () => {
    mockPrefilter.mockResolvedValue([
      survivor('cand-1'),
      survivor('cand-2'),
      survivor('cand-3'),
      survivor('cand-4'),
      survivor('cand-5'),
    ])
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    const completedCall = mockAudit.mock.calls[1]
    expect(completedCall[1].metadata.candidateIds).toEqual(['cand-1', 'cand-2', 'cand-3'])
    expect(completedCall[1].metadata.survivorCount).toBe(5)
    expect(completedCall[1].metadata.scoringPending).toBe(true)
    expect(typeof completedCall[1].metadata.durationMs).toBe('number')
  })

  it('writes completed with empty candidateIds when prefilter returns no survivors', async () => {
    mockPrefilter.mockResolvedValue([])
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    const completedCall = mockAudit.mock.calls[1]
    expect(completedCall[1].action).toBe('role.auto_match_completed')
    expect(completedCall[1].metadata.candidateIds).toEqual([])
    expect(completedCall[1].metadata.survivorCount).toBe(0)
  })

  it('writes failed audit row when prefilter throws', async () => {
    mockPrefilter.mockRejectedValue(new Error('pgvector unavailable'))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    expect(mockAudit).toHaveBeenCalledTimes(2)
    const lastCall = mockAudit.mock.calls[1]
    expect(lastCall[1].action).toBe('role.auto_match_failed')
    expect(lastCall[1].metadata.error).toBe('pgvector unavailable')
    expect(typeof lastCall[1].metadata.durationMs).toBe('number')
  })

  it('does not throw when prefilter throws — failure is contained', async () => {
    mockPrefilter.mockRejectedValue(new Error('boom'))
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await expect(triggerAutoMatch(ROLE_ID, TENANT_ID)).resolves.toBeUndefined()
  })

  it('coerces non-Error throwables to a string in the failed metadata', async () => {
    mockPrefilter.mockRejectedValue('a bare string')
    const { triggerAutoMatch } = await import('@/actions/auto-match')

    await triggerAutoMatch(ROLE_ID, TENANT_ID)

    const lastCall = mockAudit.mock.calls[1]
    expect(lastCall[1].metadata.error).toBe('a bare string')
  })
})
