'use client'

/**
 * ApiTokensPanel — client component for managing per-tenant API tokens.
 *
 * Tokens are passed as a prop from the server-component settings page.
 * Mutations use useTransition + server actions (createApiToken, revokeApiToken).
 *
 * Usage (in settings/page.tsx):
 *   const tokensResult = await listApiTokens()
 *   const tokens = tokensResult.success ? tokensResult.data : []
 *   <ApiTokensPanel tokens={tokens} currentUserRole={session.user.role} />
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  KeyRoundIcon,
  PlusIcon,
  Loader2Icon,
  CopyIcon,
  CheckIcon,
  ShieldAlertIcon,
  XIcon,
} from 'lucide-react'
import { createApiToken, revokeApiToken } from '@/actions/api-tokens'
import type { ApiTokenMetadata } from '@/actions/api-tokens'
import type { ApiTokenScope } from '@/db/schema/api-tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  tokens: ApiTokenMetadata[]
  currentUserRole: string
}

type ExpiryOption = {
  label: string
  value: string
  days: number | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '7 days', value: '7d', days: 7 },
  { label: '30 days', value: '30d', days: 30 },
  { label: '90 days (recommended)', value: '90d', days: 90 },
  { label: '1 year', value: '1y', days: 365 },
  { label: 'Never', value: 'never', days: null },
]

const SCOPE_CONFIG: Record<ApiTokenScope, { label: string; bgVar: string; fgVar: string }> = {
  read: {
    label: 'read',
    bgVar: '--color-status-interviewing-bg',
    fgVar: '--color-status-interviewing-fg',
  },
  write: {
    label: 'write',
    bgVar: '--color-status-offered-bg',
    fgVar: '--color-status-offered-fg',
  },
  admin: {
    label: 'admin',
    bgVar: '--color-status-rejected-bg',
    fgVar: '--color-status-rejected-fg',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(date: Date | null): string {
  if (!date) return 'Never'
  const now = Date.now()
  const diffMs = now - new Date(date).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `${diffD}d ago`
  return formatDate(date)
}

function formatDate(date: Date | null): string {
  if (!date) return 'Never'
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function addDays(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScopeBadge({ scope }: { scope: ApiTokenScope }) {
  const cfg = SCOPE_CONFIG[scope]
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: `var(${cfg.bgVar})`,
        color: `var(${cfg.fgVar})`,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Post-creation token reveal modal
// ---------------------------------------------------------------------------

function TokenRevealModal({
  rawToken,
  onDone,
}: {
  rawToken: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-reveal-title"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlertIcon className="h-5 w-5 text-amber-400 flex-shrink-0" aria-hidden="true" />
          <h2 id="token-reveal-title" className="text-base font-semibold text-[var(--color-fg)]">
            Token created — save it now
          </h2>
        </div>

        {/* Warning */}
        <div className="rounded-lg bg-amber-950 border border-amber-700 px-4 py-3 mb-4">
          <p className="text-xs text-amber-300 font-medium leading-relaxed">
            This is the only time this token will be shown. It is not stored in the database.
            If you lose it, you will need to revoke it and create a new one.
          </p>
        </div>

        {/* Raw token display */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5">
            Your API token
          </label>
          <div
            className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2"
          >
            <code
              className="flex-1 text-xs font-mono text-[var(--color-fg)] break-all select-all"
              aria-label="API token value"
            >
              {rawToken}
            </code>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700
                       text-white text-xs font-medium transition-colors"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="h-3 w-3" />
                Copy token
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="px-3 py-1.5 rounded-md border border-[var(--color-border)]
                       text-xs font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]
                       transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create token form (inline, slides in below the header)
// ---------------------------------------------------------------------------

