'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { acceptInvitation } from '@/actions/invitations'
import type { AcceptInvitationState } from '@/actions/invitations'

type Props = {
  token: string
  prefilledEmail: string
}

const initialState: AcceptInvitationState = { success: false }

export function AcceptInviteForm({ token, prefilledEmail }: Props) {
  const [state, formAction, isPending] = useActionState(acceptInvitation, initialState)

  if (state.success) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-950 border border-green-800 px-4 py-3 text-sm text-green-300">
          Account created successfully!
        </div>
        <Link
          href="/login"
          className="block text-center w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium
                     text-white hover:bg-blue-500 transition-colors"
        >
          Sign in to your account
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {state.error}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--color-fg)] mb-1.5">
          Full name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] px-3 py-2.5 text-sm
                     text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2
                     focus:ring-blue-600 focus:border-transparent"
          placeholder="Jane Smith"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-400">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[var(--color-fg)] mb-1.5">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={prefilledEmail}
          readOnly={!!prefilledEmail}
          className={`w-full rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] px-3 py-2.5 text-sm
                     text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2
                     focus:ring-blue-600 focus:border-transparent
                     ${prefilledEmail ? 'opacity-75 cursor-not-allowed' : ''}`}
          placeholder="you@company.com"
        />
        {state.fieldErrors?.email && (
          <p className="mt-1 text-xs text-red-400">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[var(--color-fg)] mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] px-3 py-2.5 text-sm
                     text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2
                     focus:ring-blue-600 focus:border-transparent"
          placeholder="At least 8 characters"
        />
        {state.fieldErrors?.password && (
          <p className="mt-1 text-xs text-red-400">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--color-fg)] mb-1.5">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] px-3 py-2.5 text-sm
                     text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2
                     focus:ring-blue-600 focus:border-transparent"
          placeholder="Repeat your password"
        />
        {state.fieldErrors?.confirmPassword && (
          <p className="mt-1 text-xs text-red-400">{state.fieldErrors.confirmPassword[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white
                   hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
