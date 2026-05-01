import { db } from '@/db'
import { userInvitations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { AcceptInviteForm } from './accept-invite-form'
import Link from 'next/link'

export const metadata = { title: 'Accept Invitation — SkillAI' }

type Props = {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  // Look up invitation to pre-populate email and validate upfront
  const [invitation] = await db
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.token, token))
    .limit(1)

  const isExpired = !invitation || invitation.expiresAt < new Date()
  const isUsed = !!invitation?.usedAt

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-bg-app)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">SkillAI</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-subtle)]">Internal recruiting portal</p>
        </div>

        <div className="bg-[var(--color-bg-elevated)] rounded-xl shadow-sm border border-[var(--color-border)] p-8">
          <h2 className="text-lg font-semibold text-[var(--color-fg)] mb-1">Create your account</h2>
          <p className="text-sm text-[var(--color-fg-subtle)] mb-6">
            You have been invited to join SkillAI.
          </p>

          {isUsed ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
                This invitation has already been used.
              </div>
              <Link
                href="/login"
                className="block text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Sign in to your account
              </Link>
            </div>
          ) : isExpired ? (
            <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
              This invitation link has expired. Please ask your admin to send a new invitation.
            </div>
          ) : (
            <AcceptInviteForm
              token={token}
              prefilledEmail={invitation?.email ?? ''}
            />
          )}
        </div>
      </div>
    </main>
  )
}
