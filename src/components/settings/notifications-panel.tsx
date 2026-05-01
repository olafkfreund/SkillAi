'use client'

/**
 * NotificationsPanel — admin-only panel for configuring Slack/Teams webhook
 * notifications.
 *
 * Mirrors the SmtpSettingsPanel pattern: each field/group has its own save
 * button; webhook URLs use a masked password input with show/hide toggle;
 * boolean toggles auto-save on change; a "Send test message" button fires
 * Agent A's testNotificationDelivery action and reports per-channel results
 * inline.
 *
 * Usage (in settings/page.tsx):
 *   const notifSettings = isAdmin ? await getNotificationSettings(tenantId) : null
 *   {notifSettings && <NotificationsPanel {...notifSettings} />}
 */

import { useState, useTransition } from 'react'
import {
  BellIcon,
  EyeIcon,
  EyeOffIcon,
  CheckCircleIcon,
  Loader2Icon,
  SendIcon,
} from 'lucide-react'
import { saveNotificationSetting, testNotificationDelivery } from '@/actions/settings'
import type { NotificationTestResult } from '@/actions/settings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationsPanelProps = {
  initialSlackWebhook: string
  initialTeamsWebhook: string
  initialHighScoreEnabled: boolean
  initialManagerDecisionEnabled: boolean
  initialScoreThreshold: number
}

type FieldState = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Shared style constants (mirrors smtp-settings-panel.tsx)
// ---------------------------------------------------------------------------

const INPUT_BASE =
  'w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] ' +
  'text-[var(--color-fg)] px-3 py-2 placeholder:text-[var(--color-fg-subtle)] ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

// ---------------------------------------------------------------------------
// Webhook URL row (masked input with show/hide)
// ---------------------------------------------------------------------------

