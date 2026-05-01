'use client'

import { useTransition } from 'react'
import { ExternalLinkIcon, CheckIcon, XIcon } from 'lucide-react'
import { ConfidencePill } from './confidence-pill'

/**
 * VerifiedProfileChip — renders a single discovered/confirmed external
 * profile (LinkedIn, GitHub, …) for a candidate. Combines:
 *   - source label + truncated URL (opens in new tab)
 *   - <ConfidencePill /> for the match score
 *   - Optional Confirm action (only visible when an auto-discovered medium
 *     match still needs human review, i.e. canEdit && showConfirm)
 *   - Optional Dismiss action (canEdit && onDismiss provided)
 *
 * Async callbacks are wrapped in useTransition; both buttons disable while
 * the transition is pending.
 */

export interface VerifiedProfileChipProps {
  source: 'linkedin' | 'github' | 'stack_overflow' | 'devto' | 'medium' | 'personal' | 'web'
  url: string
  /** 0–100 confidence score. */
  confidence: number
  category: 'high' | 'medium' | 'low' | 'not_match'
  canEdit: boolean
  /** True when category=='medium' and verifiedBy=='auto' — recruiter sign-off needed. */
  showConfirm?: boolean
  onConfirm?: () => Promise<void> | void
  onDismiss?: () => Promise<void> | void
}

const SOURCE_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  stack_overflow: 'Stack Overflow',
  devto: 'Dev.to',
  medium: 'Medium',
  personal: 'Personal site',
  web: 'Web',
}

export function VerifiedProfileChip({
  source,
  url,
  confidence,
  canEdit,
  showConfirm,
  onConfirm,
  onDismiss,
}: VerifiedProfileChipProps) {
  const [isPending, startTransition] = useTransition()

  // Display the URL host + path; trim querystring + trailing slash for readability.
  const displayUrl = (() => {
    try {
      const u = new URL(url)
      return u.hostname + u.pathname.replace(/\/$/, '')
    } catch {
      return url
    }
  })()

  const handle = (action?: () => Promise<void> | void) => () => {
    if (!action) return
    startTransition(async () => {
      await action()
    })
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1.5 text-sm">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[var(--color-fg)] hover:text-[var(--color-fg)] truncate"
        title={url}
      >
        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          <span className="text-[var(--color-fg-muted)]">{SOURCE_LABEL[source] ?? source}:</span> {displayUrl}
        </span>
      </a>

      <ConfidencePill score={confidence} />

      {canEdit && showConfirm && onConfirm && (
        <button
          type="button"
          onClick={handle(onConfirm)}
          disabled={isPending}
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-1.5 py-0.5 text-xs text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-50"
          aria-label="Confirm this profile"
        >
          <CheckIcon className="h-3 w-3" />
        </button>
      )}

      {canEdit && onDismiss && (
        <button
          type="button"
          onClick={handle(onDismiss)}
          disabled={isPending}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-50"
          aria-label="Dismiss this profile"
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
