'use client'

import { useActionState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { saveGeneralSetting } from '@/actions/settings'
import type { GeneralSettingsState } from '@/actions/settings'

type Option = {
  value: string
  label: string
}

type Props = {
  settingKey: 'default_ai_model' | 'max_upload_mb'
  label: string
  options: Option[]
  currentValue: string
}

export function GeneralSettingSelect({ settingKey, label, options, currentValue }: Props) {
  const boundAction = saveGeneralSetting.bind(null, settingKey)
  const [state, formAction, pending] = useActionState<GeneralSettingsState | null, FormData>(
    boundAction,
    null
  )

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
      <h3 className="text-sm font-semibold text-zinc-100 mb-3">{label}</h3>
      <form action={formAction} className="space-y-3">
        <select
          name="value"
          defaultValue={currentValue}
          disabled={pending}
          className="w-full text-sm rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

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
