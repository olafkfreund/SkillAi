import { withTenant } from '@/db'
import { aiUsage, type AiOperation } from '@/db/schema/ai-usage'
import { calculateCost, type UsageInput } from './pricing'

interface LogAiUsageInput {
  tenantId: string
  userId?: string | null
  operation: AiOperation
  model: string
  usage: UsageInput
  durationMs?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * Log an AI call's token usage and cost to the ai_usage table.
 * Best-effort — never throws. Caller should still wrap in .catch() out of paranoia.
 */
export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    const cost = calculateCost(input.model, input.usage)

    await withTenant(input.tenantId, async (tx) => {
      await tx.insert(aiUsage).values({
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        operation: input.operation,
        model: input.model,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cacheCreationTokens: input.usage.cacheCreationTokens ?? null,
        cacheReadTokens: input.usage.cacheReadTokens ?? null,
        costUsd: cost.toFixed(6), // numeric column expects string
        durationMs: input.durationMs ?? null,
        metadata: input.metadata ?? null,
      })
    })
  } catch (err) {
    // NEVER let logging break the AI flow. Just log and move on.
    console.error(
      '[ai-usage-logger] failed to log usage:',
      err instanceof Error ? err.message : err
    )
  }
}

/**
 * Adapter: extract Anthropic SDK usage shape into our UsageInput.
 *
 * Anthropic's response.usage shape:
 *   { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }
 */
export function anthropicUsageToInput(u: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}): UsageInput {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheCreationTokens: u.cache_creation_input_tokens ?? null,
    cacheReadTokens: u.cache_read_input_tokens ?? null,
  }
}

/**
 * Adapter: extract Gemini SDK usageMetadata into our UsageInput.
 *
 * Gemini's response.usageMetadata shape:
 *   { promptTokenCount, candidatesTokenCount, totalTokenCount }
 */
export function geminiUsageToInput(u: {
  promptTokenCount?: number
  candidatesTokenCount?: number
}): UsageInput {
  return {
    inputTokens: u.promptTokenCount ?? 0,
    outputTokens: u.candidatesTokenCount ?? 0,
  }
}
