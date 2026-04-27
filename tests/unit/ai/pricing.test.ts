import { describe, it, expect } from 'vitest'
import { calculateCost, isModelKnown, KNOWN_MODELS } from '@/lib/ai/pricing'

describe('calculateCost', () => {
  it('returns 0 for unknown model', () => {
    expect(calculateCost('made-up-model', { inputTokens: 1000, outputTokens: 500 })).toBe(0)
  })

  it('calculates Sonnet 4.6 cost correctly (1M input + 1M output)', () => {
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    // 1M * $3 input + 1M * $15 output = $18
    expect(cost).toBeCloseTo(18, 5)
  })

  it('calculates Haiku 4.5 cost correctly', () => {
    const cost = calculateCost('claude-haiku-4-5-20251001', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    // 1M * $0.80 + 1M * $4 = $4.80
    expect(cost).toBeCloseTo(4.8, 5)
  })

  it('applies cache-read discount on Sonnet', () => {
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 500_000,
    })
    // 500k regular ($1.50) + 500k cache read ($0.15) + 0 output = $1.65
    expect(cost).toBeCloseTo(1.65, 5)
  })

  it('applies cache-creation premium on Sonnet', () => {
    const cost = calculateCost('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 500_000,
    })
    // 500k regular ($1.50) + 500k cache create (500k * $3.75/M = $1.875) = $3.375
    expect(cost).toBeCloseTo(3.375, 5)
  })

  it('calculates Gemini 2.0 Flash correctly', () => {
    const cost = calculateCost('gemini-2.0-flash', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    // $0.075 + $0.30 = $0.375
    expect(cost).toBeCloseTo(0.375, 5)
  })

  it('handles zero tokens', () => {
    expect(calculateCost('claude-sonnet-4-6', { inputTokens: 0, outputTokens: 0 })).toBe(0)
  })
})

describe('isModelKnown', () => {
  it('returns true for known models', () => {
    expect(isModelKnown('claude-sonnet-4-6')).toBe(true)
    expect(isModelKnown('gemini-2.0-flash')).toBe(true)
  })

  it('returns false for unknown models', () => {
    expect(isModelKnown('made-up-model')).toBe(false)
  })
})

describe('KNOWN_MODELS', () => {
  it('lists all priced models', () => {
    expect(KNOWN_MODELS).toContain('claude-sonnet-4-6')
    expect(KNOWN_MODELS).toContain('claude-haiku-4-5-20251001')
    expect(KNOWN_MODELS).toContain('gemini-2.0-flash')
  })
})
