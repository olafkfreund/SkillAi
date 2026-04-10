'use server'

import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, candidateEnrichments } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'

// ─── Brave Search ─────────────────────────────────────────────────────────────

async function braveSearch(query: string): Promise<WebHit[]> {
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

function classifySource(url: string): string {
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

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function fetchGitHubProfile(username: string): Promise<GitHubProfile | null> {
  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=5&type=owner`,
        { headers }
      ),
    ])

    if (!userRes.ok) return null
    const user = await userRes.json() as {
      login: string; name: string | null; bio: string | null
      avatar_url: string; html_url: string; public_repos: number; followers: number
    }

    const repos: Array<{ name: string; description: string | null; stargazers_count: number; language: string | null; html_url: string }> =
      reposRes.ok ? await reposRes.json() : []

    return {
      login: user.login,
      name: user.name,
      bio: user.bio,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      publicRepos: user.public_repos,
      followers: user.followers,
      topRepos: repos.map((r) => ({
        name: r.name,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
        url: r.html_url,
      })),
    }
  } catch {
    return null
  }
}

// ─── Main action ──────────────────────────────────────────────────────────────

export type EnrichmentResult =
  | { success: true; webHits: WebHit[]; githubProfile: GitHubProfile | null; searchedAt: string }
  | { success: false; error: string }

export async function enrichCandidate(candidateId: string): Promise<EnrichmentResult> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  // Load candidate
  const [candidate] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        githubUsername: candidates.githubUsername,
        linkedinUrl: candidates.linkedinUrl,
      })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )

  if (!candidate) return { success: false, error: 'Candidate not found' }

  const fullName = `${candidate.firstName} ${candidate.lastName}`

  // Run all searches in parallel
  const [generalHits, linkedinHits, githubHits, githubProfile] = await Promise.all([
    // General web presence
    braveSearch(`"${fullName}" developer engineer programmer`),
    // LinkedIn targeted
    candidate.linkedinUrl
      ? braveSearch(`site:linkedin.com "${fullName}"`)
      : braveSearch(`site:linkedin.com/in "${fullName}"`),
    // GitHub targeted (if no username, search by name)
    candidate.githubUsername
      ? Promise.resolve<WebHit[]>([]) // covered by API
      : braveSearch(`site:github.com "${fullName}"`),
    // GitHub API if username provided
    candidate.githubUsername
      ? fetchGitHubProfile(candidate.githubUsername)
      : Promise.resolve(null),
  ])

  // Merge and deduplicate hits by URL
  const seen = new Set<string>()
  const allHits: WebHit[] = []
  for (const hit of [...linkedinHits, ...githubHits, ...generalHits]) {
    if (!seen.has(hit.url)) {
      seen.add(hit.url)
      allHits.push(hit)
    }
  }

  const now = new Date()

  // Upsert enrichment record
  await withTenant(tenantId, (tx) =>
    tx
      .insert(candidateEnrichments)
      .values({
        tenantId,
        candidateId,
        webHits: allHits,
        githubProfile: githubProfile ?? null,
        searchedAt: now,
      })
      .onConflictDoUpdate({
        target: candidateEnrichments.candidateId,
        set: {
          webHits: allHits,
          githubProfile: githubProfile ?? null,
          searchedAt: now,
        },
      })
  )

  return {
    success: true,
    webHits: allHits,
    githubProfile,
    searchedAt: now.toISOString(),
  }
}

export async function updateCandidateLinks(
  candidateId: string,
  linkedinUrl: string | null,
  githubUsername: string | null
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getActionContext()
  if (!ctx) throw new Error('Not authenticated')
  const { tenantId } = ctx

  await withTenant(tenantId, (tx) =>
    tx
      .update(candidates)
      .set({ linkedinUrl, githubUsername })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
  )

  return { success: true }
}
