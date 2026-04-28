import { LoginForm } from '@/components/auth/login-form'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Sign in — SkillAI' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  // Already signed in → go to dashboard
  const session = await auth()
  if (session) redirect('/dashboard')

  const { callbackUrl, error } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-bg-app)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">SkillAI</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-subtle)]">Internal recruiting portal</p>
        </div>

        <div className="bg-[var(--color-bg-elevated)] rounded-xl shadow-sm border border-[var(--color-border)] p-8">
          <h2 className="text-lg font-semibold text-[var(--color-fg)] mb-6">Sign in</h2>
          <LoginForm callbackUrl={callbackUrl} error={error} />
        </div>
      </div>
    </main>
  )
}
