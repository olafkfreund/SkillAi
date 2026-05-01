'use client'

import { SUPPORTED_LANGUAGES, getDisplayName, type SupportedLanguage } from '@/lib/ai/language'

interface PackLanguagePickerProps {
  value: SupportedLanguage
  onChange: (next: SupportedLanguage) => void
  disabled?: boolean
  id?: string
}

export function PackLanguagePicker({ value, onChange, disabled, id = 'pack-language' }: PackLanguagePickerProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
        Pack language
      </label>
      <select
        id={id}
        name="language"
        value={value}
        onChange={(e) => onChange(e.target.value as SupportedLanguage)}
        disabled={disabled}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {getDisplayName(lang)} ({lang.toUpperCase()})
          </option>
        ))}
      </select>
    </div>
  )
}
