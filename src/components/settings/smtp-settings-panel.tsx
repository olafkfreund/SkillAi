'use client'

/**
 * SmtpSettingsPanel — client component for managing SMTP credentials.
 *
 * Each field is saved individually via saveSmtpSetting. smtp_pass uses a
 * masked input following the ApiKeyField pattern. All other fields are
 * plain text. A "Send test email" button exercises the configured transport
 * and reports success or failure inline.
 *
 * Usage (in settings/page.tsx):
 *   const smtp = await getSmtpSettings(tenantId)
 *   <SmtpSettingsPanel initial={smtp} />
 */

import { useState, useTransition } from 'react'
import {
  MailIcon,
  EyeIcon,
  EyeOffIcon,
  CheckCircleIcon,
  Loader2Icon,
  SendIcon,
} from 'lucide-react'
import { saveSmtpSetting, sendSmtpTestEmail } from '@/actions/settings'
import type { SmtpSettingsRecord } from '@/actions/settings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  initial: SmtpSettingsRecord
}

type FieldState = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INPUT_BASE =
  'w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] ' +
  'text-[var(--color-fg)] px-3 py-2 placeholder:text-[var(--color-fg-subtle)] ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

// ---------------------------------------------------------------------------
// Plain text setting row
// ---------------------------------------------------------------------------

