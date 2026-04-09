'use client'

import { useState, useRef } from 'react'
import { BrainIcon, XIcon, SearchIcon, Loader2Icon, ChevronDownIcon } from 'lucide-react'
import Link from 'next/link'

interface SemanticResult {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  similarity: number
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-zinc-700 text-zinc-300',
  shortlisted: 'bg-blue-900/50 text-blue-300',
  interviewing: 'bg-purple-900/50 text-purple-300',
  offered: 'bg-amber-900/50 text-amber-300',
  hired: 'bg-green-900/50 text-green-300',
  rejected: 'bg-red-900/50 text-red-300',
}

export function SemanticSearchToggle() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setSearched(false)

    try {
      const res = await fetch('/api/candidates/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
      const data = await res.json() as { results?: SemanticResult[]; error?: string }
      if (data.error) {
        setError(data.error)
        setResults([])
      } else {
        setResults(data.results ?? [])
      }
    } catch {
      setError('Search failed. Check your Google AI API key in Settings.')
      setResults([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') search()
  }

  const handleToggle = () => {
    setOpen((prev) => {
      if (!prev) {
        // Focus input when opening
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      return !prev
    })
  }

  const handleClose = () => {
    setOpen(false)
    setQuery('')
    setResults([])
    setError(null)
    setSearched(false)
  }

  const similarityPercent = (val: number) => `${Math.round(val * 100)}%`

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2
                   text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   transition-colors"
        aria-expanded={open}
        aria-controls="semantic-search-panel"
      >
        <BrainIcon className="h-4 w-4 text-purple-400" />
        AI Semantic Search
        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable panel */}
      {open && (
        <div
          id="semantic-search-panel"
          className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4"
          role="search"
          aria-label="Semantic candidate search"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">Semantic Candidate Search</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Describe the ideal candidate in plain English — AI finds the closest matches.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"
              aria-label="Close semantic search"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Search input row */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Senior TypeScript engineer with React and PostgreSQL experience"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                         text-sm text-zinc-200 placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                         transition-colors"
              aria-label="Semantic search query"
            />
            <button
              onClick={search}
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2
                         text-sm font-medium text-white
                         hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-purple-500
                         transition-colors"
              aria-label="Run semantic search"
            >
              {loading ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
              Search
            </button>
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-3 text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Results */}
          {searched && !loading && !error && (
            <div className="mt-4">
              {results.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No candidates with embeddings found. Upload and score candidates to enable semantic search.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 mb-3">
                    {results.length} closest match{results.length !== 1 ? 'es' : ''}
                  </p>
                  {results.map((r) => (
                    <Link
                      key={r.id}
                      href={`/dashboard/candidates/${r.id}`}
                      className="flex items-center justify-between rounded-lg bg-zinc-800 border border-zinc-700
                                 px-4 py-3 hover:bg-zinc-750 hover:border-zinc-600 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                          {r.first_name} {r.last_name}
                        </p>
                        {r.email && (
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{r.email}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize
                                      ${STATUS_COLORS[r.status] ?? 'bg-zinc-700 text-zinc-300'}`}
                        >
                          {r.status}
                        </span>
                        <span className="text-sm font-semibold text-purple-400 tabular-nums min-w-[3rem] text-right">
                          {similarityPercent(r.similarity)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