function CreateTokenForm({
  currentUserRole,
  onCreated,
  onCancel,
}: {
  currentUserRole: string
  onCreated: (rawToken: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<ApiTokenScope>>(new Set(['read']))
  const [expiry, setExpiry] = useState<string>('90d')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isAdmin = currentUserRole === 'admin'

  const toggleScope = (scope: ApiTokenScope) => {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) {
        next.delete(scope)
      } else {
        next.add(scope)
      }
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Token name is required.')
      return
    }
    if (name.length > 80) {
      setError('Token name must be 80 characters or fewer.')
      return
    }
    if (scopes.size === 0) {
      setError('Select at least one scope.')
      return
    }

    const selectedExpiry = EXPIRY_OPTIONS.find((o) => o.value === expiry)
    const expiresAt =
      selectedExpiry?.days != null ? addDays(selectedExpiry.days) : undefined

    startTransition(async () => {
      const result = await createApiToken({
        name: name.trim(),
        scopes: Array.from(scopes),
        expiresAt,
      })
      if (result.success) {
        onCreated(result.data.rawToken)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] p-5 space-y-4"
      aria-label="Create API token"
    >
      {/* Name */}
      <div>
        <label
          htmlFor="token-name"
          className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
        >
          Token name <span className="text-[var(--color-fg-subtle)]">(max 80 chars)</span>
        </label>
        <input
          id="token-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="e.g. claude-desktop, ci-read-only"
          disabled={pending}
          className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]
                     text-[var(--color-fg)] px-3 py-2 placeholder:text-[var(--color-fg-subtle)]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          autoComplete="off"
        />
      </div>

      {/* Scopes */}
      <fieldset>
        <legend className="text-xs font-medium text-[var(--color-fg-muted)] mb-2">Scopes</legend>
        <div className="flex flex-wrap gap-3">
          {(['read', 'write', 'admin'] as const).map((scope) => {
            const disabled = scope === 'admin' && !isAdmin
            const checked = scopes.has(scope)
            return (
              <label
                key={scope}
                className={`flex items-center gap-2 cursor-pointer select-none ${
                  disabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || pending}
                  onChange={() => !disabled && toggleScope(scope)}
                  className="rounded border-[var(--color-border)] accent-blue-600"
                  aria-describedby={`scope-${scope}-hint`}
                />
                <ScopeBadge scope={scope} />
                {disabled && (
                  <span
                    id={`scope-${scope}-hint`}
                    className="text-[10px] text-[var(--color-fg-subtle)]"
                  >
                    admin role required
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)]">
          read — list &amp; search; write — create/update; admin — tenant administration
        </p>
      </fieldset>

      {/* Expiry */}
      <div>
        <label
          htmlFor="token-expiry"
          className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
        >
          Expiry
        </label>
        <select
          id="token-expiry"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          disabled={pending}
          className="text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]
                     text-[var(--color-fg)] px-3 py-2 focus:outline-none focus:ring-2
                     focus:ring-blue-500 disabled:opacity-60"
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700
                     text-white text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {pending && <Loader2Icon className="h-3 w-3 animate-spin" />}
          Create token
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 rounded-md border border-[var(--color-border)]
                     text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                     hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Token row with inline revoke confirm
// ---------------------------------------------------------------------------

function TokenRow({ token }: { token: ApiTokenMetadata }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const handleRevoke = () => {
    setError(null)
    startTransition(async () => {
      const result = await revokeApiToken(token.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3"
    >
      <div className="flex items-start gap-3">
        {/* Left: name + prefix + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className="text-sm font-medium text-[var(--color-fg)] truncate">
              {token.name}
            </span>
            <code
              className="text-[11px] font-mono text-[var(--color-fg-subtle)] bg-[var(--color-bg-input)]
                         border border-[var(--color-border)] px-1.5 py-0.5 rounded"
              title="Token prefix"
            >
              {token.prefix}…
            </code>
          </div>

          {/* Scope badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            {(token.scopes as ApiTokenScope[]).map((s) => (
              <ScopeBadge key={s} scope={s} />
            ))}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--color-fg-subtle)]">
            <span>
              Last used:{' '}
              <span className="text-[var(--color-fg-muted)]">{relativeTime(token.lastUsedAt)}</span>
            </span>
            <span>
              Expires:{' '}
              <span className="text-[var(--color-fg-muted)]">{formatDate(token.expiresAt)}</span>
            </span>
            <span>
              Created:{' '}
              <span className="text-[var(--color-fg-muted)]">{formatDate(token.createdAt)}</span>
            </span>
          </div>

          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>

        {/* Right: revoke button / inline confirm */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-800
                         text-red-400 text-xs font-medium hover:bg-red-950 disabled:opacity-50
                         transition-colors"
              aria-label={`Revoke token ${token.name}`}
            >
              <XIcon className="h-3 w-3" />
              Revoke
            </button>
          ) : (
            <div
              className="flex items-center gap-2 rounded-md bg-red-950 border border-red-800 px-3 py-1.5"
            >
              <span className="text-xs text-red-400">Revoke this token?</span>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={pending}
                className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {pending ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ApiTokensPanel({ tokens, currentUserRole }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [revealToken, setRevealToken] = useState<string | null>(null)
  const router = useRouter()

  const handleCreated = (rawToken: string) => {
    setShowCreateForm(false)
    setRevealToken(rawToken)
  }

  const handleRevealDone = () => {
    setRevealToken(null)
    router.refresh()
  }

  return (
    <>
      {/* Token reveal modal — shown immediately after creation */}
      {revealToken && (
        <TokenRevealModal rawToken={revealToken} onDone={handleRevealDone} />
      )}

      <section
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
        aria-labelledby="api-tokens-heading"
      >
        {/* Section header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <KeyRoundIcon className="h-4 w-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
            <h2 id="api-tokens-heading" className="text-lg font-semibold text-[var(--color-fg)]">
              API tokens
            </h2>
          </div>
          {!showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700
                         text-white text-xs font-medium transition-colors"
            >
              <PlusIcon className="h-3 w-3" />
              Create token
            </button>
          )}
        </div>

        <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
          Machine-to-machine tokens for MCP clients (claude-desktop), CI/CD scripts, and
          automations. Each token is shown only once on creation — store it securely.
        </p>

        {/* Create form */}
        {showCreateForm && (
          <div className="mb-4">
            <CreateTokenForm
              currentUserRole={currentUserRole}
              onCreated={handleCreated}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {/* Token list */}
        {tokens.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-[var(--color-border)]
                        bg-[var(--color-bg-input)] px-5 py-6 text-center"
          >
            <p className="text-sm text-[var(--color-fg-subtle)]">No API tokens yet.</p>
            <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
              Create one to enable MCP clients and automation scripts.
            </p>
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="API tokens">
            {tokens.map((token) => (
              <div key={token.id} role="listitem">
                <TokenRow token={token} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
