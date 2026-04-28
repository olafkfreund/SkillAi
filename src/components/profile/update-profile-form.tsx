'use client'

import { useActionState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { updateProfile } from '@/actions/users'
import type { ProfileState } from '@/actions/users'

type Props = {
  currentName: string
}

export function UpdateProfileForm({ currentName }: Props) {
  const [state, formAction, pending] = useActionState<ProfileState | null, FormData>(
    updateProfile,
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
          Name
        </label>
        <input
          id="name"
          type="text"
          name="name"
          defaultValue={currentName}
          maxLength={100}
          disabled={pending}
          required
          className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     placeholder:text-[var(--color-fg-subtle)] disabled:opacity-60"
        />
        {state?.fieldErrors?.name && (
          <p className="text-xs text-red-400 mt-1">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      {state && !state.success && state.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-emerald-400">Profile updated successfully.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white
                   text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
        Save changes
      </button>
    </form>
  )
}
