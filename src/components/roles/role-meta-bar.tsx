import Link from 'next/link'
import { MapPinIcon, GlobeIcon, BuildingIcon, LayersIcon, MonitorIcon, HomeIcon, UsersIcon, CalendarIcon, ClockIcon, ExternalLinkIcon } from 'lucide-react'

type RoleMeta = {
  workMode: string | null
  country: string | null
  city: string | null
  languageRequirements: string[] | null
  frameworkLevelLabel: string | null
  targetFillDate?: string | null
  cutoffDate?: string | null
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
    bg: 'bg-emerald-950',
    text: 'text-emerald-300',
    border: 'border-emerald-800',
    icon: <HomeIcon className="h-3 w-3" />,
    label: 'Remote',
  },
  hybrid: {
    bg: 'bg-blue-950',
    text: 'text-blue-300',
    border: 'border-blue-800',
    icon: <MonitorIcon className="h-3 w-3" />,
    label: 'Hybrid',
  },
  onsite: {
    bg: 'bg-amber-950',
    text: 'text-amber-300',
    border: 'border-amber-800',
    icon: <BuildingIcon className="h-3 w-3" />,
    label: 'Onsite',
  },
}

export function RoleMetaBar({ role, customer, portalUrl }: Props) {
  const location = [role.city, role.country].filter(Boolean).join(', ')
  const hasLanguages = role.languageRequirements && role.languageRequirements.length > 0
  const workMode = role.workMode ? WORK_MODE_STYLES[role.workMode] : null

  // Cut-off colour by urgency
  const cutoffDays = role.cutoffDate ? daysFromNow(role.cutoffDate) : null
  const cutoffStyle = cutoffDays === null
    ? null
    : cutoffDays < 0
      ? { bg: 'bg-red-950', text: 'text-red-300', border: 'border-red-800', label: 'EXPIRED' }
      : cutoffDays <= 14
        ? { bg: 'bg-amber-950', text: 'text-amber-300', border: 'border-amber-800', label: `Cut-off ${fmtDate(role.cutoffDate!)}` }
        : { bg: 'bg-emerald-950', text: 'text-emerald-300', border: 'border-emerald-800', label: `Cut-off ${fmtDate(role.cutoffDate!)}` }

  // No metadata at all — render nothing
  if (!workMode && !location && !hasLanguages && !customer && !role.frameworkLevelLabel
      && !role.targetFillDate && !role.cutoffDate && !portalUrl) {
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs font-medium px-2.5 py-1">
          <MapPinIcon className="h-3 w-3 text-zinc-500" />
          {location}
        </span>
      )}

      {hasLanguages && role.languageRequirements!.map((lang) => (
        <span
          key={lang}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-800 bg-violet-950 text-violet-300 text-xs font-medium px-2.5 py-1"
        >
          <GlobeIcon className="h-3 w-3" />
          {lang}
        </span>
      ))}

      {customer && (
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs font-medium px-2.5 py-1 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          <UsersIcon className="h-3 w-3 text-zinc-500" />
          {customer.name}
        </Link>
      )}

      {role.frameworkLevelLabel && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-800 bg-indigo-950 text-indigo-300 text-xs font-medium px-2.5 py-1">
          <LayersIcon className="h-3 w-3" />
          {role.frameworkLevelLabel}
        </span>
      )}

      {role.targetFillDate && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs font-medium px-2.5 py-1">
          <CalendarIcon className="h-3 w-3 text-zinc-500" />
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
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950 text-blue-300 text-xs font-medium px-2.5 py-1 hover:bg-blue-900 hover:text-blue-200 transition-colors"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          Customer portal
        </a>
      )}
    </div>
  )
}
