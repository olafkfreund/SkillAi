'use client'

import { MenuIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { InstallPrompt } from '@/components/pwa/install-prompt'

type Props = {
  /** Called when the hamburger button is tapped — opens the mobile drawer. */
  onMenuClick: () => void
  /** Optional page title shown in the centre-left of the bar. */
  title?: string
}

/**
 * Sticky top app bar rendered only on mobile/tablet (<lg).
 * On desktop (≥1024px) it is hidden via `lg:hidden` so the desktop sidebar
 * layout is byte-identical to what it was before this component was added.
 *
 * Usage:
 *   <TopAppBar onMenuClick={() => setDrawerOpen(true)} title="Dashboard" />
 */
export function TopAppBar({ onMenuClick, title }: Props) {
  return (
    <header
      className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-3 h-14
                 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]"
    >
      {/* Hamburger — min 44×44px tap target */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        className="flex items-center justify-center h-11 w-11 rounded-md
                   text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                   hover:bg-[var(--color-bg-input)] transition-colors flex-shrink-0"
      >
        <MenuIcon className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Page title */}
      {title ? (
        <span className="flex-1 text-sm font-semibold text-[var(--color-fg)] truncate">
          {title}
        </span>
      ) : (
        /* Brand fallback when no title is provided */
        <span className="flex-1 text-sm font-bold text-[var(--color-fg)]">SkillAI</span>
      )}

      {/* Right side: install prompt (when eligible) + theme toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <InstallPrompt />
        <ThemeToggle />
      </div>
    </header>
  )
}
