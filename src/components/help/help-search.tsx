'use client'

/**
 * HelpSearch — search box + category filter for /dashboard/help.
 *
 * URLSearchParams-driven; mirrors the pattern from
 * src/components/candidates/candidate-filters.tsx.
 * Pushes to /dashboard/help?q=…&cat=…
 */
import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useTransition, useState, useEffect, useRef } from 'react'
import { SearchIcon, XIcon } from 'lucide-react'
import type { HelpCategory } from '@/lib/help/loader'

const HELP_PATH = '/dashboard/help'

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'Getting Started', label: 'Getting Started' },
  { value: 'Roles & Candidates', label: 'Roles & Candidates' },
  { value: 'AI Scoring & Interviews', label: 'AI Scoring & Interviews' },
  { value: 'Hiring Manager Workflow', label: 'Hiring Manager Workflow' },
  { value: 'Agencies & Customers', label: 'Agencies & Customers' },
  { value: 'Settings & Admin', label: 'Settings & Admin' },
  { value: 'Tips & Best Practice', label: 'Tips & Best Practice' },
  { value: 'Troubleshooting', label: 'Troubleshooting' },
]

type Props = {
  currentQ: string
  currentCat: string
}

export function HelpSearch({ currentQ, currentCat }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentQ)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local value in sync when URL changes externally
  useEffect(() => {
    setSearchValue(currentQ)
  }, [currentQ])

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams()
      if (currentQ) params.set('q', currentQ)
      if (currentCat) params.set('cat', currentCat)

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }

      startTransition(() => {
        router.replace(
          (pathname.startsWith(HELP_PATH) ? pathname.split('/').slice(0, 3).join('/') : HELP_PATH) +
            (params.toString() ? '?' + params.toString() : ''),
          { scroll: false }
        )
      })
    },
    [router, pathname, currentQ, currentCat, startTransition]
  )

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value })
    }, 400)
  }

  const handleCategoryChange = (value: string) => {
    updateParams({ cat: value })
  }

  const hasActive = !!currentQ || !!currentCat

  const clearFilters = () => {
    setSearchValue('')
    startTransition(() => {
      router.replace(HELP_PATH, { scroll: false })
    })
  }

  return (
    <div className="flex flex-col gap-3
                    sm:flex-row sm:items-center sm:flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-0
                      sm:min-w-[260px] sm:max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search help articles..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2
                     text-sm text-zinc-200 placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                     transition-colors"
          aria-label="Search help articles"
        />
      </div>

      {/* Category filter */}
      <select
        value={currentCat}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                   text-sm text-zinc-200
                   focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                   transition-colors cursor-pointer"
        aria-label="Filter by category"
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200
                     transition-colors px-2 py-2"
          aria-label="Clear search and filters"
        >
          <XIcon className="h-4 w-4" />
          Clear
        </button>
      )}
    </div>
  )
}
