import Link from 'next/link'
import { MapPinIcon, GlobeIcon, BuildingIcon, LayersIcon, MonitorIcon, HomeIcon, UsersIcon, CalendarIcon, ClockIcon, ExternalLinkIcon, BanknoteIcon, HashIcon } from 'lucide-react'

type RoleMeta = {
  workMode: string | null
  country: string | null
  city: string | null
  languageRequirements: string[] | null
  frameworkLevelLabel: string | null
  targetFillDate?: string | null
  cutoffDate?: string | null
  customerDayRate?: string | null
  rateCurrency?: string | null
}

type Customer = {
  id: string
  name: string
} | null

type Props = {
  role: RoleMeta
  customer?: Customer
  /** Full assembled portal URL ({customer.portalBaseUrl} + {role.customerPortalPath}) or null */
  portalUrl?: string | null
  /** Customer-side role identifier (e.g. ATS / requisition ID). Visible to all audiences. */
  customerRoleId?: string | null
  /** Per-customer label override; falls back to "Customer Role ID" when absent. */
  customerRoleIdLabel?: string | null
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysFromNow(iso: string): number {
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const WORK_MODE_STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
  remote: {
    bg: 'bg-emerald-100 dark:bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
    icon: <HomeIcon className="h-3 w-3" />,
    label: 'Remote',
  },
  hybrid: {
    bg: 'bg-blue-100 dark:bg-blue-950',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-800',
    icon: <MonitorIcon className="h-3 w-3" />,
    label: 'Hybrid',
  },
  onsite: {
    bg: 'bg-amber-100 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
    icon: <BuildingIcon className="h-3 w-3" />,
    label: 'Onsite',
  },
}

export function RoleMetaBar({ role, customer, portalUrl, customerRoleId, customerRoleIdLabel }: Props) {
  const location = [role.city, role.country].filter(Boolean).join(', ')
  const hasLanguages = role.languageRequirements && role.languageRequirements.length > 0
  const workMode = role.workMode ? WORK_MODE_STYLES[role.workMode] : null
  const hasCustomerRoleId = typeof customerRoleId === 'string' && customerRoleId.trim().length > 0
  const resolvedRoleIdLabel = (customerRoleIdLabel && customerRoleIdLabel.trim().length > 0)
    ? customerRoleIdLabel
    : 'Customer Role ID'

  // Cut-off colour by urgency
  const cutoffDays = role.cutoffDate ? daysFromNow(role.cutoffDate) : null
  const cutoffStyle = cutoffDays === null
    ? null
    : cutoffDays < 0
      ? { bg: 'bg-red-100 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-800', label: 'EXPIRED' }
      : cutoffDays <= 14
        ? { bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800', label: `Cut-off ${fmtDate(role.cutoffDate!)}` }
        : { bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800', label: `Cut-off ${fmtDate(role.cutoffDate!)}` }

  // No metadata at all — render nothing
  if (!workMode && !location && !hasLanguages && !customer && !role.frameworkLevelLabel
      && !role.targetFillDate && !role.cutoffDate && !portalUrl && !role.customerDayRate
      && !hasCustomerRoleId) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {workMode && (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${workMode.bg} ${workMode.text} ${workMode.border}`}>
          {workMode.icon}
          {workMode.label}
        </span>
      )}

      {location && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] text-xs font-medium px-2.5 py-1">
          <MapPinIcon className="h-3 w-3 text-[var(--color-fg-subtle)]" />
          {location}
        </span>
      )}

      {hasLanguages && role.languageRequirements!.map((lang) => (
        <span
          key={lang}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 dark:border-violet-800 bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-xs font-medium px-2.5 py-1"
        >
          <GlobeIcon className="h-3 w-3" />
          {lang}
        </span>
      ))}

      {customer && (
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] text-xs font-medium px-2.5 py-1 hover:bg-[var(--color-border)] hover:text-[var(--color-fg)] transition-colors"
        >
          <UsersIcon className="h-3 w-3 text-[var(--color-fg-subtle)]" />
          {customer.name}
        </Link>
      )}

      {hasCustomerRoleId && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300 text-xs font-medium px-2.5 py-1">
          <HashIcon className="h-3 w-3 text-slate-500" />
          {resolvedRoleIdLabel}: {customerRoleId}
        </span>
      )}

      {role.frameworkLevelLabel && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-medium px-2.5 py-1">
          <LayersIcon className="h-3 w-3" />
          {role.frameworkLevelLabel}
        </span>
      )}

      {role.customerDayRate && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-medium px-2.5 py-1">
          <BanknoteIcon className="h-3 w-3" />
          {role.rateCurrency ?? ''} {Number(role.customerDayRate).toFixed(0)}/day budget
        </span>
      )}

      {role.targetFillDate && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] text-xs font-medium px-2.5 py-1">
          <CalendarIcon className="h-3 w-3 text-[var(--color-fg-subtle)]" />
          Fill by {fmtDate(role.targetFillDate)}
        </span>
      )}

      {cutoffStyle && (
        <span className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-medium px-2.5 py-1 ${cutoffStyle.bg} ${cutoffStyle.text} ${cutoffStyle.border}`}>
          <ClockIcon className="h-3 w-3" />
          {cutoffStyle.label}
        </span>
      )}

      {portalUrl && (
        <a
          href={portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1 hover:bg-blue-200 dark:hover:bg-blue-900 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          Customer portal
        </a>
      )}
    </div>
  )
}
