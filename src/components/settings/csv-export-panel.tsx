/**
 * CsvExportPanel — admin-only "Per-Entity CSV Exports" card on the settings page.
 *
 * Renders four download links (one per entity) that hit
 * /api/export/tenant/csv/[entity]. The route enforces admin auth; this
 * component is only rendered inside the admin-gated section of settings/page.tsx.
 *
 * Server component — no client state required.
 */

const ENTITIES = [
  {
    key: 'candidates',
    label: 'Candidates',
    desc: 'All candidate records (CV file paths only — no inline CV text)',
  },
  {
    key: 'roles',
    label: 'Roles',
    desc: 'All open and archived roles (title and metadata — no description or requirements text)',
  },
  {
    key: 'scores',
    label: 'AI Scores',
    desc: 'All scoring runs across roles (numeric scores only — no AI reasoning text)',
  },
  {
    key: 'agencies',
    label: 'Agencies',
    desc: 'All agency contact and status records',
  },
] as const

export function CsvExportPanel() {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-base font-medium text-[var(--color-fg)] mb-1">
        Per-Entity CSV Exports
      </h2>
      <p className="text-sm text-[var(--color-fg-muted)] mb-4">
        Download a CSV of any single entity. Useful for spreadsheets, mail merges, and bespoke
        reports. For a complete tenant snapshot, use the Backups &amp; Data Export card above.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ENTITIES.map(({ key, label, desc }) => (
          <a
            key={key}
            href={`/api/export/tenant/csv/${key}`}
            download
            className="block rounded-md bg-[var(--color-bg-app)] border border-[var(--color-border)]
                       hover:border-[var(--color-fg-muted)] p-3 transition-colors"
          >
            <div className="text-sm font-medium text-[var(--color-fg)]">
              Download {label} CSV
            </div>
            <div className="text-xs text-[var(--color-fg-muted)] mt-0.5">{desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
