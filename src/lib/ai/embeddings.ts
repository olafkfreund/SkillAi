import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Generate a 768-dimensional embedding using Gemini text-embedding-004.
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
  const result = await model.embedContent({
    content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
    taskType: 'RETRIEVAL_DOCUMENT' as never,
    outputDimensionality: 768,
  } as never)
  return result.embedding.values
}
