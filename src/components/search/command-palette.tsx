'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  SearchIcon,
  Loader2Icon,
  UserIcon,
  BriefcaseIcon,
  BuildingIcon,
  Building2Icon,
} from 'lucide-react'
import { searchGlobal } from '@/actions/search'
import type { GlobalSearchResult } from '@/actions/search'

type Props = {
  open: boolean
  onClose: () => void
}

const EMPTY_RESULTS: GlobalSearchResult = {
  candidates: [],
  roles: [],
  customers: [],
  agencies: [],
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [rawResults, setRawResults] = useState<GlobalSearchResult>(EMPTY_RESULTS)
  const [isPending, startTransition] = useTransition()

  // Reset state inline (not in an effect) when closing — avoids
  // react-hooks/set-state-in-effect lint violation.
  const handleClose = useCallback(() => {
    setQuery('')
    setRawResults(EMPTY_RESULTS)
    onClose()
  }, [onClose])

  // Debounced search — only when query is long enough to be meaningful.
  // No setState in effect: short queries produce empty results via the derived
  // `results` below.
  useEffect(() => {
    if (query.length < 2) return
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchGlobal(query)
        setRawResults(res)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Esc key defence-in-depth (cmdk handles within Command, this handles the
  // outer overlay where focus may not be inside the Command tree).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  if (!open) return null

  // Derive the effective results: short queries always show empty
  // (avoids storing-then-clearing in state).
  const results: GlobalSearchResult = query.length < 2 ? EMPTY_RESULTS : rawResults

  const hasResults =
    results.candidates.length > 0 ||
    results.roles.length > 0 ||
    results.customers.length > 0 ||
    results.agencies.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <Command
        label="Global search"
        className="w-full max-w-xl bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden"
        loop
      >
        {/* Search input */}
        <div className="border-b border-[var(--color-border)] px-3 flex items-center gap-2">
          <SearchIcon className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
          <Command.Input
            autoFocus
            placeholder="Search candidates, roles, customers..."
            value={query}
            onValueChange={setQuery}
            className="flex-1 bg-transparent text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] py-3 text-sm focus:outline-none"
          />
          {isPending && (
            <Loader2Icon className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)] animate-spin" />
          )}
        </div>

        {/* Results list */}
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {!hasResults && (
            <Command.Empty className="py-6 text-center text-sm text-[var(--color-fg-subtle)]">
              {query.length < 2 ? 'Type at least 2 characters to search' : 'No matches'}
            </Command.Empty>
          )}

          {/* Candidates */}
          {results.candidates.length > 0 && (
            <Command.Group
              heading="Candidates"
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:py-1"
            >
              {results.candidates.map((c) => (
                <Command.Item
                  key={c.id}
                  value={`candidate-${c.id}-${c.firstName}-${c.lastName}`}
                  onSelect={() => {
                    router.push(`/dashboard/candidates/${c.id}`)
                    handleClose()
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded text-sm text-[var(--color-fg)] cursor-pointer data-[selected=true]:bg-[var(--color-bg-input)] aria-selected:bg-[var(--color-bg-input)]"
                >
                  <UserIcon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="flex-1 truncate">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="text-xs text-[var(--color-fg-subtle)] truncate max-w-[140px]">
                    {c.agencyName ?? c.email ?? ''}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Roles */}
          {results.roles.length > 0 && (
            <Command.Group
              heading="Roles"
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:py-1"
            >
              {results.roles.map((r) => (
                <Command.Item
                  key={r.id}
                  value={`role-${r.id}-${r.title}`}
                  onSelect={() => {
                    router.push(`/dashboard/roles/${r.id}`)
                    handleClose()
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded text-sm text-[var(--color-fg)] cursor-pointer data-[selected=true]:bg-[var(--color-bg-input)] aria-selected:bg-[var(--color-bg-input)]"
                >
                  <BriefcaseIcon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-[var(--color-fg-subtle)] truncate max-w-[140px]">
                    {r.customerName ?? r.customerRoleId ?? ''}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Customers */}
          {results.customers.length > 0 && (
            <Command.Group
              heading="Customers"
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:py-1"
            >
              {results.customers.map((c) => (
                <Command.Item
                  key={c.id}
                  value={`customer-${c.id}-${c.name}`}
                  onSelect={() => {
                    router.push(`/dashboard/customers/${c.id}`)
                    handleClose()
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded text-sm text-[var(--color-fg)] cursor-pointer data-[selected=true]:bg-[var(--color-bg-input)] aria-selected:bg-[var(--color-bg-input)]"
                >
                  <BuildingIcon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="flex-1 truncate">{c.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Agencies */}
          {results.agencies.length > 0 && (
            <Command.Group
              heading="Agencies"
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:py-1"
            >
              {results.agencies.map((a) => (
                <Command.Item
                  key={a.id}
                  value={`agency-${a.id}-${a.name}`}
                  onSelect={() => {
                    router.push(`/dashboard/agencies/${a.id}`)
                    handleClose()
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded text-sm text-[var(--color-fg)] cursor-pointer data-[selected=true]:bg-[var(--color-bg-input)] aria-selected:bg-[var(--color-bg-input)]"
                >
                  <Building2Icon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="flex-1 truncate">{a.name}</span>
                  {a.isInternal && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 shrink-0">
                      Internal
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  )
}
