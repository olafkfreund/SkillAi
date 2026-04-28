/**
 * ArticleCard — tile component for a help article.
 *
 * Shows title, category label, last-updated date (en-GB locale),
 * and tag chips. Links to /dashboard/help/{slug}.
 * Server component — no 'use client'.
 */
import Link from 'next/link'
import type { HelpArticle } from '@/lib/help/loader'

type Props = {
  article: HelpArticle
}

export function ArticleCard({ article }: Props) {
  const updatedLabel = new Date(article.lastUpdated).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Link
      href={`/dashboard/help/${article.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-5
                 hover:border-violet-500/60 hover:bg-zinc-800/60 transition-colors"
    >
      {/* Category + date */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-medium text-violet-400 truncate">
          {article.category}
        </span>
        <time
          dateTime={article.lastUpdated}
          className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0"
        >
          {updatedLabel}
        </time>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors
                     leading-snug line-clamp-2">
        {article.title}
      </h3>

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          {article.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-zinc-800 border border-zinc-700
                         px-2 py-0.5 text-xs text-zinc-400"
            >
              {tag}
            </span>
          ))}
          {article.tags.length > 4 && (
            <span className="inline-block rounded-full bg-zinc-800 border border-zinc-700
                             px-2 py-0.5 text-xs text-zinc-500">
              +{article.tags.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}
