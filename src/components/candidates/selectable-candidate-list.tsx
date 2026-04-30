'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, HomeIcon } from 'lucide-react'
import { ComparisonCheckbox } from './comparison-checkbox'
import { BulkStatusBar } from './bulk-status-bar'

// Agency logo + initials-fallback — mirrors the pattern in the table cells below
function AgencyLogo({
  agencyId,
  agencyLogoPath,
  agencyName,
}: {
  agencyId: string | null
  agencyLogoPath: string | null
  agencyName: string | null
}) {
  if (!agencyId) return null
  return agencyLogoPath ? (
    <img
      src={`/api/agencies/${agencyId}/logo`}
      alt=""
      width={20}
      height={20}
      style={{ width: 20, height: 20 }}
      className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] object-contain shrink-0"
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-full bg-[var(--color-bg-input)]
                 text-[var(--color-fg-muted)] text-xs font-semibold shrink-0"
      style={{ width: 20, height: 20 }}
      aria-hidden="true"
    >
      {agencyName?.charAt(0).toUpperCase() ?? '?'}
    </div>
  )
}

// Status pills resolve through CSS-var tokens so each status reads correctly
// in both dark and light themes. See globals.css for the per-theme palette.
const STATUS_BADGE: Record<string, string> = {
  new:          'bg-[var(--color-status-new-bg)]          text-[var(--color-status-new-fg)]',
  shortlisted:  'bg-[var(--color-status-shortlisted-bg)]  text-[var(--color-status-shortlisted-fg)]',
  interviewing: 'bg-[var(--color-status-interviewing-bg)] text-[var(--color-status-interviewing-fg)]',
  offered:      'bg-[var(--color-status-offered-bg)]      text-[var(--color-status-offered-fg)]',
  hired:        'bg-[var(--color-status-hired-bg)]        text-[var(--color-status-hired-fg)]',
  rejected:     'bg-[var(--color-status-rejected-bg)]     text-[var(--color-status-rejected-fg)]',
}

export type CandidateRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  filePath: string | null
  status: string
  createdAt: string | Date
  agencyId: string | null
  agencyName: string | null
  agencyLogoPath: string | null
  candidateRate: string | null
  customerRate: string | null
  rateCurrency: string | null
  isInternalAgency?: boolean
  availabilityStatus?: string
  availableFrom?: string | null
}

function formatAvailableFrom(date: string | null | undefined): string {
  if (!date) return ''
  try {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return date
  }
}

type Props = {
  candidates: CandidateRow[]
}

