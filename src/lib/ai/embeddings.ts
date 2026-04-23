import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'

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
  const model = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' })
  // Limit to 8000 chars to stay within model context
  // outputDimensionality is supported by the API but not yet in the SDK types
  const request = {
    content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
    taskType: TaskType.RETRIEVAL_DOCUMENT,
    outputDimensionality: 768,
  } as Parameters<typeof model.embedContent>[0]
  const result = await model.embedContent(request)
  return result.embedding.values
}
