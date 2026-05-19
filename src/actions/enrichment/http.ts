// HTTP utilities used by enrichment fetchers — capped fetch with timeout
// and capped text reader to prevent OOM on hostile/oversized pages.

export const FETCH_TIMEOUT_MS = 10_000
export const MAX_HTML_BYTES = 200 * 1024

/**
 * fetch() with a hard 10s timeout via AbortController.
 * Always resolves — never throws — so callers can null-check the result.
 */
export async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read at most MAX_HTML_BYTES of a Response body as text.
 * Prevents OOM on hostile/oversized pages.
 */
export async function readCappedText(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let received = 0
  let out = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    out += decoder.decode(value, { stream: true })
    if (received >= MAX_HTML_BYTES) {
      try { await reader.cancel() } catch {}
      break
    }
  }
  out += decoder.decode()
  return out
}
