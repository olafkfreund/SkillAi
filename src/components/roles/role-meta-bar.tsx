import Link from 'next/link'
import { MapPinIcon, GlobeIcon, BuildingIcon, LayersIcon, MonitorIcon, HomeIcon, UsersIcon } from 'lucide-react'

type RoleMeta = {
  workMode: string | null
  country: string | null
  city: string | null
  languageRequirements: string[] | null
  frameworkLevelLabel: string | null
}

type Customer = {
  id: string
  name: string
} | null

type Props = {
  role: RoleMeta
  customer?: Customer
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

export function RoleMetaBar({ role, customer }: Props) {
  const location = [role.city, role.country].filter(Boolean).join(', ')
  const hasLanguages = role.languageRequirements && role.languageRequirements.length > 0
  const workMode = role.workMode ? WORK_MODE_STYLES[role.workMode] : null

  // No metadata at all — render nothing
  if (!workMode && !location && !hasLanguages && !customer && !role.frameworkLevelLabel) {
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
    </div>
  )
}
