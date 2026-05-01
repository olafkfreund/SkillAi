'use client'

import { useState, useEffect, useRef } from 'react'
import { UserPlusIcon, ZapIcon, Loader2Icon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { searchCandidatesForRole, type CandidateSearchResult } from '@/actions/candidates'
import { rescoreCandidate } from '@/actions/scores'

type Props = {
  roleId: string
  canEdit: boolean
}

type AddingState = 'idle' | 'pending' | 'done'

export function AddCandidatePanel({ roleId, canEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CandidateSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [addingState, setAddingState] = useState<Record<string, AddingState>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search — fires 300ms after the user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 1) {
      setResults([])
      setSearched(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const found = await searchCandidatesForRole(roleId, query)
      setResults(found)
      setSearched(true)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, roleId])

  async function handleAdd(candidateId: string) {
    setAddingState((prev) => ({ ...prev, [candidateId]: 'pending' }))
    try {
      await rescoreCandidate(candidateId, roleId)
      setAddingState((prev) => ({ ...prev, [candidateId]: 'done' }))
      // Remove the candidate row from the list after a brief confirmation delay
      setTimeout(() => {
        setResults((prev) => prev.filter((c) => c.id !== candidateId))
        setAddingState((prev) => {
          const next = { ...prev }
          delete next[candidateId]
          return next
        })
      }, 1500)
    } catch {
      // On failure revert so the user can retry
      setAddingState((prev) => ({ ...prev, [candidateId]: 'idle' }))
    }
  }

  if (!canEdit) return null

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] mb-6">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left
                   hover:bg-[var(--color-bg-input)] transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <UserPlusIcon className="h-4 w-4 text-blue-400" />
          <span className="font-semibold text-[var(--color-fg)]">Add from archive</span>
        </div>
        {expanded ? (
          <ChevronUpIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        )}
      </button>

      {expanded && (
        <div className="px-6 pb-6">
          {/* Search input */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-[var(--color-fg)]
                       placeholder:text-[var(--color-fg-subtle)] text-sm px-4 py-2.5 mb-3
                       focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />

          {/* Results */}
          {searched && results.length === 0 && (
            <p className="text-[var(--color-fg-subtle)] text-sm">No candidates found.</p>
          )}

          {results.length > 0 && (
            <div className="grid gap-2">
              {results.map((c) => {
                const state = addingState[c.id] ?? 'idle'
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg bg-[var(--color-bg-input)]
                               border border-[var(--color-border)] px-4 py-3 gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-fg)] truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      {c.email && (
                        <p className="text-xs text-[var(--color-fg-subtle)] truncate">{c.email}</p>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {state === 'done' ? (
                        <span className="text-xs text-green-400 font-medium">
                          Added — scoring queued
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAdd(c.id)}
                          disabled={state === 'pending'}
                          className="flex items-center gap-1.5 rounded-md bg-blue-700 text-white
                                     text-xs font-medium px-3 py-1.5 hover:bg-blue-600
                                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {state === 'pending' ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ZapIcon className="h-3.5 w-3.5" />
                          )}
                          Add &amp; Score
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
