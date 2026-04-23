'use client'

import { useState, useTransition } from 'react'
import {
  Globe, MessageSquare, Loader2, Search, ExternalLink, RefreshCw,
  ChevronDown, ChevronUp, Star, BookOpen, Users, Code2, Link2, GitBranch
} from 'lucide-react'
import { enrichCandidate, updateCandidateLinks } from '@/actions/enrichment'
import type { WebHit, GitHubProfile } from '@/db/schema/candidate-enrichments'

interface Props {
  candidateId: string
  initialLinkedinUrl: string | null
  initialGithubUsername: string | null
  initialEnrichment: {
    webHits: WebHit[]
    githubProfile: GitHubProfile | null
    searchedAt: string | null
  } | null
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  linkedin:     <Link2 className="h-3.5 w-3.5 text-blue-400" />,
  github:       <GitBranch className="h-3.5 w-3.5 text-zinc-400" />,
  reddit:       <MessageSquare className="h-3.5 w-3.5 text-orange-400" />,
  twitter:      <Globe className="h-3.5 w-3.5 text-sky-400" />,
  facebook:     <Globe className="h-3.5 w-3.5 text-blue-400" />,
  stackoverflow:<Globe className="h-3.5 w-3.5 text-orange-400" />,
  medium:       <BookOpen className="h-3.5 w-3.5 text-zinc-400" />,
  devto:        <Code2 className="h-3.5 w-3.5 text-zinc-400" />,
  web:          <Globe className="h-3.5 w-3.5 text-zinc-500" />,
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn', github: 'GitHub', reddit: 'Reddit',
  twitter: 'X / Twitter', facebook: 'Facebook', stackoverflow: 'Stack Overflow',
  medium: 'Medium', devto: 'dev.to', web: 'Web',
}

export function EnrichmentPanel({ candidateId, initialLinkedinUrl, initialGithubUsername, initialEnrichment }: Props) {
  const [linkedinUrl, setLinkedinUrl] = useState(initialLinkedinUrl ?? '')
  const [githubUsername, setGithubUsername] = useState(initialGithubUsername ?? '')
  const [enrichment, setEnrichment] = useState(initialEnrichment)
  const [error, setError] = useState<string | null>(null)
  const [showAllHits, setShowAllHits] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSearch() {
    setError(null)
    startTransition(async () => {
      // Save links first
      await updateCandidateLinks(
        candidateId,
        linkedinUrl.trim() || null,
        githubUsername.trim() || null
      )

      const result = await enrichCandidate(candidateId)
      if (!result.success) {
        setError(result.error)
        return
      }
      setEnrichment({
        webHits: result.webHits,
        githubProfile: result.githubProfile,
        searchedAt: result.searchedAt,
      })
    })
  }

  const hits = enrichment?.webHits ?? []
  const github = enrichment?.githubProfile
  const visibleHits = showAllHits ? hits : hits.slice(0, 5)

  // Group hits by source for the summary bar
  const sourceCounts = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.source] = (acc[h.source] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">LinkedIn URL</label>
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/username"
            disabled={isPending}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">GitHub username</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
              placeholder="octocat"
              disabled={isPending}
              className="flex-1 rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-sm font-medium
                         px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Searching…</>
              ) : enrichment ? (
                <><RefreshCw className="h-4 w-4" /> Re-search</>
              ) : (
                <><Search className="h-4 w-4" /> Search web</>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!process.env.NEXT_PUBLIC_BRAVE_CONFIGURED && !enrichment && !isPending && (
        <p className="text-xs text-amber-400 bg-amber-950 border border-amber-800 rounded-md px-3 py-2">
          Add <code className="font-mono">BRAVE_SEARCH_API_KEY</code> to <code className="font-mono">.env.local</code> to enable web search.
          GitHub search works without it if a username is provided.
        </p>
      )}

      {/* GitHub profile card */}
      {github && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={github.avatarUrl}
              alt={github.login}
              className="h-14 w-14 rounded-full border border-zinc-600 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-zinc-400" />
                <a
                  href={github.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-zinc-100 hover:text-blue-400"
                >
                  {github.name ?? github.login}
                </a>
                <span className="text-zinc-500 text-sm">@{github.login}</span>
              </div>
              {github.bio && <p className="text-sm text-zinc-400 mt-1">{github.bio}</p>}
              <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> {github.publicRepos} repos
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {github.followers} followers
                </span>
              </div>
            </div>
          </div>

          {github.topRepos.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Top repositories</p>
              {github.topRepos.map((repo) => (
                <a
                  key={repo.name}
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between rounded-lg border border-zinc-700 bg-zinc-900
                             px-3 py-2 hover:border-blue-500 hover:bg-blue-950/40 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-blue-400">{repo.name}</span>
                    {repo.language && (
                      <span className="ml-2 text-xs text-zinc-500 bg-zinc-700 rounded px-1.5 py-0.5">
                        {repo.language}
                      </span>
                    )}
                    {repo.description && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">{repo.description}</p>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-zinc-500 ml-3 shrink-0">
                    <Star className="h-3 w-3" /> {repo.stars}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Web hits */}
      {hits.length > 0 && (
        <div className="space-y-2">
          {/* Source summary */}
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(sourceCounts).map(([source, count]) => (
              <span
                key={source}
                className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800
                           px-2.5 py-1 text-xs text-zinc-400"
              >
                {SOURCE_ICONS[source] ?? SOURCE_ICONS.web}
                {SOURCE_LABELS[source] ?? source} ({count})
              </span>
            ))}
          </div>

          {visibleHits.map((hit, i) => (
            <a
              key={i}
              href={hit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3
                         hover:border-blue-500 hover:shadow-sm transition-all group"
            >
              <div className="mt-0.5 shrink-0">
                {SOURCE_ICONS[hit.source] ?? SOURCE_ICONS.web}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 group-hover:text-blue-400 truncate">
                  {hit.title}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{hit.description}</p>
                <p className="text-xs text-zinc-600 mt-1 truncate">{hit.url}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-blue-400 shrink-0 mt-0.5" />
            </a>
          ))}

          {hits.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllHits((v) => !v)}
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-1"
            >
              {showAllHits ? (
                <><ChevronUp className="h-4 w-4" /> Show fewer</>
              ) : (
                <><ChevronDown className="h-4 w-4" /> Show {hits.length - 5} more results</>
              )}
            </button>
          )}

          {enrichment?.searchedAt && (
            <p className="text-xs text-zinc-500 mt-2" suppressHydrationWarning>
              Last searched {new Date(enrichment.searchedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {enrichment && hits.length === 0 && !github && !isPending && (
        <p className="text-sm text-zinc-500 text-center py-4">
          No results found. Try adding a LinkedIn URL or GitHub username for better results.
        </p>
      )}
    </div>
  )
}
