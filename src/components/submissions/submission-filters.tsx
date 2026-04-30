'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useTransition, useState, useEffect, useRef } from 'react'
import { SearchIcon, XIcon } from 'lucide-react'
import type { SubmissionStatus } from '@/db/schema/role-submissions'

const STATUS_OPTIONS: Array<{ value: SubmissionStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'interview_scheduled', label: 'Interview scheduled' },
  { value: 'interview_done', label: 'Interview done' },
  { value: 'feedback_pending', label: 'Feedback pending' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const SORT_OPTIONS = [
  { value: 'sentAt-desc', label: 'Recently sent' },
  { value: 'sentAt-asc', label: 'Oldest sent first' },
  { value: 'statusUpdatedAt-asc', label: 'Stalest first' },
  { value: 'statusUpdatedAt-desc', label: 'Most recently updated' },
]

type Props = {
  initialStatus?: SubmissionStatus | ''
  initialRoleId?: string
  initialCustomerId?: string
  initialAgencyId?: string
  initialQ?: string
  initialDateFrom?: string  // YYYY-MM-DD
  initialDateTo?: string    // YYYY-MM-DD
  initialSort?: string      // 'sentAt-desc' | 'sentAt-asc' | 'statusUpdatedAt-desc' | 'statusUpdatedAt-asc'
  roleOptions: Array<{ id: string; title: string }>
  customerOptions: Array<{ id: string; name: string }>
  agencyOptions: Array<{ id: string; name: string }>
}

export function SubmissionFilters({
  initialStatus,
  initialRoleId,
  initialCustomerId,
  initialAgencyId,
  initialQ,
  initialDateFrom,
  initialDateTo,
  initialSort,
  roleOptions,
  customerOptions,
  agencyOptions,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(initialQ ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mirrors the existing candidate-filters.tsx pattern. The set-state-in-
  // effect lint rule fires on this; codebase convention is to accept it
  // here (same offender exists in candidate-filters.tsx).
  useEffect(() => {
    setSearchValue(initialQ ?? '')
  }, [initialQ])

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams()
      // Preserve current filter values
      if (initialQ) params.set('q', initialQ)
      if (initialStatus) params.set('status', initialStatus)
      if (initialRoleId) params.set('roleId', initialRoleId)
      if (initialCustomerId) params.set('customerId', initialCustomerId)
      if (initialAgencyId) params.set('agencyId', initialAgencyId)
      if (initialDateFrom) params.set('dateFrom', initialDateFrom)
      if (initialDateTo) params.set('dateTo', initialDateTo)
      if (initialSort) params.set('sort', initialSort)
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
    [router, pathname, initialQ, initialStatus, initialRoleId, initialCustomerId, initialAgencyId, initialDateFrom, initialDateTo, initialSort, startTransition]
  )

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value })
    }, 400)
  }

  const hasActiveFilters =
    !!initialQ ||
    !!initialStatus ||
    !!initialRoleId ||
    !!initialCustomerId ||
    !!initialAgencyId ||
    !!initialDateFrom ||
    !!initialDateTo ||
    !!(initialSort && initialSort !== 'sentAt-desc')

  const clearFilters = () => {
    setSearchValue('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  const selectClass =
    'bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-3 py-2 ' +
    'text-sm text-[var(--color-fg)] ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
    'transition-colors cursor-pointer'

  return (
    <div className="flex flex-col gap-3
                    sm:flex-row sm:items-center sm:flex-wrap">
      {/* Candidate name search */}
      <div className="relative flex-1 min-w-0
                      sm:min-w-[240px] sm:max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-fg-subtle)] pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by candidate name..."
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg pl-9 pr-3 py-2
                     text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     transition-colors"
          aria-label="Search by candidate name"
        />
      </div>

      {/* Status filter */}
      <select
        value={initialStatus ?? ''}
        onChange={(e) => updateParams({ status: e.target.value })}
        className={selectClass}
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Role filter */}
      <select
        value={initialRoleId ?? ''}
        onChange={(e) => updateParams({ roleId: e.target.value })}
        className={selectClass}
        aria-label="Filter by role"
      >
        <option value="">All Roles</option>
        {roleOptions.map((role) => (
          <option key={role.id} value={role.id}>
            {role.title}
          </option>
        ))}
      </select>

      {/* Customer filter */}
      <select
        value={initialCustomerId ?? ''}
        onChange={(e) => updateParams({ customerId: e.target.value })}
        className={selectClass}
        aria-label="Filter by customer"
      >
        <option value="">All Customers</option>
        {customerOptions.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>

      {/* Agency filter */}
      <select
        value={initialAgencyId ?? ''}
        onChange={(e) => updateParams({ agencyId: e.target.value })}
        className={selectClass}
        aria-label="Filter by agency"
      >
        <option value="">All Agencies</option>
        {agencyOptions.map((agency) => (
          <option key={agency.id} value={agency.id}>
            {agency.name}
          </option>
        ))}
      </select>

      {/* Date from */}
      <input
        type="date"
        value={initialDateFrom ?? ''}
        onChange={(e) => updateParams({ dateFrom: e.target.value })}
        className={selectClass}
        aria-label="Filter by sent from date"
        title="Sent from"
      />

      {/* Date to */}
      <input
        type="date"
        value={initialDateTo ?? ''}
        onChange={(e) => updateParams({ dateTo: e.target.value })}
        className={selectClass}
        aria-label="Filter by sent to date"
        title="Sent until"
      />

      {/* Sort */}
      <select
        value={initialSort ?? 'sentAt-desc'}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className={selectClass}
        aria-label="Sort order"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
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
  )
}
