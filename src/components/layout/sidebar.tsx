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
  ShieldCheckIcon,
  ListChecksIcon,
  HelpCircleIcon,
  BarChart3Icon,
} from 'lucide-react'
import type { UserRole } from '@/lib/auth/types'
import { ThemeToggle } from '@/components/theme/theme-toggle'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  minRole: UserRole
  // If set, the item is hidden when the viewing user has one of these roles,
  // even if their rank would otherwise grant access. Used to keep the manager
  // (client-stakeholder) view focused on assigned shortlists rather than the
  // full recruiter workspace.
  hideForRoles?: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: BriefcaseIcon, minRole: 'viewer' },
  {
    href: '/dashboard/roles',
    label: 'Roles',
    icon: BriefcaseIcon,
    minRole: 'viewer',
    hideForRoles: ['hiring_manager'],
  },
  {
    href: '/dashboard/candidates',
    label: 'Candidates',
    icon: UsersIcon,
    minRole: 'viewer',
    hideForRoles: ['hiring_manager'],
  },
  {
    href: '/dashboard/manager',
    label: 'My Shortlists',
    icon: ListChecksIcon,
    minRole: 'hiring_manager',
    // Recruiters have /dashboard/roles instead — hide the manager landing
    // from them to keep the IA clean. Admins keep visibility for support.
    hideForRoles: ['recruiter'],
  },
  { href: '/dashboard/customers', label: 'Customers', icon: BuildingIcon, minRole: 'recruiter' },
  { href: '/dashboard/agencies', label: 'Agencies', icon: BuildingIcon, minRole: 'recruiter' },
  { href: '/dashboard/users', label: 'Users', icon: UserCogIcon, minRole: 'admin' },
  { href: '/dashboard/audit', label: 'Audit Log', icon: ShieldCheckIcon, minRole: 'admin' },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3Icon, minRole: 'admin' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, minRole: 'admin' },
  { href: '/dashboard/help', label: 'Help', icon: HelpCircleIcon, minRole: 'viewer' },
]

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  hiring_manager: 0.5,
  recruiter: 1,
  admin: 2,
}

type Props = {
  role: UserRole
  userName: string
}

export function Sidebar({ role, userName }: Props) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      ROLE_RANK[role] >= ROLE_RANK[item.minRole] &&
      !(item.hideForRoles?.includes(role))
  )

  return (
    <aside className="w-56 flex-shrink-0 bg-[var(--color-bg-elevated)] border-r border-[var(--color-border)] flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--color-border)]">
        <span className="text-lg font-bold text-[var(--color-fg)]">SkillAI</span>
        <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">Recruiting portal</p>
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
                    : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-input)] hover:text-[var(--color-fg)]'
                }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-[var(--color-border)]">
        <div className="px-3 mb-2">
          <Link
            href="/dashboard/profile"
            className="text-sm font-medium text-[var(--color-fg)] truncate hover:text-blue-300 transition-colors block"
          >
            {userName}
          </Link>
          <p className="text-xs text-[var(--color-fg-subtle)] capitalize">{role}</p>
        </div>
        <ThemeToggle />
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--color-fg-muted)]
                     hover:bg-[var(--color-bg-input)] hover:text-[var(--color-fg)] transition-colors"
        >
          <LogOutIcon className="h-4 w-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
