'use client'

import { AlertCircleIcon, AlertTriangleIcon, InfoIcon, Loader2Icon } from 'lucide-react'

const VARIANTS = {
  error: {
    container: 'bg-red-950 border-red-800',
    title: 'text-red-400',
    body: 'text-red-500',
  },
  warning: {
    container: 'bg-amber-950 border-amber-800',
    title: 'text-amber-400',
    body: 'text-amber-500',
  },
  info: {
    container: 'bg-zinc-900 border-zinc-700',
    title: 'text-zinc-100',
    body: 'text-zinc-500',
  },
  loading: {
    container: 'bg-amber-950 border-amber-800',
    title: 'text-amber-400',
    body: 'text-amber-500',
  },
} as const

const ICONS = {
  error: <AlertCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />,
  warning: <AlertTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />,
  info: <InfoIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />,
  loading: <Loader2Icon className="h-5 w-5 animate-spin flex-shrink-0 mt-0.5" />,
}

type Props = {
  variant: keyof typeof VARIANTS
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}

export function StatusBanner({ variant, title, body, action, className }: Props) {
  const styles = VARIANTS[variant]

  return (
    <div className={`rounded-xl border px-5 py-4 ${styles.container} ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={styles.title}>{ICONS[variant]}</span>
          <div>
            <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
            {body && (
              <p className={`text-xs mt-0.5 ${styles.body}`}>{body}</p>
            )}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  )
}
