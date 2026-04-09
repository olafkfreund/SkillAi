'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ComparisonCheckbox } from './comparison-checkbox'
import { BulkStatusBar } from './bulk-status-bar'

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-zinc-700 text-zinc-300',
  shortlisted: 'bg-blue-900/50 text-blue-300',
  interviewing: 'bg-purple-900/50 text-purple-300',
  offered: 'bg-amber-900/50 text-amber-300',
  hired: 'bg-green-900/50 text-green-300',
  rejected: 'bg-red-900/50 text-red-300',
}

export type CandidateRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  status: string
  createdAt: string | Date
  agencyName: string | null
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
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-800">
              {/* Bulk-select all checkbox */}
              <th className="w-10 px-4 py-3" aria-label="Select all candidates">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 cursor-pointer
                             focus:ring-blue-500 focus:ring-offset-zinc-900"
                  aria-label={allSelected ? 'Deselect all candidates' : 'Select all candidates'}
                  title={allSelected ? 'Deselect all' : 'Select all'}
                />
              </th>
              {/* Compare checkbox column header — empty, column kept for alignment */}
              <th className="w-10 px-4 py-3" aria-label="Compare" />
              <th className="text-left px-5 py-3 font-medium text-zinc-400">Name</th>
              <th className="text-left px-5 py-3 font-medium text-zinc-400">Email</th>
              <th className="text-left px-5 py-3 font-medium text-zinc-400 hidden sm:table-cell">
                Agency
              </th>
              <th className="text-left px-5 py-3 font-medium text-zinc-400 hidden md:table-cell">
                Status
              </th>
              <th className="text-left px-5 py-3 font-medium text-zinc-400 hidden lg:table-cell">
                Added
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const isSelected = selectedIds.has(c.id)
              return (
                <tr
                  key={c.id}
                  className={`border-b border-zinc-700 transition-colors last:border-0
                              ${isSelected ? 'bg-zinc-800/70' : 'hover:bg-zinc-800'}`}
                >
                  {/* Bulk-select checkbox */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(c.id)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 cursor-pointer
                                 focus:ring-blue-500 focus:ring-offset-zinc-900"
                      aria-label={`Select ${c.firstName} ${c.lastName}`}
                      title={isSelected ? 'Deselect candidate' : 'Select candidate'}
                    />
                  </td>
                  {/* Comparison checkbox */}
                  <td className="px-4 py-3">
                    <ComparisonCheckbox
                      candidateId={c.id}
                      candidateName={`${c.firstName} ${c.lastName}`}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/candidates/${c.id}`}
                      className="font-medium text-zinc-100 hover:text-blue-400 transition-colors"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 truncate max-w-[200px]">
                    {c.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-zinc-500 hidden sm:table-cell">
                    {c.agencyName ?? '—'}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize
                                  ${STATUS_BADGE[c.status] ?? 'bg-zinc-700 text-zinc-300'}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 hidden lg:table-cell tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar — appears when 1+ candidates are selected */}
      <BulkStatusBar
        selectedIds={[...selectedIds]}
        onClear={clearSelection}
      />
    </>
  )
}
