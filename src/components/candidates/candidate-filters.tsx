'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition, useState, useEffect, useRef } from 'react'
import { SearchIcon, XIcon, FileXIcon } from 'lucide-react'

type Props = {
  agencies: { id: string; name: string }[]
  currentFilters: { q?: string; status?: string; agencyId?: string; availability?: string; missingCv?: boolean; skills?: string[] }
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'hired', label: 'Hired' },
]

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'All availability' },
  { value: 'available', label: 'Available' },
  { value: 'on_project', label: 'On project' },
  { value: 'unavailable', label: 'Unavailable' },
]

export function CandidateFilters({ agencies, currentFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentFilters.q ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local search value in sync when URL changes externally
  useEffect(() => {
    setSearchValue(currentFilters.q ?? '')
  }, [currentFilters.q])

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams()
      // Merge current filters with updates
      if (currentFilters.q) params.set('q', currentFilters.q)
      if (currentFilters.status) params.set('status', currentFilters.status)
      if (currentFilters.agencyId) params.set('agencyId', currentFilters.agencyId)
      if (currentFilters.availability) params.set('availability', currentFilters.availability)
      if (currentFilters.missingCv) params.set('missingCv', '1')
      if (currentFilters.skills?.length) params.set('skills', currentFilters.skills.join(','))
      // Reset page on any filter change
      params.delete('page')

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }

      startTransition(() => {
        router.replace(pathname + '?' + params.toString(), { scroll: false })
      })
    },
    [router, pathname, currentFilters, startTransition]
  )

  const toggleMissingCv = () => {
    updateParams({ missingCv: currentFilters.missingCv ? '' : '1' })
  }

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value })
    }, 400)
  }

  const handleStatusChange = (value: string) => {
    updateParams({ status: value })
  }

  const handleAgencyChange = (value: string) => {
    updateParams({ agencyId: value })
  }

  const handleAvailabilityChange = (value: string) => {
    updateParams({ availability: value })
  }

  const removeSkill = (skill: string) => {
    const remaining = (currentFilters.skills ?? []).filter((s) => s !== skill)
    updateParams({ skills: remaining.join(',') })
  }

  const hasActiveFilters =
    !!currentFilters.q ||
    !!currentFilters.status ||
    !!currentFilters.agencyId ||
    !!currentFilters.availability ||
    !!currentFilters.missingCv ||
    (currentFilters.skills?.length ?? 0) > 0

  const clearFilters = () => {
    setSearchValue('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Active skill chips (from the Skills Explorer) */}
      {(currentFilters.skills?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-fg-subtle)]">Skills:</span>
          {currentFilters.skills!.map((skill) => (
            <button
              key={skill}
              onClick={() => removeSkill(skill)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium
                         bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300
                         border border-blue-300 dark:border-blue-800
                         hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors"
              aria-label={`Remove skill filter ${skill}`}
            >
              {skill}
              <XIcon className="h-3 w-3 opacity-70" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {/* Filter controls */}
      <div className="flex flex-col gap-3
                      sm:flex-row sm:items-center sm:flex-wrap">
      {/* Search input */}
      <div className="relative flex-1 min-w-0
                      sm:min-w-[240px] sm:max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-fg-subtle)] pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg pl-9 pr-3 py-2
                     text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     transition-colors"
          aria-label="Search candidates"
        />
      </div>

      {/* Status filter */}
      <select
        value={currentFilters.status ?? ''}
        onChange={(e) => handleStatusChange(e.target.value)}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-3 py-2
                   text-sm text-[var(--color-fg)]
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   transition-colors cursor-pointer"
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Agency filter */}
      <select
        value={currentFilters.agencyId ?? ''}
        onChange={(e) => handleAgencyChange(e.target.value)}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-3 py-2
                   text-sm text-[var(--color-fg)]
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   transition-colors cursor-pointer"
        aria-label="Filter by agency"
      >
        <option value="">All Agencies</option>
        {agencies.map((agency) => (
          <option key={agency.id} value={agency.id}>
            {agency.name}
          </option>
        ))}
      </select>

      {/* Availability filter */}
      <select
        name="availability"
        value={currentFilters.availability ?? ''}
        onChange={(e) => handleAvailabilityChange(e.target.value)}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-3 py-2
                   text-sm text-[var(--color-fg)]
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   transition-colors cursor-pointer"
        aria-label="Filter by availability"
      >
        {AVAILABILITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Missing CV toggle */}
      <button
        onClick={toggleMissingCv}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm
                    transition-colors cursor-pointer
                    ${currentFilters.missingCv
                      ? 'border-amber-500 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] hover:bg-[var(--color-bg-elevated)]'
                    }`}
        aria-pressed={!!currentFilters.missingCv}
        aria-label="Filter to candidates missing original CV"
      >
        <FileXIcon className="h-4 w-4" />
        Missing CV
        {currentFilters.missingCv && (
          <XIcon className="h-3.5 w-3.5 ml-0.5 opacity-70" aria-hidden="true" />
        )}
      </button>

      {/* Clear filters button */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     transition-colors px-2 py-2"
          aria-label="Clear all filters"
        >
          <XIcon className="h-4 w-4" />
          Clear
        </button>
      )}
      </div>
    </div>
  )
}
