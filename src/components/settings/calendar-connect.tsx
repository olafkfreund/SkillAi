'use client'

import { useTransition } from 'react'
import { CheckCircleIcon, CircleIcon, ExternalLinkIcon, UnlinkIcon } from 'lucide-react'
import { disconnectCalendar } from '@/actions/calendar'

interface Props {
  googleConnected: boolean
  microsoftConnected: boolean
}

interface ProviderCardProps {
  name: string
  description: string
  connected: boolean
  connectHref: string
  providerKey: 'google' | 'microsoft'
  icon: React.ReactNode
}

function ProviderCard({
  name,
  description,
  connected,
  connectHref,
  providerKey,
  icon,
}: ProviderCardProps) {
  const [isPending, startTransition] = useTransition()

  const handleDisconnect = () => {
    startTransition(async () => {
      await disconnectCalendar(providerKey)
    })
  }

  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-800 border border-zinc-700 px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-200">{name}</p>
            {connected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium
                               text-emerald-400 bg-emerald-950 border border-emerald-800
                               rounded-full px-2 py-0.5">
                <CheckCircleIcon className="h-2.5 w-2.5" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium
                               text-zinc-500 bg-zinc-800 border border-zinc-700
                               rounded-full px-2 py-0.5">
                <CircleIcon className="h-2.5 w-2.5" />
                Not connected
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>

      <div>
        {connected ? (
          <button
            onClick={handleDisconnect}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       text-zinc-400 border border-zinc-600 rounded-lg
                       hover:text-red-400 hover:border-red-800 hover:bg-red-950
                       transition-colors disabled:opacity-50"
          >
            <UnlinkIcon className="h-3.5 w-3.5" />
            {isPending ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <a
            href={connectHref}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       bg-violet-700 hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            Connect
          </a>
        )}
      </div>
    </div>
  )
}

// Inline Google "G" icon (coloured, no external lib needed)
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

// Simple Microsoft square logo
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-5 w-5" aria-hidden="true">
      <path fill="#f25022" d="M0 0h11v11H0z" />
      <path fill="#00a4ef" d="M12 0h11v11H12z" />
      <path fill="#7fba00" d="M0 12h11v11H0z" />
      <path fill="#ffb900" d="M12 12h11v11H12z" />
    </svg>
  )
}

export function CalendarConnect({ googleConnected, microsoftConnected }: Props) {
  return (
    <div className="space-y-3">
      <ProviderCard
        name="Google Calendar"
        description="Sync interview slots to your Google Calendar"
        connected={googleConnected}
        connectHref="/api/auth/calendar/google"
        providerKey="google"
        icon={<GoogleIcon />}
      />
      <ProviderCard
        name="Microsoft O365"
        description="Sync interview slots to your Outlook / O365 Calendar"
        connected={microsoftConnected}
        connectHref="/api/auth/calendar/microsoft"
        providerKey="microsoft"
        icon={<MicrosoftIcon />}
      />
    </div>
  )
}
