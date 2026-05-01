import { UserIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { UpdateProfileForm } from '@/components/profile/update-profile-form'
import { ChangePasswordForm } from '@/components/profile/change-password-form'

export default async function ProfilePage() {
  const session = await auth()
  const userName = session?.user.name ?? ''

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-[var(--color-bg-input)] rounded-lg">
          <UserIcon className="h-5 w-5 text-[var(--color-fg-muted)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-fg)]">Profile</h1>
          <p className="text-sm text-[var(--color-fg-subtle)]">Manage your account details</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Profile section */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-4">
            Profile
          </h2>
          <UpdateProfileForm currentName={userName} />
        </div>

        {/* Change password section */}
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide mb-4">
            Change Password
          </h2>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  )
}
