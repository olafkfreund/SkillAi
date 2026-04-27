/**
 * Vendored AI model pricing constants and cost calculation.
 *
 * Update when provider pricing changes. Prices are USD per 1 million tokens.
 *
 * Sources (April 2026):
 * - Anthropic: https://www.anthropic.com/pricing
 * - Google AI: https://ai.google.dev/gemini-api/docs/pricing
 *
 * Cache pricing for Anthropic: cache_read = input/10, cache_creation = input * 1.25
 */

interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion?: number
  cacheCreationPerMillion?: number
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude
  'claude-sonnet-4-6': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3, // 1/10 of input
    cacheCreationPerMillion: 3.75, // 1.25 * input
  },
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheCreationPerMillion: 1.0,
  },
  // Google Gemini
  'gemini-2.0-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
  },
  'gemini-embedding-001': {
    inputPerMillion: 0.02,
    outputPerMillion: 0, // embeddings don't have output tokens
  },
}

export interface UsageInput {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number | null
  cacheReadTokens?: number | null
}

/**
 * Calculate the USD cost for an AI call. Returns 0 for unknown models
 * rather than throwing — logging cost is best-effort.
 */
export function calculateCost(model: string, usage: UsageInput): number {
  const pricing = PRICING[model]
  if (!pricing) return 0

  const M = 1_000_000
  let cost = 0

  // Cache-read tokens: replace those input tokens at the discounted rate
  // Regular input tokens: full input price
  // (Anthropic counts cached + uncached separately; total input includes cache_read)
  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheCreation = usage.cacheCreationTokens ?? 0
  const regularInput = Math.max(0, usage.inputTokens - cacheRead - cacheCreation)

  cost += (regularInput / M) * pricing.inputPerMillion
  cost += (cacheRead / M) * (pricing.cacheReadPerMillion ?? pricing.inputPerMillion)
  cost += (cacheCreation / M) * (pricing.cacheCreationPerMillion ?? pricing.inputPerMillion)
  cost += (usage.outputTokens / M) * pricing.outputPerMillion

  return cost
}

export function isModelKnown(model: string): boolean {
  return model in PRICING
}

export const KNOWN_MODELS = Object.keys(PRICING) as string[]
