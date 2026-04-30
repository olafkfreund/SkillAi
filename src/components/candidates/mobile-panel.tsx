'use client'

import { ChevronDownIcon } from 'lucide-react'

type Props = {
  title: string
  /**
   * Whether the panel is expanded on mount.
   * Defaults to true — mobile users expect to see content immediately
   * rather than having to tap every section open.
   */
  defaultOpen?: boolean
  /**
   * Must be a SINGLE child component instance.
   *
   * At md:+ both this <details> and the inner <div> have `display: contents`,
   * which removes them from the layout box model entirely. Their children
   * flow directly into the parent grid/flex context as if the wrapper were
   * not there at all. If you pass multiple siblings as children they will
   * each claim a grid track, breaking the parent's expected column layout.
   */
  children: React.ReactNode
}

/**
 * Collapsible panel for mobile, invisible wrapper for desktop.
 *
 * Below md: renders as a themed <details> / <summary> accordion.
 * At md+:   `display: contents` on both the <details> and inner <div>
 *           removes the wrapper from the layout entirely — the single child
 *           flows straight into whatever grid or flex context the parent uses,
 *           keeping desktop layout byte-identical to a plain unwrapped render.
 */
export function MobilePanel({ title, defaultOpen = true, children }: Props) {
  return (
    <details
      open={defaultOpen}
      // md:contents — the element has no layout box at md+; only its children
      // participate in the parent layout. This is the mechanism that makes the
      // wrapper invisible to desktop grid/flex parents.
      className="group md:contents bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] md:bg-transparent md:rounded-none md:border-0"
    >
      {/* md:hidden — belt + braces alongside md:contents; summary never renders
          a click target on desktop regardless of how the browser handles
          display:contents on a <details> element. */}
      <summary className="md:hidden flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none select-none">
        <span className="text-sm font-semibold text-[var(--color-fg)]">{title}</span>
        <ChevronDownIcon
          className="h-4 w-4 text-[var(--color-fg-muted)] transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {/* md:contents mirrors the outer element — removes this div from layout
          at md+ so the single child component lands directly in the parent context. */}
      <div className="md:contents px-4 pb-4 md:p-0">
        {children}
      </div>
    </details>
  )
}
