'use client'

import { useState } from 'react'
import { RoleCandidateCard } from './role-candidate-card'
import { StaleScorePill } from './priority-keywords-panel'
import { ApprovalControls } from '@/components/manager/approval-controls'
import { BulkStatusBar } from '@/components/candidates/bulk-status-bar'
import { removeCandidateFromRole, rescoreCandidate } from '@/actions/scores'

export type RoleCandidateRow = {
  scoreId: string
  candidateId: string
  firstName: string
  lastName: string
  email: string | null
  filePath: string | null
  scoreStatus: string
  overallScore: number | null
  technicalScore: number | null
  experienceScore: number | null
  culturalFitScore: number | null
  communicationScore: number | null
  candidateRate: string | null
  candidateCurrency: string | null
  agencyId: string | null
  agencyName: string | null
  agencyLogoPath: string | null
  agencyIsInternal: boolean | null
  isStale: boolean
  isSubmitted: boolean
  approval: { decision: 'pending' | 'approved' | 'rejected'; comment: string | null } | null
}

type Props = {
  roleId: string
  roleDayRate: string | null
  roleCurrency: string | null
  canEdit: boolean
  isHiringManager: boolean
  audience: 'recruiter' | 'customer' | 'manager'
  candidates: RoleCandidateRow[]
}

export function SelectableRoleCandidateList({
  roleId,
  roleDayRate,
  roleCurrency,
  canEdit,
  isHiringManager,
  audience,
  candidates,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const showCheckboxes = canEdit && !isHiringManager

  return (
    <>
      <div className="grid gap-2">
        {candidates.map((c) => (
          <div key={c.scoreId} className="space-y-1">
            <div className="flex items-center gap-2">
              {showCheckboxes && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.candidateId)}
                  onChange={() => toggleOne(c.candidateId)}
                  className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg-input)] text-blue-600
                             cursor-pointer focus:ring-blue-500 flex-shrink-0"
                  aria-label={`Select ${c.firstName} ${c.lastName}`}
                  title={selectedIds.has(c.candidateId) ? 'Deselect candidate' : 'Select candidate'}
                />
              )}
              <div className="flex-1 min-w-0">
                <RoleCandidateCard
                  scoreId={c.scoreId}
                  roleId={roleId}
                  candidateId={c.candidateId}
                  firstName={c.firstName}
                  lastName={c.lastName}
                  email={c.email}
                  scoreStatus={c.scoreStatus}
                  overallScore={c.overallScore}
                  technicalScore={c.technicalScore}
                  experienceScore={c.experienceScore}
                  culturalFitScore={c.culturalFitScore}
                  communicationScore={c.communicationScore}
                  filePath={c.filePath ?? null}
                  roleDayRate={roleDayRate}
                  roleCurrency={roleCurrency}
                  candidateRate={c.candidateRate}
                  candidateCurrency={c.candidateCurrency}
                  isInternal={Boolean(c.agencyIsInternal)}
                  isSubmitted={c.isSubmitted}
                  agencyId={c.agencyId ?? undefined}
                  agencyName={c.agencyName ?? null}
                  agencyLogoPath={c.agencyLogoPath ?? null}
                  canEdit={canEdit}
                  audience={audience}
                  removeAction={removeCandidateFromRole}
                />
              </div>
            </div>

            {isHiringManager && (
              <div className="pl-6">
                <ApprovalControls
                  roleId={roleId}
                  candidateId={c.candidateId}
                  currentDecision={c.approval?.decision ?? 'pending'}
                  currentComment={c.approval?.comment ?? null}
                />
              </div>
            )}

            {c.isStale && canEdit && (
              <div className="flex justify-end pr-2">
                <StaleScorePill
                  candidateId={c.candidateId}
                  roleId={roleId}
                  rescoreAction={rescoreCandidate}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bulk action bar — only for recruiter view with selections */}
      {showCheckboxes && (
        <BulkStatusBar
          selectedIds={[...selectedIds]}
          onClear={clearSelection}
          roleId={roleId}
        />
      )}
    </>
  )
}
