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
        <div className="p-2 bg-zinc-800 rounded-lg">
          <UserIcon className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Profile</h1>
          <p className="text-sm text-zinc-500">Manage your account details</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Profile section */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
            Profile
          </h2>
          <UpdateProfileForm currentName={userName} />
        </div>

        {/* Change password section */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
            Change Password
          </h2>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  )
}
