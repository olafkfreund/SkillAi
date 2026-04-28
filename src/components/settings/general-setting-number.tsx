'use client'

import { useActionState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { saveGeneralSetting } from '@/actions/settings'
import type { GeneralSettingsState } from '@/actions/settings'

type Props = {
  settingKey: 'default_ai_model' | 'max_upload_mb'
  label: string
  min: number
  max: number
  currentValue: string
  unit: string
}

export function GeneralSettingNumber({ settingKey, label, min, max, currentValue, unit }: Props) {
  const boundAction = saveGeneralSetting.bind(null, settingKey)
  const [state, formAction, pending] = useActionState<GeneralSettingsState | null, FormData>(
    boundAction,
    null
  )

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--color-fg)] mb-3">{label}</h3>
      <form action={formAction} className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="value"
            min={min}
            max={max}
            defaultValue={currentValue || String(min)}
            disabled={pending}
            className="w-24 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)]
                       px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                       disabled:opacity-60"
          />
          <span className="text-sm text-[var(--color-fg-muted)]">{unit}</span>
        </div>

        {state && !state.success && (
          <p className="text-xs text-red-400">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-xs text-emerald-400">Setting saved.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white
                     text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending && <Loader2Icon className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </form>
    </div>
  )
}
