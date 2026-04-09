'use client'

import { useActionState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { changePassword } from '@/actions/users'
import type { PasswordState } from '@/actions/users'

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState | null, FormData>(
    changePassword,
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className="block text-xs font-medium text-zinc-400 mb-1.5">
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          name="currentPassword"
          disabled={pending}
          required
          autoComplete="current-password"
          className="w-full text-sm rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        />
        {state?.fieldErrors?.currentPassword && (
          <p className="text-xs text-red-400 mt-1">{state.fieldErrors.currentPassword[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-xs font-medium text-zinc-400 mb-1.5">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          name="newPassword"
          disabled={pending}
          required
          autoComplete="new-password"
          className="w-full text-sm rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        />
        {state?.fieldErrors?.newPassword && (
          <p className="text-xs text-red-400 mt-1">{state.fieldErrors.newPassword[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-medium text-zinc-400 mb-1.5">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          type="password"
          name="confirmPassword"
          disabled={pending}
          required
          autoComplete="new-password"
          className="w-full text-sm rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        />
        {state?.fieldErrors?.confirmPassword && (
          <p className="text-xs text-red-400 mt-1">{state.fieldErrors.confirmPassword[0]}</p>
        )}
      </div>

      {state && !state.success && state.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-emerald-400">Password changed successfully.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white
                   text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
        Change password
      </button>
    </form>
  )
}
