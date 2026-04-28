'use client'

import { useActionState, useState } from 'react'
import { CheckCircleIcon, EyeIcon, EyeOffIcon, KeyIcon, Loader2Icon, TrashIcon } from 'lucide-react'
import { saveApiKey, removeApiKey } from '@/actions/settings'
import type { SettingsState } from '@/actions/settings'

type Props = {
  settingKey:
    | 'anthropic_api_key'
    | 'google_ai_api_key'
    | 'openai_api_key'
    | 'brave_search_api_key'
    | 'github_token'
  label: string
  placeholder: string
  isConfigured: boolean
}

export function ApiKeyField({ settingKey, label, placeholder, isConfigured }: Props) {
  const [showKey, setShowKey] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const [saveState, saveAction, savePending] = useActionState<SettingsState | null, FormData>(
    saveApiKey,
    null
  )
  const [removeState, removeAction, removePending] = useActionState<SettingsState | null, FormData>(
    removeApiKey,
    null
  )

  const pending = savePending || removePending

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyIcon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        <h3 className="text-sm font-semibold text-[var(--color-fg)]">{label}</h3>
        {isConfigured && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-700 ml-auto">
            <CheckCircleIcon className="h-3 w-3" />
            Configured
          </span>
        )}
      </div>

      {/* Save form */}
      <form
        action={(fd) => {
          fd.set('key', settingKey)
          saveAction(fd)
        }}
        className="space-y-3"
      >
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            name="value"
            placeholder={isConfigured ? '••••••••••••••••' : placeholder}
            disabled={pending}
            className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 pr-10
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
            tabIndex={-1}
          >
            {showKey ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>

        {saveState && !saveState.success && (
          <p className="text-xs text-red-400">{saveState.error}</p>
        )}
        {saveState?.success && (
          <p className="text-xs text-emerald-400">API key saved successfully.</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs
                       font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savePending && <Loader2Icon className="h-3 w-3 animate-spin" />}
            {isConfigured ? 'Update key' : 'Save key'}
          </button>

          {isConfigured && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-800 text-red-400 text-xs
                         font-medium hover:bg-red-950 disabled:opacity-50 transition-colors"
            >
              <TrashIcon className="h-3 w-3" />
              Remove
            </button>
          )}
        </div>
      </form>

      {/* Remove confirmation */}
      {confirming && (
        <form
          action={(fd) => {
            fd.set('key', settingKey)
            removeAction(fd)
            setConfirming(false)
          }}
          className="mt-3 flex items-center gap-2 bg-red-950 border border-red-800 rounded-md px-3 py-2"
        >
          <p className="text-xs text-red-400 flex-1">Remove this API key? This cannot be undone.</p>
          <button
            type="submit"
            disabled={pending}
            className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {removePending ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
          >
            Cancel
          </button>
        </form>
      )}

      {removeState && !removeState.success && (
        <p className="text-xs text-red-400 mt-2">{removeState.error}</p>
      )}
    </div>
  )
}
