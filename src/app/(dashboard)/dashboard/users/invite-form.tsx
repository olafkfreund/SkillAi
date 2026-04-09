'use client'

import { useActionState } from 'react'
import { createInvitation } from '@/actions/invitations'
import type { InvitationState } from '@/actions/invitations'

const initialState: InvitationState = { success: false }

export function InviteForm() {
  const [state, formAction, isPending] = useActionState(createInvitation, initialState)

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-6">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
        Invite User
      </h2>

      <form action={formAction} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Email (optional) */}
          <div className="flex-1">
            <label htmlFor="invite-email" className="block text-sm font-medium text-zinc-400 mb-1.5">
              Email <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm
                         text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2
                         focus:ring-blue-600 focus:border-transparent"
              placeholder="colleague@company.com"
            />
            {state.fieldErrors?.email && (
              <p className="mt-1 text-xs text-red-400">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          {/* Role */}
          <div className="sm:w-40">
            <label htmlFor="invite-role" className="block text-sm font-medium text-zinc-400 mb-1.5">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue="recruiter"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm
                         text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600
                         focus:border-transparent"
            >
              <option value="viewer">Viewer</option>
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Submit */}
          <div className="sm:w-auto sm:self-end">
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium
                         text-white hover:bg-blue-500 transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? 'Generating…' : 'Generate invite link'}
            </button>
          </div>
        </div>

        {state.error && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
            {state.error}
          </div>
        )}

        {state.success && state.inviteUrl && (
          <InviteUrlDisplay url={state.inviteUrl} />
        )}
      </form>
    </div>
  )
}

function InviteUrlDisplay({ url }: { url: string }) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
  }

  return (
    <div className="rounded-lg bg-green-950 border border-green-800 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-green-400">
        Invitation link generated — share it with the new user. It expires in 7 days.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-green-300 bg-green-900/50 rounded px-2 py-1.5 truncate block">
          {url}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 rounded px-3 py-1.5 text-xs font-medium bg-green-800 text-green-200
                     hover:bg-green-700 transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  )
}
