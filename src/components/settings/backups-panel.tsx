/**
 * BackupsPanel — admin-only "Backups & Data Export" card on the settings page.
 *
 * Shows the timestamp of the most recent manual tenant export (from audit_logs)
 * and a download link that triggers /api/export/tenant.
 *
 * This is a Server Component — no client-side state needed.
 */

// No 'use client' — runs on the server

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
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-base font-medium text-[var(--color-fg)] mb-1">
        Backups &amp; Data Export
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)] mb-4">
        Download a snapshot of all data for your tenant. Includes JSON for every
        table; file binaries (CVs, logos) are not included in this version.{' '}
        <a
          className="underline"
          href="/dashboard/help/settings-backups-data-export"
        >
          See the help article
        </a>
        .
      </p>
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
          href="/api/export/tenant"
          download
          className="inline-flex items-center px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium whitespace-nowrap"
        >
          Download tenant export now
        </a>
      </div>
    </div>
  )
}
