/**
 * server-only — help article loader
 *
 * Reads every .md file from src/content/help/, parses YAML front-matter
 * via gray-matter, validates fields with Zod, filters by audience, and
 * returns a sorted array. The parsed result is cached in a module-scope Map
 * so repeated calls within the same Node.js process pay the filesystem cost
 * only once (acceptable for files that don't change at runtime in prod).
 */
import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'
import type { UserRole } from '@/lib/auth/types'

// ── Front-matter Zod schema ───────────────────────────────────────────────────

const CATEGORIES = [
  'Getting Started',
  'Roles & Candidates',
  'AI Scoring & Interviews',
  'Hiring Manager Workflow',
  'Agencies & Customers',
  'Settings & Admin',
  'Tips & Best Practice',
  'Troubleshooting',
] as const

export type HelpCategory = (typeof CATEGORIES)[number]

// 'hiring_manager' is forward-compat — won't match any role on this branch
// until feat/hiring-manager-view (#95) merges.
const AudienceValues = ['all', 'admin', 'recruiter', 'hiring_manager', 'viewer'] as const
type Audience = (typeof AudienceValues)[number]

const ArticleFrontMatter = z.object({
  title: z.string().min(1),
  category: z.enum(CATEGORIES),
  audience: z.array(z.enum(AudienceValues)).default(['all']),
  order: z.number().int().default(100),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  tags: z.array(z.string()).default([]),
})

export type HelpArticle = {
  slug: string
  title: string
  category: HelpCategory
  audience: Audience[]
  order: number
  lastUpdated: string
  tags: string[]
  body: string
}

// ── Module-scope cache ────────────────────────────────────────────────────────

let _cache: HelpArticle[] | null = null

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'help')

function isVisibleTo(article: HelpArticle, role: UserRole): boolean {
  return article.audience.includes('all') || (article.audience as string[]).includes(role)
}

/** Parse a single .md file; returns null and logs a warning on failure. */
function parseFile(filePath: string): HelpArticle | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(raw)
    const parsed = ArticleFrontMatter.parse(data)
    const slug = path.basename(filePath, '.md')

    return {
      slug,
      title: parsed.title,
      category: parsed.category,
      audience: parsed.audience,
      order: parsed.order,
      lastUpdated: parsed.lastUpdated,
      tags: parsed.tags,
      body: content.trim(),
    }
  } catch (err) {
    console.warn(`[help/loader] Skipping ${filePath}: ${(err as Error).message}`)
    return null
  }
}

/** Load and cache all articles from src/content/help/. */
function loadAll(): HelpArticle[] {
  if (_cache !== null) return _cache

  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn('[help/loader] content directory not found:', CONTENT_DIR)
    _cache = []
    return _cache
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))

  const articles: HelpArticle[] = []
  for (const f of files) {
    const article = parseFile(path.join(CONTENT_DIR, f))
    if (article) articles.push(article)
  }

  // Sort by order ascending, then title alphabetically within the same order
  articles.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title)
  )

  _cache = articles
  return _cache
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all articles visible to the given role, sorted by order + title.
 */
export async function loadAllArticles(currentRole: UserRole): Promise<HelpArticle[]> {
  return loadAll().filter((a) => isVisibleTo(a, currentRole))
}

/**
 * Returns a single article by slug if it exists and is visible to the
 * given role; returns null otherwise.
 */
export async function loadArticleBySlug(
  slug: string,
  currentRole: UserRole
): Promise<HelpArticle | null> {
  const article = loadAll().find((a) => a.slug === slug) ?? null
  if (!article) return null
  return isVisibleTo(article, currentRole) ? article : null
}
