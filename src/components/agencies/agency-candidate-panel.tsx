'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Download, UserPlusIcon, XIcon } from 'lucide-react'
import { updateCandidateAgency } from '@/actions/candidates'

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string | null
  filePath: string | null
  createdAt: string
}

interface UnassignedCandidate {
  id: string
  firstName: string
  lastName: string
  email: string | null
}

interface Props {
  agencyId: string
  agencyCandidates: Candidate[]
  unassignedCandidates: UnassignedCandidate[]
  canEdit: boolean
}

export function AgencyCandidatePanel({ agencyId, agencyCandidates, unassignedCandidates, canEdit }: Props) {
  const [candidates, setCandidates] = useState(agencyCandidates)
  const [unassigned, setUnassigned] = useState(unassignedCandidates)
  const [selectedId, setSelectedId] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleRemove(candidateId: string) {
    startTransition(async () => {
      const res = await updateCandidateAgency(candidateId, null)
      if (res.success) {
        const removed = candidates.find((c) => c.id === candidateId)
        setCandidates((prev) => prev.filter((c) => c.id !== candidateId))
        if (removed) {
          setUnassigned((prev) =>
            [...prev, { id: removed.id, firstName: removed.firstName, lastName: removed.lastName, email: removed.email }]
              .sort((a, b) => a.firstName.localeCompare(b.firstName))
          )
        }
      }
    })
  }

  function handleAssign() {
    if (!selectedId) return
    startTransition(async () => {
      const res = await updateCandidateAgency(selectedId, agencyId)
      if (res.success) {
        const candidate = unassigned.find((c) => c.id === selectedId)
        setUnassigned((prev) => prev.filter((c) => c.id !== selectedId))
        if (candidate) {
          setCandidates((prev) =>
            [{ ...candidate, filePath: null, createdAt: new Date().toISOString() }, ...prev]
          )
        }
        setSelectedId('')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Candidates ({candidates.length})</h2>
      </div>

      {canEdit && unassigned.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={isPending}
            className="flex-1 rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">— Assign a candidate —</option>
            {unassigned.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}{c.email ? ` · ${c.email}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedId || isPending}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-sm font-medium
                       px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <UserPlusIcon className="h-4 w-4" />
            Assign
          </button>
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 px-6 py-10 text-center">
          <p className="text-zinc-500 text-sm">No candidates from this agency yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-700 px-5 py-3"
            >
              <Link
                href={`/dashboard/candidates/${c.id}`}
                className="flex-1 min-w-0 hover:text-blue-400 transition-colors"
              >
                <span className="text-sm font-medium text-zinc-100">
                  {c.firstName} {c.lastName}
                  {c.email && (
                    <span className="font-normal text-zinc-500 ml-2">{c.email}</span>
                  )}
                </span>
              </Link>
              <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                <time className="text-xs text-zinc-500">
                  {new Date(c.createdAt).toLocaleDateString('en-GB')}
                </time>
                {c.filePath && (
                  <a
                    href={`/api/candidates/${c.id}/cv`}
                    download
                    title="Download original CV"
                    className="rounded p-1 text-zinc-600 hover:text-blue-400 hover:bg-blue-950
                               transition-colors"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(c.id)}
                    disabled={isPending}
                    title="Remove from agency"
                    className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-950
                               disabled:opacity-50 transition-colors"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
