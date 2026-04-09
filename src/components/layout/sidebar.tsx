'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  BriefcaseIcon,
  UsersIcon,
  BuildingIcon,
  SettingsIcon,
  LogOutIcon,
  UserCogIcon,
} from 'lucide-react'
import type { UserRole } from '@/lib/auth/types'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  minRole: UserRole
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: BriefcaseIcon, minRole: 'viewer' },
  { href: '/dashboard/roles', label: 'Roles', icon: BriefcaseIcon, minRole: 'viewer' },
  { href: '/dashboard/candidates', label: 'Candidates', icon: UsersIcon, minRole: 'viewer' },
  { href: '/dashboard/customers', label: 'Customers', icon: BuildingIcon, minRole: 'recruiter' },
  { href: '/dashboard/agencies', label: 'Agencies', icon: BuildingIcon, minRole: 'recruiter' },
  { href: '/dashboard/users', label: 'Users', icon: UserCogIcon, minRole: 'admin' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, minRole: 'admin' },
]

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, recruiter: 1, admin: 2 }

type Props = {
  role: UserRole
  userName: string
}

export function Sidebar({ role, userName }: Props) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter(
    (item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]
  )

  return (
    <aside className="w-56 flex-shrink-0 bg-zinc-900 border-r border-zinc-700 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-700">
        <span className="text-lg font-bold text-zinc-100">SkillAI</span>
        <p className="text-xs text-zinc-500 mt-0.5">Recruiting portal</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                ${
                  active
                    ? 'bg-blue-950 text-blue-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-zinc-700">
        <div className="px-3 mb-2">
          <Link
            href="/dashboard/profile"
            className="text-sm font-medium text-zinc-100 truncate hover:text-blue-300 transition-colors block"
          >
            {userName}
          </Link>
          <p className="text-xs text-zinc-500 capitalize">{role}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400
                     hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          <LogOutIcon className="h-4 w-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
