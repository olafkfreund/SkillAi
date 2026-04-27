import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB layer
const mockInsert = vi.fn().mockResolvedValue(undefined)
const mockTx = { insert: vi.fn(() => ({ values: mockInsert })) }
vi.mock('@/db', () => ({
  withTenant: vi.fn(async (_tenantId, fn) => fn(mockTx)),
}))
vi.mock('@/db/schema/ai-usage', () => ({
  aiUsage: {
    /* placeholder; not actually used by mocked tx */
  },
  AI_OPERATIONS: ['cv_scoring_claude'] as const,
}))

import { logAiUsage, anthropicUsageToInput, geminiUsageToInput } from '@/lib/ai/usage-logger'

describe('logAiUsage', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockTx.insert.mockClear()
  })

  it('logs a successful AI call with correct fields', async () => {
    await logAiUsage({
      tenantId: 'tenant-1',
      userId: 'user-1',
      operation: 'cv_scoring_claude',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 1000, outputTokens: 500 },
      durationMs: 1234,
      metadata: { candidateId: 'c1' },
    })

    expect(mockInsert).toHaveBeenCalledOnce()
    const inserted = mockInsert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'user-1',
      operation: 'cv_scoring_claude',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      durationMs: 1234,
    })
    // Cost is a string formatted to 6 decimals
    expect(inserted.costUsd).toMatch(/^\d+\.\d{6}$/)
  })

  it('does NOT throw when withTenant fails', async () => {
    const { withTenant } = await import('@/db')
    vi.mocked(withTenant).mockRejectedValueOnce(new Error('boom'))

    // Should resolve, not reject
    await expect(
      logAiUsage({
        tenantId: 'tenant-1',
        operation: 'cv_scoring_claude',
        model: 'claude-sonnet-4-6',
        usage: { inputTokens: 100, outputTokens: 50 },
      })
    ).resolves.toBeUndefined()
  })

  it('handles null userId for background jobs', async () => {
    await logAiUsage({
      tenantId: 'tenant-1',
      operation: 'cv_scoring_claude',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 50 },
    })

    const inserted = mockInsert.mock.calls[0][0]
    expect(inserted.userId).toBeNull()
  })

  it('handles unknown model with cost=0 (does not throw)', async () => {
    await logAiUsage({
      tenantId: 'tenant-1',
      operation: 'cv_scoring_claude',
      model: 'unknown-model',
      usage: { inputTokens: 100, outputTokens: 50 },
    })

    const inserted = mockInsert.mock.calls[0][0]
    expect(inserted.costUsd).toBe('0.000000')
  })
})

describe('anthropicUsageToInput', () => {
  it('maps Anthropic usage to our shape', () => {
    expect(anthropicUsageToInput({ input_tokens: 100, output_tokens: 50 })).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: null,
      cacheReadTokens: null,
    })
  })

  it('preserves cache token fields when present', () => {
    expect(
      anthropicUsageToInput({
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 20,
      })
    ).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 30,
      cacheReadTokens: 20,
    })
  })
})

describe('geminiUsageToInput', () => {
  it('maps Gemini usageMetadata to our shape', () => {
    expect(geminiUsageToInput({ promptTokenCount: 100, candidatesTokenCount: 50 })).toEqual({
      inputTokens: 100,
      outputTokens: 50,
    })
  })

  it('handles missing fields with zeros', () => {
    expect(geminiUsageToInput({})).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})
