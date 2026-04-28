import { notFound } from 'next/navigation'
import { SettingsIcon } from 'lucide-react'
import { eq, and, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, withTenant } from '@/db'
import { calendarConnections, auditLogs } from '@/db/schema'
import {
  getConfiguredKeys,
  getGeneralSettings,
  getTrustedHosts,
  getDefaultPackLanguage,
  getSmtpSettings,
} from '@/actions/settings'
import { listTenantUsers } from '@/actions/users'
import { listApiTokens } from '@/actions/api-tokens'
import { listEmailTemplates } from '@/actions/email-templates'
import { ApiKeyField } from '@/components/settings/api-key-field'
import { GeneralSettingSelect } from '@/components/settings/general-setting-select'
import { GeneralSettingNumber } from '@/components/settings/general-setting-number'
import { UserManagementTable } from '@/components/settings/user-management-table'
import { CalendarConnect } from '@/components/settings/calendar-connect'
import { AccountSection } from '@/components/settings/account-section'
import { CreateUserForm } from '@/components/settings/create-user-form'
import { TrustedHostsForm } from '@/components/settings/trusted-hosts-form'
import { DefaultLanguageForm } from '@/components/settings/default-language-form'
import { AiUsagePanel } from '@/components/settings/ai-usage-panel'
import { ApiTokensPanel } from '@/components/settings/api-tokens-panel'
import { SmtpSettingsPanel } from '@/components/settings/smtp-settings-panel'
import { EmailTemplatesPanel } from '@/components/settings/email-templates-panel'
import { OAuthCredentialsForm } from '@/components/settings/oauth-credentials-form'
import { BackupsPanel } from '@/components/settings/backups-panel'
import { CsvExportPanel } from '@/components/settings/csv-export-panel'

