'use client'

import { useActionState, useState } from 'react'
import { EyeIcon, EyeOffIcon, Loader2Icon, UserPlusIcon } from 'lucide-react'
import { createUserDirect } from '@/actions/users'

type FormState = {
  ok: boolean
  error?: string
}

const initialState: FormState = { ok: false, error: undefined }

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, fd) => {
      const result = await createUserDirect(fd)
      return result.ok
        ? { ok: true, error: undefined }
        : { ok: false, error: result.error }
    },
    initialState,
  )

  const [showPassword, setShowPassword] = useState(false)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="create-user-email" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
          Email
        </label>
        <input
          id="create-user-email"
          type="email"
          name="email"
          disabled={pending}
          required
          autoComplete="off"
          maxLength={255}
          className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="create-user-name" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
          Full name
        </label>
        <input
          id="create-user-name"
          type="text"
          name="name"
          disabled={pending}
          required
          autoComplete="off"
          maxLength={100}
          className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="create-user-role" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
          Role
        </label>
        <select
          id="create-user-role"
          name="role"
          defaultValue="recruiter"
          disabled={pending}
          required
          className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        >
          <option value="admin">Admin</option>
          <option value="recruiter">Recruiter</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      <div>
        <label htmlFor="create-user-temp-password" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
          Temporary password
        </label>
        <div className="relative">
          <input
            id="create-user-temp-password"
            type={showPassword ? 'text' : 'password'}
            name="tempPassword"
            disabled={pending}
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                       pl-3 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                       disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--color-fg-muted)]
                       hover:text-[var(--color-fg)] transition-colors"
          >
            {showPassword ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-[var(--color-fg-subtle)] mt-1.5">
          Minimum 12 characters. The user will be required to change this on first sign-in.
        </p>
      </div>

      {state.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-xs text-emerald-400">User created successfully.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white
                   text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserPlusIcon className="h-3.5 w-3.5" />
        )}
        Create user
      </button>
    </form>
  )
}
