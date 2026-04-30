'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, XIcon } from 'lucide-react'
import { approveCandidate, rejectCandidate } from '@/actions/approvals'

type Props = {
  audience: 'recruiter' | 'customer' | 'manager'
  roleId: string | null
  candidateId: string
  currentDecision?: 'approved' | 'rejected' | 'pending' | null
}

export function ManagerMobileActions({
  audience,
  roleId,
  candidateId,
  currentDecision,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Only render for managers with a role context — decision is always per-role
  if (audience !== 'manager' || roleId === null) return null

  function handleApprove() {
    startTransition(async () => {
      await approveCandidate(roleId!, candidateId)
      router.refresh()
    })
  }

  function handleReject() {
    startTransition(async () => {
      await rejectCandidate(roleId!, candidateId)
      router.refresh()
    })
  }

  const isApproved = currentDecision === 'approved'
  const isRejected = currentDecision === 'rejected'

  return (
    <div className="md:hidden mb-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending}
        aria-label="Approve candidate"
        className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-colors
                    min-h-[44px]
                    ${isApproved
                      ? 'bg-emerald-700 text-emerald-100 ring-2 ring-emerald-400'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <CheckIcon className="h-4 w-4 shrink-0" />
        {isApproved ? 'Approved' : 'Approve'}
      </button>

      <button
        type="button"
        onClick={handleReject}
        disabled={isPending}
        aria-label="Reject candidate"
        className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-colors
                    min-h-[44px]
                    ${isRejected
                      ? 'bg-red-700 text-red-100 ring-2 ring-red-400'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <XIcon className="h-4 w-4 shrink-0" />
        {isRejected ? 'Rejected' : 'Reject'}
      </button>
    </div>
  )
}