function SmtpFieldRow({
  settingKey,
  label,
  placeholder,
  type = 'text',
  initialValue,
}: {
  settingKey: string
  label: string
  placeholder: string
  type?: 'text' | 'number'
  initialValue: string
}) {
  const [value, setValue] = useState(initialValue)
  const [state, setState] = useState<FieldState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    if (!value.trim()) return
    setState('saving')
    setErrorMsg('')
    startTransition(async () => {
      const result = await saveSmtpSetting(settingKey, value.trim())
      if (result.success) {
        setState('saved')
        setTimeout(() => setState('idle'), 2500)
      } else {
        setState('error')
        setErrorMsg(result.error)
      }
    })
  }

  return (
    <div>
      <label
        htmlFor={`smtp-${settingKey}`}
        className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`smtp-${settingKey}`}
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={pending}
          className={INPUT_BASE}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !value.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs
                     font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {pending && <Loader2Icon className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </div>
      {state === 'saved' && (
        <p className="mt-1 text-xs text-emerald-400">Saved.</p>
      )}
      {state === 'error' && (
        <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Secure password row (masked)
// ---------------------------------------------------------------------------

function SmtpPasswordRow({ isConfigured }: { isConfigured: boolean }) {
  const [value, setValue] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [state, setState] = useState<FieldState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    if (!value) return
    setState('saving')
    setErrorMsg('')
    startTransition(async () => {
      const result = await saveSmtpSetting('smtp_pass', value)
      if (result.success) {
        setValue('')
        setState('saved')
        setTimeout(() => setState('idle'), 2500)
      } else {
        setState('error')
        setErrorMsg(result.error)
      }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label
          htmlFor="smtp-smtp_pass"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          SMTP password
        </label>
        {isConfigured && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-700">
            <CheckCircleIcon className="h-3 w-3" />
            Configured
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id="smtp-smtp_pass"
            type={showPass ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isConfigured ? '••••••••••••••••' : 'SMTP password or app password'}
            disabled={pending}
            className={INPUT_BASE + ' pr-10'}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
            tabIndex={-1}
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            {showPass ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !value}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs
                     font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {pending && <Loader2Icon className="h-3 w-3 animate-spin" />}
          {isConfigured ? 'Update' : 'Save'}
        </button>
      </div>
      {state === 'saved' && (
        <p className="mt-1 text-xs text-emerald-400">Password saved.</p>
      )}
      {state === 'error' && (
        <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Boolean toggle row (smtp_secure — STARTTLS vs SSL/TLS)
// ---------------------------------------------------------------------------

function SmtpSecureRow({ initialValue }: { initialValue: string }) {
  const [secure, setSecure] = useState(initialValue === 'true')
  const [state, setState] = useState<FieldState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pending, startTransition] = useTransition()

  const handleChange = (newValue: boolean) => {
    setSecure(newValue)
    setState('saving')
    setErrorMsg('')
    startTransition(async () => {
      const result = await saveSmtpSetting('smtp_secure', String(newValue))
      if (result.success) {
        setState('saved')
        setTimeout(() => setState('idle'), 2500)
      } else {
        setState('error')
        setErrorMsg(result.error)
        // Revert on failure
        setSecure(!newValue)
      }
    })
  }

  return (
    <div>
      <span className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
        Encryption
      </span>
      <div className="flex gap-3">
        {([false, true] as const).map((val) => (
          <label
            key={String(val)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <input
              type="radio"
              name="smtp_secure"
              checked={secure === val}
              onChange={() => handleChange(val)}
              disabled={pending}
              className="accent-blue-600"
            />
            <span className="text-sm text-[var(--color-fg)]">
              {val ? 'SSL / TLS (port 465)' : 'STARTTLS (port 587)'}
            </span>
          </label>
        ))}
      </div>
      {state === 'saved' && (
        <p className="mt-1 text-xs text-emerald-400">Saved.</p>
      )}
      {state === 'error' && (
        <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Test-send button
// ---------------------------------------------------------------------------

function TestSendButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const handleTest = () => {
    setResult(null)
    startTransition(async () => {
      const res = await sendSmtpTestEmail()
      if (res.success) {
        setResult({ ok: true, message: 'Test email sent to your address.' })
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  return (
    <div className="pt-2 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-border)]
                     text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     hover:bg-[var(--color-bg-input)] disabled:opacity-50 transition-colors"
        >
          {pending
            ? <Loader2Icon className="h-3 w-3 animate-spin" />
            : <SendIcon className="h-3 w-3" />
          }
          Send test email
        </button>
        {result && (
          <p
            className={`text-xs ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}
            role="status"
            aria-live="polite"
          >
            {result.message}
          </p>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--color-fg-subtle)]">
        Sends a test message to your account email using the credentials above.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SmtpSettingsPanel({ initial }: Props) {
  return (
    <section
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
      aria-labelledby="smtp-settings-heading"
    >
      <div className="flex items-center gap-2 mb-2">
        <MailIcon className="h-4 w-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
        <h2 id="smtp-settings-heading" className="text-lg font-semibold text-[var(--color-fg)]">
          SMTP credentials
        </h2>
      </div>
      <p className="text-xs text-[var(--color-fg-subtle)] mb-5">
        Used to send candidate emails (screening invites, rejections, etc.).
        Changes take effect immediately — no restart required.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4
                        sm:grid-cols-2">
          <SmtpFieldRow
            settingKey="smtp_host"
            label="SMTP host"
            placeholder="smtp.example.com"
            initialValue={initial.smtp_host}
          />
          <SmtpFieldRow
            settingKey="smtp_port"
            label="Port"
            placeholder="587"
            type="number"
            initialValue={initial.smtp_port}
          />
        </div>

        <SmtpSecureRow initialValue={initial.smtp_secure} />

        <SmtpFieldRow
          settingKey="smtp_user"
          label="SMTP username"
          placeholder="noreply@example.com"
          initialValue={initial.smtp_user}
        />

        <SmtpPasswordRow isConfigured={initial.smtp_pass_configured} />

        <div className="grid grid-cols-1 gap-4
                        sm:grid-cols-2">
          <SmtpFieldRow
            settingKey="smtp_from_email"
            label="From email address"
            placeholder="noreply@example.com"
            initialValue={initial.smtp_from_email}
          />
          <SmtpFieldRow
            settingKey="smtp_from_name"
            label="From name"
            placeholder="SkillAI Recruiting"
            initialValue={initial.smtp_from_name}
          />
        </div>

        <TestSendButton />
      </div>
    </section>
  )
}
