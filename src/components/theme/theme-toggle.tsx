'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { SunIcon, MoonIcon } from 'lucide-react'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  // Avoid hydration mismatch — only render toggle after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex w-full items-center gap-3 rounded-md px-3 py-2 h-9" aria-hidden="true" />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm
                 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)]
                 hover:text-[var(--color-fg)] transition-colors"
    >
      {isDark ? (
        <SunIcon className="h-4 w-4 flex-shrink-0" />
      ) : (
        <MoonIcon className="h-4 w-4 flex-shrink-0" />
      )}
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
