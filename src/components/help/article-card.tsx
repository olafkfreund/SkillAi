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
      className="group flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5
                 hover:border-violet-500/60 hover:bg-[var(--color-bg-input)] transition-colors"
    >
      {/* Category + date */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-medium text-violet-400 truncate">
          {article.category}
        </span>
        <time
          dateTime={article.lastUpdated}
          className="text-xs text-[var(--color-fg-subtle)] whitespace-nowrap flex-shrink-0"
        >
          {updatedLabel}
        </time>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-[var(--color-fg)] group-hover:text-[var(--color-fg)] transition-colors
                     leading-snug line-clamp-2">
        {article.title}
      </h3>

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          {article.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-[var(--color-bg-input)] border border-[var(--color-border)]
                         px-2 py-0.5 text-xs text-[var(--color-fg-muted)]"
            >
              {tag}
            </span>
          ))}
          {article.tags.length > 4 && (
            <span className="inline-block rounded-full bg-[var(--color-bg-input)] border border-[var(--color-border)]
                             px-2 py-0.5 text-xs text-[var(--color-fg-subtle)]">
              +{article.tags.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}
