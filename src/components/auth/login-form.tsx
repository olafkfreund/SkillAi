'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

type Props = {
  callbackUrl?: string
  error?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Incorrect email or password.',
  Default: 'Something went wrong. Please try again.',
}

export function LoginForm({ callbackUrl, error }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const errorMsg = error
    ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default)
    : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFieldError(null)
    setPending(true)

    const form = new FormData(e.currentTarget)
    const email = form.get('email') as string
    const password = form.get('password') as string

    if (!email || !password) {
      setFieldError('Email and password are required.')
      setPending(false)
      return
    }

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setFieldError(ERROR_MESSAGES.CredentialsSignin)
      setPending(false)
      return
    }

    router.push(callbackUrl ?? '/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {(errorMsg || fieldError) && (
        <div
          role="alert"
          className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400"
        >
          {fieldError ?? errorMsg}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-zinc-300 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                     placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-zinc-300 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                     placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 rounded-md
                   bg-blue-600 text-white text-sm font-medium py-2.5
                   hover:bg-blue-700 active:bg-blue-800
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