function WebhookRow({
  settingKey,
  label,
  description,
  isConfigured,
}: {
  settingKey: 'slack_webhook_url' | 'teams_webhook_url'
  label: string
  description: string
  isConfigured: boolean
}) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [state, setState] = useState<FieldState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    if (!value) return
    setState('saving')
    setErrorMsg('')
    startTransition(async () => {
      const result = await saveNotificationSetting(settingKey, value)
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
          htmlFor={`notif-${settingKey}`}
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          {label}
        </label>
        {isConfigured && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-700">
            <CheckCircleIcon className="h-3 w-3" />
            Configured
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-fg-subtle)] mb-1.5">{description}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={`notif-${settingKey}`}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              isConfigured
                ? '••••••••••••••••'
                : settingKey === 'slack_webhook_url'
                  ? 'https://hooks.slack.com/services/…'
                  : 'https://outlook.office.com/webhook/…'
            }
            disabled={pending}
            className={INPUT_BASE + ' pr-10'}
            autoComplete="off"
            aria-label={label}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
            tabIndex={-1}
            aria-label={show ? 'Hide webhook URL' : 'Show webhook URL'}
          >
            {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
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
        <p className="mt-1 text-xs text-emerald-400">Saved.</p>
      )}
      {state === 'error' && (
        <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Triggers section (checkboxes + threshold)
// ---------------------------------------------------------------------------

function TriggersSection({
  initialHighScoreEnabled,
  initialManagerDecisionEnabled,
  initialScoreThreshold,
}: {
  initialHighScoreEnabled: boolean
  initialManagerDecisionEnabled: boolean
  initialScoreThreshold: number
}) {
  const [highScoreEnabled, setHighScoreEnabled] = useState(initialHighScoreEnabled)
  const [managerEnabled, setManagerEnabled] = useState(initialManagerDecisionEnabled)
  const [threshold, setThreshold] = useState(String(initialScoreThreshold))
  const [thresholdState, setThresholdState] = useState<FieldState>('idle')
  const [thresholdError, setThresholdError] = useState('')

  const [togglePending, startToggleTransition] = useTransition()
  const [thresholdPending, startThresholdTransition] = useTransition()

  const handleHighScoreToggle = (checked: boolean) => {
    setHighScoreEnabled(checked)
    startToggleTransition(async () => {
      const result = await saveNotificationSetting(
        'notify_high_score_enabled',
        checked ? 'true' : 'false',
      )
      if (!result.success) {
        // Revert on failure
        setHighScoreEnabled(!checked)
      }
    })
  }

  const handleManagerToggle = (checked: boolean) => {
    setManagerEnabled(checked)
    startToggleTransition(async () => {
      const result = await saveNotificationSetting(
        'notify_manager_decision_enabled',
        checked ? 'true' : 'false',
      )
      if (!result.success) {
        setManagerEnabled(!checked)
      }
    })
  }

  const handleThresholdSave = () => {
    const parsed = parseInt(threshold, 10)
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setThresholdState('error')
      setThresholdError('Enter a value between 0 and 100.')
      return
    }
    setThresholdState('saving')
    setThresholdError('')
    startThresholdTransition(async () => {
      const result = await saveNotificationSetting('notify_score_threshold', String(parsed))
      if (result.success) {
        setThresholdState('saved')
        setTimeout(() => setThresholdState('idle'), 2500)
      } else {
        setThresholdState('error')
        setThresholdError(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* High-score toggle + threshold */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={highScoreEnabled}
            onChange={(e) => handleHighScoreToggle(e.target.checked)}
            disabled={togglePending}
            className="mt-0.5 h-4 w-4 accent-blue-600 cursor-pointer"
            aria-describedby="high-score-desc"
          />
          <div>
            <span className="text-sm font-medium text-[var(--color-fg)]">
              Send notifications for high-score candidates
            </span>
            <p id="high-score-desc" className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5">
              Fires when a candidate&apos;s overall AI score meets or exceeds the threshold below.
            </p>
          </div>
        </label>

        {/* Threshold — always shown; disabled when toggle is off */}
        <div className="mt-3 ml-7">
          <label
            htmlFor="notif-score-threshold"
            className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
          >
            Score threshold
          </label>
          <div className="flex items-center gap-2">
            <input
              id="notif-score-threshold"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={thresholdPending || !highScoreEnabled}
              className="w-24 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)]
                         text-[var(--color-fg)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500
                         disabled:opacity-60"
              aria-label="Score threshold (0–100)"
            />
            <span className="text-xs text-[var(--color-fg-muted)]">/ 100</span>
            <button
              type="button"
              onClick={handleThresholdSave}
              disabled={thresholdPending || !highScoreEnabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs
                         font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {thresholdPending && <Loader2Icon className="h-3 w-3 animate-spin" />}
              Save
            </button>
          </div>
          {thresholdState === 'saved' && (
            <p className="mt-1 text-xs text-emerald-400">Threshold saved.</p>
          )}
          {thresholdState === 'error' && (
            <p className="mt-1 text-xs text-red-400">{thresholdError}</p>
          )}
        </div>
      </div>

      {/* Manager decision toggle */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={managerEnabled}
            onChange={(e) => handleManagerToggle(e.target.checked)}
            disabled={togglePending}
            className="mt-0.5 h-4 w-4 accent-blue-600 cursor-pointer"
            aria-describedby="manager-decision-desc"
          />
          <div>
            <span className="text-sm font-medium text-[var(--color-fg)]">
              Send notifications for manager approve/reject decisions
            </span>
            <p
              id="manager-decision-desc"
              className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5"
            >
              Fires when a hiring manager approves or rejects a shortlisted candidate.
            </p>
          </div>
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Test delivery button + per-channel result display
// ---------------------------------------------------------------------------

function TestDeliveryButton() {
  const [result, setResult] = useState<NotificationTestResult | null>(null)
  const [pending, startTransition] = useTransition()

  const handleTest = () => {
    setResult(null)
    startTransition(async () => {
      const res = await testNotificationDelivery()
      setResult(res)
    })
  }

  return (
    <div className="pt-4 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleTest}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-border)]
                     text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     hover:bg-[var(--color-bg-input)] disabled:opacity-50 transition-colors"
          aria-label="Send test notification to all configured webhooks"
        >
          {pending ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <SendIcon className="h-3 w-3" />
          )}
          Send test message
        </button>

        {result && (
          <ul
            className="flex flex-col gap-1 text-xs"
            role="status"
            aria-live="polite"
            aria-label="Test delivery results"
          >
            <TestChannelResult channel="Slack" outcome={result.slack} />
            <TestChannelResult channel="Teams" outcome={result.teams} />
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--color-fg-subtle)]">
        Sends a test message to all configured webhooks immediately, regardless of toggle state.
      </p>
    </div>
  )
}

function TestChannelResult({
  channel,
  outcome,
}: {
  channel: string
  outcome: { configured: boolean; ok: boolean; error?: string }
}) {
  if (!outcome.configured) {
    return (
      <li className="text-[var(--color-fg-subtle)]">
        {channel}: not configured
      </li>
    )
  }
  if (outcome.ok) {
    return (
      <li className="text-emerald-400">
        {channel}: delivered
      </li>
    )
  }
  return (
    <li className="text-red-400">
      {channel}: {outcome.error ?? 'failed'}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function NotificationsPanel({
  initialSlackWebhook,
  initialTeamsWebhook,
  initialHighScoreEnabled,
  initialManagerDecisionEnabled,
  initialScoreThreshold,
}: NotificationsPanelProps) {
  const slackConfigured = initialSlackWebhook.length > 0
  const teamsConfigured = initialTeamsWebhook.length > 0

  return (
    <section
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
      aria-labelledby="notifications-settings-heading"
    >
      <div className="flex items-center gap-2 mb-2">
        <BellIcon className="h-4 w-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
        <h2
          id="notifications-settings-heading"
          className="text-lg font-semibold text-[var(--color-fg)]"
        >
          Slack &amp; Teams notifications
        </h2>
      </div>
      <p className="text-xs text-[var(--color-fg-subtle)] mb-5">
        Post real-time alerts to a Slack or Teams channel when high-score candidates are ranked or
        hiring managers make decisions. Webhook URLs are encrypted at rest.
      </p>

      <div className="space-y-6">
        {/* Webhook URLs */}
        <div className="space-y-4">
          <WebhookRow
            settingKey="slack_webhook_url"
            label="Slack Incoming Webhook URL"
            description="Create one at api.slack.com/apps — add the Incoming Webhooks feature to your app."
            isConfigured={slackConfigured}
          />
          <WebhookRow
            settingKey="teams_webhook_url"
            label="Microsoft Teams Webhook URL"
            description="Add an Incoming Webhook connector to your Teams channel via Channel Settings → Connectors."
            isConfigured={teamsConfigured}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--color-border)]" />

        {/* Triggers */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
            Triggers
          </h3>
          <TriggersSection
            initialHighScoreEnabled={initialHighScoreEnabled}
            initialManagerDecisionEnabled={initialManagerDecisionEnabled}
            initialScoreThreshold={initialScoreThreshold}
          />
        </div>

        {/* Test button */}
        <TestDeliveryButton />
      </div>
    </section>
  )
}
