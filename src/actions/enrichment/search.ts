// Brave Search wrapper + URL → source-bucket classifiers.

import type { ProfileCandidate } from '@/lib/ai/profile-matcher'
import type { WebHit } from '@/db/schema/candidate-enrichments'

export async function braveSearch(query: string): Promise<WebHit[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '10')
  url.searchParams.set('search_lang', 'en')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) return []
  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string }> }
  }
  const results = data.web?.results ?? []

  return results.map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    description: r.description ?? '',
    source: classifySource(r.url ?? ''),
  }))
}

export function classifySource(url: string): string {
  if (url.includes('linkedin.com')) return 'linkedin'
  if (url.includes('github.com')) return 'github'
  if (url.includes('reddit.com')) return 'reddit'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter'
  if (url.includes('facebook.com')) return 'facebook'
  if (url.includes('stackoverflow.com')) return 'stackoverflow'
  if (url.includes('medium.com')) return 'medium'
  if (url.includes('dev.to')) return 'devto'
  if (url.includes('youtube.com')) return 'youtube'
  return 'web'
}

/**
 * Map the loose WebHit.source string to the strict ProfileCandidate.source
 * enum used by the AI matcher and the persisted VerifiedProfile.
 *
 * Returns null for sources we don't verify (reddit/twitter/facebook/youtube).
 */
export function toProfileSource(
  webSource: string,
  url: string
): ProfileCandidate['source'] | null {
  if (webSource === 'linkedin') return 'linkedin'
  if (webSource === 'github') return 'github'
  if (webSource === 'stackoverflow') return 'stack_overflow'
  if (webSource === 'devto') return 'devto'
  if (webSource === 'medium') return 'medium'
  if (webSource === 'web') {
    // 'web' bucket holds personal-site hits; nothing else from search lands here
    // unless it failed every classifier — treat as personal site candidate.
    return 'personal'
  }
  // reddit / twitter / facebook / youtube etc. — not a profile we verify
  void url
  return null
}
