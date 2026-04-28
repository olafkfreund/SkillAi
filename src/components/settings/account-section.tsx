import { UserCogIcon } from 'lucide-react'
import { UpdateProfileForm } from '@/components/profile/update-profile-form'
import { ChangePasswordForm } from '@/components/profile/change-password-form'

interface AccountSectionProps {
  currentName: string
}

export function AccountSection({ currentName }: AccountSectionProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <UserCogIcon className="h-4 w-4 text-[var(--color-fg-muted)]" />
        <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
          Account
        </h2>
      </div>

      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-4">
          Profile
        </h3>
        <UpdateProfileForm currentName={currentName} />
      </div>

      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
        <h3
          id="change-password"
          className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-2 scroll-mt-24"
        >
          Change password
        </h3>
        <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
          Passwords must be at least 12 characters long.
        </p>
        <ChangePasswordForm />
      </div>
    </section>
  )
}
