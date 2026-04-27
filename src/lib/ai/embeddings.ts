import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'
import { logAiUsage } from './usage-logger'

const EMBEDDING_MODEL = 'models/gemini-embedding-001'

/**
 * Generate a 768-dimensional embedding using Gemini embedding-001.
 * Accepts an optional tenantId to resolve the API key from tenant settings.
 * Falls back to GOOGLE_AI_API_KEY env var if no tenantId provided.
 */
export async function generateEmbedding(
  text: string,
  tenantId?: string
): Promise<number[]> {
  let apiKey: string

  if (tenantId) {
    const { resolveGoogleKey } = await import('./keys')
    apiKey = await resolveGoogleKey(tenantId)
  } else {
    const envKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
    if (!envKey) throw new Error('GEMINI_API_KEY not configured')
    apiKey = envKey
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL })
  // Limit to 8000 chars to stay within model context
  // outputDimensionality is supported by the API but not yet in the SDK types
  const inputText = text.slice(0, 8000)
  const request = {
    content: { role: 'user', parts: [{ text: inputText }] },
    taskType: TaskType.RETRIEVAL_DOCUMENT,
    outputDimensionality: 768,
  } as Parameters<typeof model.embedContent>[0]
  const startedAt = Date.now()
  const result = await model.embedContent(request)

  // Embedding API does not return usageMetadata. Estimate input tokens at
  // ~4 chars per token (rough heuristic). Output token count is 0 (embedding,
  // not text generation). When tenantId is unknown we skip logging.
  if (tenantId) {
    logAiUsage({
      tenantId,
      userId: null,
      operation: 'embedding',
      model: EMBEDDING_MODEL,
      usage: {
        inputTokens: Math.ceil(inputText.length / 4),
        outputTokens: 0,
      },
      durationMs: Date.now() - startedAt,
      metadata: { inputChars: inputText.length, dimensions: 768 },
    }).catch(() => {})
  }

  return result.embedding.values
}
