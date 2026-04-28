'use client'

/**
 * BackupsPanel — admin-only "Backups & Data Export" card on the settings page.
 *
 * Shows the timestamp of the most recent manual tenant export (from audit_logs)
 * and a download link that triggers /api/export/tenant.
 *
 * Accepts lastExportAt as a serialisable prop from the parent server component.
 * The "Include file attachments" checkbox controls whether ?files=1 is appended
 * to the download URL.
 */

import { useState } from 'react'

interface BackupsPanelProps {
  lastExportAt: Date | null
}

/**
 * formatRelative — returns a human-readable relative-time string without
 * requiring date-fns (which is not a project dependency).
 *
 * Examples: "a few seconds ago", "4 minutes ago", "2 hours ago", "3 days ago"
 */
function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)

  if (diffSecs < 60) return 'a few seconds ago'

  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`

  const diffYears = Math.floor(diffMonths / 12)
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`
}

export function BackupsPanel({ lastExportAt }: BackupsPanelProps) {
  const [includeFiles, setIncludeFiles] = useState(false)

  const downloadHref = `/api/export/tenant${includeFiles ? '?files=1' : ''}`

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-base font-medium text-[var(--color-fg)] mb-1">
        Backups &amp; Data Export
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)] mb-4">
        Download a snapshot of all data for your tenant. Includes JSON for every
        table. Optionally include binary file attachments (CVs, logos).{' '}
        <a
          className="underline"
          href="/dashboard/help/settings-backups-data-export"
        >
          See the help article
        </a>
        .
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-[var(--color-fg-muted)]">
            Last manual export:{' '}
            <span
              className="text-[var(--color-fg)]"
              title={lastExportAt?.toISOString() ?? 'Never'}
            >
              {lastExportAt ? formatRelative(lastExportAt) : 'Never'}
            </span>
          </div>
          <a
            href={downloadHref}
            download
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium whitespace-nowrap"
          >
            Download tenant export now
          </a>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="include-files"
            checked={includeFiles}
            onChange={(e) => setIncludeFiles(e.target.checked)}
            className="rounded border-[var(--color-border)] bg-[var(--color-bg-input)]"
          />
          <label htmlFor="include-files" className="text-sm text-[var(--color-fg-muted)]">
            Include file attachments (CVs, logos)
            <span className="ml-1 text-xs text-[var(--color-fg-subtle)]">
              — may produce a much larger file
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
