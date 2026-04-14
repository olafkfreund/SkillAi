'use client'

import ReactMarkdown from 'react-markdown'

type Props = {
  text: string
}

/**
 * Render role description/requirements with markdown support.
 *
 * No @tailwindcss/typography prose plugin is installed, so we provide
 * explicit element styling via the `components` prop. Falls back to
 * a plain whitespace-pre-wrap paragraph if the input has no markdown
 * structure (single paragraph, no headers/lists/bold).
 */
export function RoleContent({ text }: Props) {
  if (!text || text.trim().length === 0) {
    return <p className="text-sm text-zinc-500 italic">No content yet.</p>
  }

  return (
    <div className="text-sm text-zinc-300 leading-relaxed space-y-3">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h3 className="text-base font-semibold text-zinc-100 mt-4 mb-2">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-sm font-semibold text-zinc-100 mt-4 mb-2 uppercase tracking-wide">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm font-semibold text-zinc-200 mt-3 mb-1.5">{children}</h4>
          ),
          h4: ({ children }) => (
            <h5 className="text-xs font-semibold text-zinc-200 mt-2 mb-1 uppercase tracking-wide">{children}</h5>
          ),
          p: ({ children }) => <p className="text-zinc-300">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-zinc-300">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-zinc-300">{children}</ol>,
          li: ({ children }) => <li className="text-zinc-300">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
          em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-xs font-mono text-violet-300">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-400">{children}</blockquote>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