export function SelectableCandidateList({ candidates }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allSelected =
    candidates.length > 0 && candidates.every((c) => selectedIds.has(c.id))

  const someSelected = !allSelected && candidates.some((c) => selectedIds.has(c.id))

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)))
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  return (
    <>
      {/* ── Desktop / tablet table (≥768 px) ─────────────────────────── */}
      <div className="hidden md:block bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-input)]">
              {/* Bulk-select all checkbox */}
              <th className="w-10 px-4 py-3" aria-label="Select all candidates">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg-input)] text-blue-600 cursor-pointer
                             focus:ring-blue-500 focus:ring-offset-[var(--color-bg-elevated)]"
                  aria-label={allSelected ? 'Deselect all candidates' : 'Select all candidates'}
                  title={allSelected ? 'Deselect all' : 'Select all'}
                />
              </th>
              <th className="text-left px-5 py-3 font-medium text-[var(--color-fg-muted)]">Name</th>
              <th className="text-left px-5 py-3 font-medium text-[var(--color-fg-muted)]">Email</th>
              <th className="text-left px-5 py-3 font-medium text-[var(--color-fg-muted)] hidden sm:table-cell">
                Agency
              </th>
              <th className="text-left px-5 py-3 font-medium text-[var(--color-fg-muted)] hidden lg:table-cell">
                Rate/day
              </th>
              <th className="text-left px-5 py-3 font-medium text-[var(--color-fg-muted)] hidden md:table-cell">
                Status
              </th>
              <th className="text-left px-5 py-3 font-medium text-[var(--color-fg-muted)] hidden lg:table-cell">
                Added
              </th>
              <th className="w-10 px-4 py-3" aria-label="CV download" />
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const isSelected = selectedIds.has(c.id)
              return (
                <tr
                  key={c.id}
                  className={`border-b border-[var(--color-border)] transition-colors last:border-0
                              ${isSelected ? 'bg-[var(--color-bg-input)]' : 'hover:bg-[var(--color-bg-input)]'}`}
                >
                  {/* Bulk-select checkbox */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(c.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg-input)] text-blue-600 cursor-pointer
                                 focus:ring-blue-500 focus:ring-offset-[var(--color-bg-elevated)]"
                      aria-label={`Select ${c.firstName} ${c.lastName}`}
                      title={isSelected ? 'Deselect candidate' : 'Select candidate'}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/candidates/${c.id}`}
                        className="font-medium text-[var(--color-fg)] hover:text-blue-400 transition-colors"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                      {c.availabilityStatus === 'on_project' && (
                        <span
                          className="inline-flex items-center rounded-full bg-[var(--color-status-offered-bg)]
                                     text-[var(--color-status-offered-fg)] text-xs font-medium px-2 py-0.5"
                          title="On project"
                        >
                          {c.availableFrom
                            ? `On project until ${formatAvailableFrom(c.availableFrom)}`
                            : 'On project'}
                        </span>
                      )}
                      {c.availabilityStatus === 'unavailable' && (
                        <span
                          className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)]
                                     text-[var(--color-fg)] text-xs font-medium px-2 py-0.5"
                        >
                          Unavailable
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-fg-subtle)] truncate md:max-w-[200px]">
                    {c.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    {c.isInternalAgency ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-status-shortlisted-bg)]
                                   text-[var(--color-status-shortlisted-fg)] text-xs font-medium px-2 py-0.5"
                      >
                        <HomeIcon className="h-3 w-3" />
                        Internal
                      </span>
                    ) : c.agencyId ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-fg-subtle)]">
                        {c.agencyLogoPath ? (
                          <img
                            src={`/api/agencies/${c.agencyId}/logo`}
                            alt=""
                            width={20}
                            height={20}
                            style={{ width: 20, height: 20 }}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] object-contain shrink-0"
                          />
                        ) : (
                          <div
                            className="flex items-center justify-center rounded-full bg-[var(--color-bg-input)]
                                       text-[var(--color-fg-muted)] text-xs font-semibold shrink-0"
                            style={{ width: 20, height: 20 }}
                            aria-hidden="true"
                          >
                            {c.agencyName?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                        )}
                        {c.agencyName ?? '—'}
                      </span>
                    ) : (
                      <span className="text-[var(--color-fg-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--color-fg-muted)] hidden lg:table-cell tabular-nums text-sm">
                    {c.candidateRate
                      ? `${c.rateCurrency ?? ''} ${Number(c.candidateRate).toFixed(0)}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize
                                  ${STATUS_BADGE[c.status] ?? 'bg-[var(--color-status-new-bg)] text-[var(--color-status-new-fg)]'}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-fg-subtle)] hidden lg:table-cell tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <ComparisonCheckbox
                        candidateId={c.id}
                        candidateName={`${c.firstName} ${c.lastName}`}
                      />
                      {c.filePath && (
                        <a
                          href={`/api/candidates/${c.id}/cv`}
                          download
                          title="Download original CV"
                          className="rounded p-2 md:p-1 text-[var(--color-fg-subtle)] hover:text-blue-400 hover:bg-blue-950
                                     transition-colors inline-flex"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile / small-tablet card stack (<768 px) ──────────────── */}
      <div className="md:hidden space-y-2">
        {/* Select-all header row */}
        <label className="flex items-center gap-3 px-1 py-1 cursor-pointer select-none">
          <span className="inline-flex items-center justify-center p-3 -m-3">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg-input)] text-blue-600 cursor-pointer
                         focus:ring-blue-500 focus:ring-offset-[var(--color-bg-elevated)]"
              aria-label={allSelected ? 'Deselect all candidates' : 'Select all candidates'}
            />
          </span>
          <span className="text-xs text-[var(--color-fg-muted)]">
            {allSelected ? 'Deselect all' : 'Select all'}
          </span>
        </label>

        {candidates.map((c) => {
          const isSelected = selectedIds.has(c.id)
          return (
            <div
              key={c.id}
              className={`bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-border)] p-4
                          transition-colors
                          ${isSelected ? 'border-blue-500/40 bg-[var(--color-bg-input)]' : ''}`}
            >
              {/* Row 1: checkbox + name + status */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Checkbox with ≥44×44px tap target via negative margin expansion */}
                <label
                  className="inline-flex items-center justify-center p-3 -m-3 shrink-0 cursor-pointer"
                  aria-label={`Select ${c.firstName} ${c.lastName}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(c.id)}
                    className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg-input)] text-blue-600 cursor-pointer
                               focus:ring-blue-500 focus:ring-offset-[var(--color-bg-elevated)]"
                    aria-label={`Select ${c.firstName} ${c.lastName}`}
                  />
                </label>

                <Link
                  href={`/dashboard/candidates/${c.id}`}
                  className="font-medium text-[var(--color-fg)] hover:text-blue-400 transition-colors truncate flex-1 min-w-0"
                >
                  {c.firstName} {c.lastName}
                </Link>

                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize shrink-0
                              ${STATUS_BADGE[c.status] ?? 'bg-[var(--color-status-new-bg)] text-[var(--color-status-new-fg)]'}`}
                >
                  {c.status}
                </span>
              </div>

              {/* Row 2: agency + availability badge */}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-fg-subtle)] pl-1 flex-wrap">
                {c.isInternalAgency ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-status-shortlisted-bg)]
                               text-[var(--color-status-shortlisted-fg)] text-xs font-medium px-2 py-0.5"
                  >
                    <HomeIcon className="h-3 w-3" />
                    Internal
                  </span>
                ) : c.agencyId ? (
                  <span className="inline-flex items-center gap-1.5">
                    <AgencyLogo
                      agencyId={c.agencyId}
                      agencyLogoPath={c.agencyLogoPath}
                      agencyName={c.agencyName}
                    />
                    <span>{c.agencyName ?? '—'}</span>
                  </span>
                ) : null}

                {c.availabilityStatus === 'on_project' && (
                  <span
                    className="inline-flex items-center rounded-full bg-[var(--color-status-offered-bg)]
                               text-[var(--color-status-offered-fg)] text-xs font-medium px-2 py-0.5"
                  >
                    {c.availableFrom
                      ? `On project until ${formatAvailableFrom(c.availableFrom)}`
                      : 'On project'}
                  </span>
                )}
                {c.availabilityStatus === 'unavailable' && (
                  <span
                    className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)]
                               text-[var(--color-fg)] text-xs font-medium px-2 py-0.5"
                  >
                    Unavailable
                  </span>
                )}

                {c.email && (
                  <span className="text-[var(--color-fg-subtle)] truncate max-w-[180px]">
                    · {c.email}
                  </span>
                )}
              </div>

              {/* Row 3: rate (left) + actions (right) */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--color-fg-muted)] tabular-nums">
                  {c.candidateRate
                    ? `${c.rateCurrency ?? ''} ${Number(c.candidateRate).toFixed(0)}/day`
                    : <span className="text-[var(--color-fg-subtle)]">{new Date(c.createdAt).toLocaleDateString('en-GB')}</span>}
                </span>

                {/* Actions — each ≥44×44px via h-11 w-11 */}
                <div className="flex items-center gap-1">
                  {/* ComparisonCheckbox has its own h-7 w-7; wrap in a larger hit area */}
                  <span className="inline-flex items-center justify-center h-11 w-11">
                    <ComparisonCheckbox
                      candidateId={c.id}
                      candidateName={`${c.firstName} ${c.lastName}`}
                    />
                  </span>

                  {c.filePath && (
                    <a
                      href={`/api/candidates/${c.id}/cv`}
                      download
                      title="Download original CV"
                      aria-label={`Download CV for ${c.firstName} ${c.lastName}`}
                      className="h-11 w-11 rounded inline-flex items-center justify-center
                                 text-[var(--color-fg-subtle)] hover:text-blue-400 hover:bg-blue-950
                                 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulk action bar — appears when 1+ candidates are selected */}
      <BulkStatusBar
        selectedIds={[...selectedIds]}
        onClear={clearSelection}
      />
    </>
  )
}
