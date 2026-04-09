'use client'

import { useTransition } from 'react'
import { revokeInvitation } from '@/actions/invitations'

export function RevokeButton({ invitationId }: { invitationId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleRevoke = () => {
    startTransition(async () => {
      await revokeInvitation(invitationId)
    })
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={isPending}
      className="text-xs text-red-400 hover:text-red-300 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? 'Revoking…' : 'Revoke'}
    </button>
  )
}
