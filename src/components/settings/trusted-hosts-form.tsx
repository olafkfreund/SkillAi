'use client'

import { useState, useTransition } from 'react'
import { ShieldIcon } from 'lucide-react'
import { ChipInput } from '@/components/ui/chip-input'
import { saveTrustedHosts } from '@/actions/settings'

interface TrustedHostsFormProps {
  initialHosts: string[]
}

/**
 * TrustedHostsForm — admin-only editor for the per-tenant list of hostnames
 * the auth system should trust (sessions over Tailscale, behind a reverse
 * proxy, etc.). Stored in tenant_settings.key='trusted_hosts' as plain JSON.
 *
 * localhost / 127.0.0.1 are always-trusted at the runtime layer (when that
 * layer lands) and don't need to be entered here.
 */
export function TrustedHostsForm({ initialHosts }: TrustedHostsFormProps) {
  const [hosts, setHosts] = useState<string[]>(initialHosts)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await saveTrustedHosts(hosts)
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex items-center gap-2 mb-2">
        <ShieldIcon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-zinc-100">Trusted hosts</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Hostnames the auth system trusts (e.g. for sessions over Tailscale or
        behind a reverse proxy). localhost and 127.0.0.1 are always trusted.
      </p>
      <ChipInput
        value={hosts}
        onChange={(next) => {
          setHosts(next)
          if (success) setSuccess(false)
          if (error) setError(null)
        }}
        placeholder="e.g. p620.tail833f7.ts.net, recruit.example.com"
        maxChips={20}
        maxLength={253}
      />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {success && (
        <p className="mt-2 text-sm text-emerald-400">Trusted hosts updated.</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="mt-4 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save trusted hosts'}
      </button>
    </section>
  )
}
