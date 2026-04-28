/**
 * /dashboard/help — Help centre landing page.
 *
 * Server component. Loads all articles visible to the current user's role,
 * applies URL search params (q, cat) as in-process filters, groups results
 * by category, and renders <HelpSearch> above an <ArticleCard> grid.
 */
import { notFound } from 'next/navigation'
import { BookOpenIcon } from 'lucide-react'

import { auth } from '@/lib/auth'
import { loadAllArticles } from '@/lib/help/loader'
import { HelpSearch } from '@/components/help/help-search'
import { ArticleCard } from '@/components/help/article-card'
import type { HelpCategory } from '@/lib/help/loader'

export const metadata = { title: 'Help — SkillAI' }

type Props = {
  searchParams: Promise<{ q?: string; cat?: string }>
}

export default async function HelpPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) notFound()

  const { q = '', cat = '' } = await searchParams
  const role = session.user.role

  let articles = await loadAllArticles(role)

  // Apply search filter (title, tags, category)
  if (q.trim()) {
    const lower = q.trim().toLowerCase()
    articles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(lower) ||
        a.category.toLowerCase().includes(lower) ||
        a.tags.some((t) => t.toLowerCase().includes(lower))
    )
  }

  // Apply category filter
  if (cat) {
    articles = articles.filter((a) => a.category === cat)
  }

  // Group by category, preserving order of first appearance
  const categoryMap = new Map<HelpCategory, typeof articles>()
  for (const article of articles) {
    const bucket = categoryMap.get(article.category) ?? []
    bucket.push(article)
    categoryMap.set(article.category, bucket)
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BookOpenIcon className="h-6 w-6 text-violet-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Help Centre</h1>
        </div>
        <p className="text-[var(--color-fg-subtle)] text-sm">
          Guides and tips for getting the most from SkillAI.
        </p>
      </div>

      {/* Search + category filter */}
      <div className="mb-8">
        <HelpSearch currentQ={q} currentCat={cat} />
      </div>

      {/* Article grid, grouped by category */}
      {categoryMap.size === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-12 text-center">
          <BookOpenIcon className="mx-auto mb-3 h-8 w-8 text-[var(--color-fg-subtle)]" />
          <p className="text-[var(--color-fg-muted)] text-sm">
            {q || cat ? 'No articles match your search.' : 'No help articles available yet.'}
          </p>
          {(q || cat) && (
            <p className="text-[var(--color-fg-subtle)] text-xs mt-1">
              Try a different search term or clear the filters.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {Array.from(categoryMap.entries()).map(([category, catArticles]) => (
            <section key={category} aria-labelledby={`cat-${category}`}>
              <h2
                id={`cat-${category}`}
                className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider mb-4"
              >
                {category}
              </h2>
              <div className="grid grid-cols-1
                              sm:grid-cols-2
                              lg:grid-cols-3 gap-4">
                {catArticles.map((article) => (
                  <ArticleCard key={article.slug} article={article} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
