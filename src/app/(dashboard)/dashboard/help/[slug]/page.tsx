/**
 * /dashboard/help/[slug] — Article detail page.
 *
 * Server component. Loads the article by slug (audience-filtered),
 * renders breadcrumb + title + last-updated pill + audience badges +
 * markdown body using the same ReactMarkdown components map as
 * src/components/roles/role-content.tsx.
 *
 * Returns 404 via notFound() for unknown/hidden slugs.
 */
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { ChevronRightIcon, CalendarIcon } from 'lucide-react'

import { auth } from '@/lib/auth'
import { loadArticleBySlug } from '@/lib/help/loader'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `${slug} — Help — SkillAI` }
}

const AUDIENCE_LABEL: Record<string, string> = {
  all: 'Everyone',
  admin: 'Admin',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring Manager',
  viewer: 'Viewer',
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params

  const session = await auth()
  if (!session?.user) notFound()

  const article = await loadArticleBySlug(slug, session.user.role)
  if (!article) notFound()

  const updatedLabel = new Date(article.lastUpdated).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-[var(--color-fg-subtle)] mb-6" aria-label="Breadcrumb">
        <Link href="/dashboard/help" className="hover:text-[var(--color-fg)] transition-colors">
          Help Centre
        </Link>
        <ChevronRightIcon className="h-3 w-3 flex-shrink-0" />
        <span className="text-violet-400">{article.category}</span>
        <ChevronRightIcon className="h-3 w-3 flex-shrink-0" />
        <span className="text-[var(--color-fg)] truncate">{article.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-fg)] mb-4 leading-tight">
          {article.title}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Last updated pill */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-bg-input)] border border-[var(--color-border)]
                           px-3 py-1 text-xs text-[var(--color-fg-muted)]">
            <CalendarIcon className="h-3 w-3" />
            Updated{' '}
            <time dateTime={article.lastUpdated}>{updatedLabel}</time>
          </span>

          {/* Audience badges */}
          {article.audience.map((aud) => (
            <span
              key={aud}
              className="inline-block rounded-full bg-violet-950 border border-violet-700
                         px-2.5 py-0.5 text-xs font-medium text-violet-300"
            >
              {AUDIENCE_LABEL[aud] ?? aud}
            </span>
          ))}

          {/* Tags */}
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-[var(--color-bg-input)] border border-[var(--color-border)]
                         px-2 py-0.5 text-xs text-[var(--color-fg-subtle)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Article body — identical component map to role-content.tsx */}
      <article className="text-sm text-[var(--color-fg)] leading-relaxed space-y-3">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h3 className="text-base font-semibold text-[var(--color-fg)] mt-4 mb-2">{children}</h3>
            ),
            h2: ({ children }) => (
              <h3 className="text-sm font-semibold text-[var(--color-fg)] mt-4 mb-2 uppercase tracking-wide">{children}</h3>
            ),
            h3: ({ children }) => (
              <h4 className="text-sm font-semibold text-[var(--color-fg)] mt-3 mb-1.5">{children}</h4>
            ),
            h4: ({ children }) => (
              <h5 className="text-xs font-semibold text-[var(--color-fg)] mt-2 mb-1 uppercase tracking-wide">{children}</h5>
            ),
            p: ({ children }) => <p className="text-[var(--color-fg)]">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-[var(--color-fg)]">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-[var(--color-fg)]">{children}</ol>,
            li: ({ children }) => <li className="text-[var(--color-fg)]">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-[var(--color-fg)]">{children}</strong>,
            em: ({ children }) => <em className="italic text-[var(--color-fg)]">{children}</em>,
            code: ({ children }) => (
              <code className="rounded bg-[var(--color-bg-input)] border border-[var(--color-border)] px-1.5 py-0.5 text-xs font-mono text-violet-300">
                {children}
              </code>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-300 hover:text-violet-200 underline underline-offset-2"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-[var(--color-border)] pl-3 italic text-[var(--color-fg-muted)]">{children}</blockquote>
            ),
          }}
        >
          {article.body}
        </ReactMarkdown>
      </article>

      {/* Back link */}
      <div className="mt-10 pt-6 border-t border-[var(--color-border)]">
        <Link
          href="/dashboard/help"
          className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Back to Help Centre
        </Link>
      </div>
    </div>
  )
}
