// Platform-specific profile fetchers: GitHub, Stack Overflow, personal sites.

import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicKey } from '@/lib/ai/keys'
import { logAiUsage, anthropicUsageToInput } from '@/lib/ai/usage-logger'
import type {
  GitHubProfile,
  StackOverflowProfile,
  PersonalSiteSummary,
} from '@/db/schema/candidate-enrichments'
import { timedFetch, readCappedText } from './http'

// ─── GitHub API ───────────────────────────────────────────────────────────────

export async function fetchGitHubProfile(username: string): Promise<GitHubProfile | null> {
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

// ─── Stack Overflow profile fetcher ───────────────────────────────────────────

const SO_URL_RE = /^https?:\/\/(?:[a-z]+\.)?stackoverflow\.com\/users\/(\d+)\/([^/?#]+)/i

export async function fetchStackOverflowProfile(url: string): Promise<StackOverflowProfile | null> {
  const m = SO_URL_RE.exec(url)
  if (!m) return null
  const slug = m[2]

  const res = await timedFetch(url, {
    headers: { 'User-Agent': 'SkillAI-Enrichment/1.0' },
  })
  if (!res || !res.ok) return null

  let html: string
  try {
    html = await readCappedText(res)
  } catch {
    return null
  }

  // Username — prefer the visible display name in the profile header, fall
  // back to the URL slug.
  const nameMatch =
    /<div[^>]*class="[^"]*\bgrid--cell\b[^"]*"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>/i.exec(html) ||
    /<title>([^<]+?)\s*-\s*Stack Overflow<\/title>/i.exec(html)
  const username = (nameMatch?.[1]?.trim() || slug.replace(/-/g, ' ')).slice(0, 100)

  // Reputation — visible as a number with comma thousand separators.
  let reputation = 0
  const repMatch =
    /class="[^"]*\breputation\b[^"]*"[^>]*>\s*([\d,]+)/i.exec(html) ||
    /title="reputation"[^>]*>\s*([\d,]+)/i.exec(html) ||
    /([\d,]+)\s*<[^>]*>\s*reputation/i.exec(html)
  if (repMatch) {
    const n = parseInt(repMatch[1].replace(/,/g, ''), 10)
    if (Number.isFinite(n)) reputation = n
  }

  // Top tags — pull all visible tag names; rank by occurrence count and take
  // the top 5. Stack Overflow renders tag names inside <a class="post-tag">tag</a>
  // and inside the "Top Tags" widget.
  const tagCounts = new Map<string, number>()
  const tagRe = /class="[^"]*\bpost-tag\b[^"]*"[^>]*>([^<]+)<\/a>/gi
  let tm: RegExpExecArray | null
  while ((tm = tagRe.exec(html)) !== null) {
    const t = tm[1].trim().toLowerCase()
    if (!t) continue
    tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t)

  return {
    username,
    reputation,
    topTags,
    profileUrl: url,
  }
}

// ─── Personal site summary fetcher ────────────────────────────────────────────

const PERSONAL_SITE_INPUT_CHAR_CAP = 3000

export async function fetchPersonalSiteSummary(
  url: string,
  candidateName: string,
  tenantId?: string,
  candidateId?: string
): Promise<PersonalSiteSummary | null> {
  const res = await timedFetch(url, {
    headers: { 'User-Agent': 'SkillAI-Enrichment/1.0' },
  })
  if (!res || !res.ok) return null

  let html: string
  try {
    html = await readCappedText(res)
  } catch {
    return null
  }

  // <title>
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  const title = (titleMatch?.[1]?.trim() || '').slice(0, 200)

  // Strip <script>/<style> blocks then extract visible text.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const visibleText = stripped.slice(0, PERSONAL_SITE_INPUT_CHAR_CAP)

  if (!visibleText) {
    return { url, title, aiSummary: '' }
  }

  let aiSummary = ''
  try {
    let personalSiteApiKey: string
    if (tenantId) {
      personalSiteApiKey = await resolveAnthropicKey(tenantId)
    } else {
      console.warn('[enrichment] no tenantId — falling back to env API key')
      const envKey = process.env.ANTHROPIC_API_KEY
      if (!envKey) throw new Error('No Anthropic API key configured')
      personalSiteApiKey = envKey
    }
    const personalSiteAnthropic = new Anthropic({ apiKey: personalSiteApiKey, maxRetries: 2, timeout: 30_000 })
    const startedAt = Date.now()
    const response = await personalSiteAnthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are summarising a personal/portfolio website that may belong to a candidate named "${candidateName}".

Read the page text below and write 1–2 short sentences describing who this person appears to be (their role, focus, or notable work). If the page clearly is NOT about a person (e.g. a company landing page, a 404, a blog index with no author), say so plainly. Do not speculate beyond what's on the page.

Output the summary text only — no preamble, no markdown, no quotes.

PAGE TITLE: ${title}

PAGE TEXT:
${visibleText}`,
        },
      ],
    })
    if (tenantId) {
      logAiUsage({
        tenantId,
        userId: null,
        operation: 'personal_site_summary',
        model: response.model,
        usage: anthropicUsageToInput(response.usage),
        durationMs: Date.now() - startedAt,
        metadata: { candidateId, url, inputChars: visibleText.length },
      }).catch(() => {})
    }
    const block = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    )
    aiSummary = (block?.text ?? '').trim().slice(0, 500)
  } catch (err) {
    console.error('[enrichment.personal-site] AI summary failed:', err)
    return null
  }

  return { url, title, aiSummary }
}