export default async function SettingsPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const isAdmin = session?.user.role === 'admin'
  const configuredKeys = isAdmin ? await getConfiguredKeys(tenantId) : []
  const generalSettings = isAdmin ? await getGeneralSettings(tenantId) : {}
  const tenantUsers = isAdmin ? await listTenantUsers() : []
  const trustedHosts = isAdmin ? await getTrustedHosts(tenantId) : []
  const defaultPackLanguage = isAdmin ? await getDefaultPackLanguage(tenantId) : 'en'
  const smtpSettings = isAdmin ? await getSmtpSettings(tenantId) : null
  const emailTemplates = isAdmin ? await listEmailTemplates() : []

  // Last manual tenant export timestamp — admin only
  const lastExportAt: Date | null = isAdmin
    ? await (async () => {
        const [row] = await withTenant(tenantId, (tx) =>
          tx
            .select({ createdAt: auditLogs.createdAt })
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.tenantId, tenantId),
                eq(auditLogs.action, 'tenant.exported')
              )
            )
            .orderBy(desc(auditLogs.createdAt))
            .limit(1)
        )
        return row?.createdAt ?? null
      })()
    : null

  // API tokens — available to recruiter+ (not admin-only); fetch for all authenticated users
  const tokensResult = await listApiTokens()
  const apiTokensList = tokensResult.success ? tokensResult.data : []

  // Calendar connections are per-user, not per-tenant — query directly
  const userId = session.user.id
  const calendarConns = await db
    .select({ provider: calendarConnections.provider })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))
  const connectedProviders = new Set(calendarConns.map((c) => c.provider))
  const googleConnected = connectedProviders.has('google')
  const microsoftConnected = connectedProviders.has('microsoft')

  const anthropicConfigured = configuredKeys.includes('anthropic_api_key')
  const googleConfigured = configuredKeys.includes('google_ai_api_key')
  const openaiConfigured = configuredKeys.includes('openai_api_key')
  const braveConfigured = configuredKeys.includes('brave_search_api_key')
  const githubConfigured = configuredKeys.includes('github_token')

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-[var(--color-bg-input)] rounded-lg">
          <SettingsIcon className="h-5 w-5 text-[var(--color-fg-muted)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-fg)]">Settings</h1>
          <p className="text-sm text-[var(--color-fg-subtle)]">Manage API integrations and tenant configuration</p>
        </div>
      </div>

      {/* Account — available to all authenticated users */}
      <div className="mb-10">
        <AccountSection currentName={session.user.name ?? ''} />
      </div>

      {!isAdmin ? (
        <div className="rounded-xl bg-amber-950 border border-amber-800 px-5 py-4">
          <p className="text-sm text-amber-400 font-medium">Admin access required</p>
          <p className="text-xs text-amber-500 mt-0.5">
            Only admins can view and manage API key settings.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* AI Provider Keys */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
              AI Provider Keys
            </h2>
            <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
              Tenant-specific keys override the system environment variables. Keys are encrypted at rest.
            </p>
            <div className="space-y-3">
              <ApiKeyField
                settingKey="anthropic_api_key"
                label="Anthropic (Claude)"
                placeholder="sk-ant-..."
                isConfigured={anthropicConfigured}
              />
              <ApiKeyField
                settingKey="google_ai_api_key"
                label="Google AI (Gemini)"
                placeholder="AIza..."
                isConfigured={googleConfigured}
              />
              <ApiKeyField
                settingKey="openai_api_key"
                label="OpenAI API Key"
                placeholder="sk-proj-..."
                isConfigured={openaiConfigured}
              />
              <ApiKeyField
                settingKey="brave_search_api_key"
                label="Brave Search API Key"
                placeholder="BSA..."
                isConfigured={braveConfigured}
              />
              <ApiKeyField
                settingKey="github_token"
                label="GitHub Token"
                placeholder="github_pat_..."
                isConfigured={githubConfigured}
              />
            </div>

            <div className="mt-4 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)] px-5 py-4">
              <p className="text-xs font-semibold text-[var(--color-fg-muted)] mb-1">Key resolution order</p>
              <ol className="text-xs text-[var(--color-fg-subtle)] space-y-0.5 list-decimal list-inside">
                <li>Tenant-specific key stored here (encrypted in database)</li>
                <li>System environment variable (ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY / etc.)</li>
              </ol>
            </div>
          </div>

          {/* API Tokens */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
              API Tokens
            </h2>
            <ApiTokensPanel
              tokens={apiTokensList}
              currentUserRole={session.user.role ?? 'recruiter'}
            />
          </div>

          {/* General Settings */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
              General Settings
            </h2>
            <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
              Configuration values for this tenant. These are stored as plain text.
            </p>
            <div className="space-y-3">
              <GeneralSettingSelect
                settingKey="default_ai_model"
                label="Default AI Model"
                options={[
                  { value: 'claude', label: 'Claude (Anthropic)' },
                  { value: 'gemini', label: 'Gemini (Google)' },
                ]}
                currentValue={generalSettings['default_ai_model'] ?? 'claude'}
              />
              <GeneralSettingNumber
                settingKey="max_upload_mb"
                label="Upload Size Limit"
                min={1}
                max={50}
                currentValue={generalSettings['max_upload_mb'] ?? '10'}
                unit="MB"
              />
            </div>
          </div>

          {/* Calendar OAuth Credentials */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
              Calendar OAuth Credentials
            </h2>
            <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
              Per-tenant Google and Microsoft OAuth app credentials for the calendar integration.
              Credentials are encrypted at rest and take precedence over deployment env vars.
            </p>
            <OAuthCredentialsForm configuredKeys={configuredKeys} />
          </div>

          {/* Backups & Data Export */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
              Backups &amp; Data Export
            </h2>
            <BackupsPanel lastExportAt={lastExportAt} />
          </div>

          {/* Per-Entity CSV Exports */}
          <div>
            <CsvExportPanel />
          </div>

          {/* Default pack language */}
          <div>
            <DefaultLanguageForm initial={defaultPackLanguage} />
          </div>

          {/* Trusted Hosts */}
          <div>
            <TrustedHostsForm initialHosts={trustedHosts} />
          </div>

          {/* SMTP credentials */}
          {smtpSettings && (
            <div>
              <SmtpSettingsPanel initial={smtpSettings} />
            </div>
          )}

          {/* Email templates */}
          <div>
            <EmailTemplatesPanel
              initial={emailTemplates}
              currentUserRole={session.user.role ?? 'recruiter'}
            />
          </div>

          {/* User Management */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
              User Management
            </h2>
            <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
              Manage users in this tenant. You cannot change your own role or deactivate your own account.
            </p>
            {tenantUsers.length === 0 ? (
              <div className="rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)] px-5 py-4">
                <p className="text-sm text-[var(--color-fg-subtle)]">No users found.</p>
              </div>
            ) : (
              <UserManagementTable
                users={tenantUsers}
                currentUserId={session.user.id}
              />
            )}

            <div className="mt-6 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
              <h3 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-4">
                Create user
              </h3>
              <CreateUserForm />
            </div>
          </div>

          {/* AI Usage & Cost */}
          <div>
            <AiUsagePanel />
          </div>
        </div>
      )}

      {/* Calendar Integration — available to all authenticated users */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide mb-3">
          Calendar Integration
        </h2>
        <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
          Connect your personal calendar to automatically sync interview slots when you schedule them.
          These connections are per-user and only visible to you.
        </p>
        <CalendarConnect
          googleConnected={googleConnected}
          microsoftConnected={microsoftConnected}
        />
      </div>
    </div>
  )
}
