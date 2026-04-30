'use client'

import { useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LogOutIcon } from 'lucide-react'
import type { UserRole } from '@/lib/auth/types'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { NAV_ITEMS, ROLE_RANK } from '@/components/layout/sidebar'

type Props = {
  /** Whether the drawer is currently open. */
  open: boolean
  /** Called when the user requests the drawer to close (scrim click, Escape). */
  onClose: () => void
  /** Current user's role — used to filter nav items identically to the desktop sidebar. */
  userRole: UserRole
  /** Current user's display name. */
  userName?: string
}

/**
 * Slide-in navigation drawer for mobile / tablet (<lg).
 *
 * Behaviour:
 * - Renders always (CSS-driven slide, no mount/unmount flash).
 * - Closed state: `-translate-x-full` (off-screen to the left).
 * - Open state: `translate-x-0` (fully visible).
 * - Semi-transparent scrim covers the rest of the screen.
 * - Clicking the scrim or pressing Escape calls `onClose`.
 * - Focus is trapped inside the drawer while open (WCAG 2.1 §2.1.2).
 * - On desktop (≥1024px) the entire component is hidden via `lg:hidden` so
 *   desktop layout is byte-identical to pre-mobile work.
 *
 * Usage:
 *   <MobileDrawer
 *     open={drawerOpen}
 *     onClose={() => setDrawerOpen(false)}
 *     userRole={session.user.role}
 *     userName={session.user.name ?? ''}
 *   />
 */
export function MobileDrawer({ open, onClose, userRole, userName }: Props) {
  const pathname = usePathname()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Role-gated nav items — same logic as the desktop Sidebar.
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      ROLE_RANK[userRole] >= ROLE_RANK[item.minRole] &&
      !(item.hideForRoles?.includes(userRole))
  )

  // ── Focus trap ──────────────────────────────────────────────────────────────
  // When the drawer opens, move focus to the first focusable element inside it.
  // Tab/Shift+Tab cycles within the drawer; nothing leaks to the page behind.

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!drawerRef.current) return []
    return Array.from(
      drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
  }, [])

  useEffect(() => {
    if (!open) return

    // Focus first element once the transition starts.
    const frame = requestAnimationFrame(() => {
      const focusable = getFocusableElements()
      focusable[0]?.focus()
    })

    return () => cancelAnimationFrame(frame)
  }, [open, getFocusableElements])

  // Trap Tab key inside the drawer.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = getFocusableElements()
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [getFocusableElements, onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  // Prevent body scroll while drawer is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    // Outer wrapper hidden on desktop — desktop layout unchanged.
    <div className="lg:hidden" aria-hidden={!open}>
      {/* ── Scrim ─────────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300
                    ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Drawer ────────────────────────────────────────────────────────── */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col
                    bg-[var(--color-bg-elevated)] border-r border-[var(--color-border)]
                    transition-transform duration-300 ease-in-out will-change-transform
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* ── Brand header ──────────────────────────────────────────────── */}
        <div className="px-5 py-5 border-b border-[var(--color-border)] flex-shrink-0">
          <span className="text-lg font-bold text-[var(--color-fg)]">SkillAI</span>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">Recruiting portal</p>
        </div>

        {/* ── Nav items ─────────────────────────────────────────────────── */}
        {/* py-3 px-4 ensures each item meets the 44×44px minimum tap target */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
                onClick={onClose}
                className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors
                  ${
                    active
                      ? 'bg-blue-950 text-blue-300'
                      : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-input)] hover:text-[var(--color-fg)]'
                  }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* ── Footer: user, theme toggle, sign out ─────────────────────── */}
        <div className="px-3 py-4 border-t border-[var(--color-border)] flex-shrink-0 space-y-1">
          {userName && (
            <div className="px-4 pb-2">
              <Link
                href="/dashboard/profile"
                onClick={onClose}
                className="text-sm font-medium text-[var(--color-fg)] truncate hover:text-blue-300
                           transition-colors block"
              >
                {userName}
              </Link>
              <p className="text-xs text-[var(--color-fg-subtle)] capitalize">{userRole}</p>
            </div>
          )}

          {/* ThemeToggle — rendered full-width as in the desktop sidebar */}
          <ThemeToggle />

          {/* Sign out — py-3 for ≥44px tap target */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm
                       text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-input)]
                       hover:text-[var(--color-fg)] transition-colors"
          >
            <LogOutIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
