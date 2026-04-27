import { notFound } from 'next/navigation'
import { SettingsIcon } from 'lucide-react'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { calendarConnections } from '@/db/schema'
import {
  getConfiguredKeys,
  getGeneralSettings,
  getTrustedHosts,
} from '@/actions/settings'
import { listTenantUsers } from '@/actions/users'
import { ApiKeyField } from '@/components/settings/api-key-field'
import { GeneralSettingSelect } from '@/components/settings/general-setting-select'
import { GeneralSettingNumber } from '@/components/settings/general-setting-number'
import { UserManagementTable } from '@/components/settings/user-management-table'
import { CalendarConnect } from '@/components/settings/calendar-connect'
import { AccountSection } from '@/components/settings/account-section'
import { CreateUserForm } from '@/components/settings/create-user-form'
import { TrustedHostsForm } from '@/components/settings/trusted-hosts-form'
import { AiUsagePanel } from '@/components/settings/ai-usage-panel'

export default async function SettingsPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const isAdmin = session?.user.role === 'admin'
  const configuredKeys = isAdmin ? await getConfiguredKeys(tenantId) : []
  const generalSettings = isAdmin ? await getGeneralSettings(tenantId) : {}
  const tenantUsers = isAdmin ? await listTenantUsers() : []
  const trustedHosts = isAdmin ? await getTrustedHosts(tenantId) : []

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
        <div className="p-2 bg-zinc-800 rounded-lg">
          <SettingsIcon className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Settings</h1>
          <p className="text-sm text-zinc-500">Manage API integrations and tenant configuration</p>
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
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
              AI Provider Keys
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
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

            <div className="mt-4 rounded-xl bg-zinc-800 border border-zinc-700 px-5 py-4">
              <p className="text-xs font-semibold text-zinc-400 mb-1">Key resolution order</p>
              <ol className="text-xs text-zinc-500 space-y-0.5 list-decimal list-inside">
                <li>Tenant-specific key stored here (encrypted in database)</li>
                <li>System environment variable (ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY / etc.)</li>
              </ol>
            </div>
          </div>

          {/* General Settings */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
              General Settings
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
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

          {/* Trusted Hosts */}
          <div>
            <TrustedHostsForm initialHosts={trustedHosts} />
          </div>

          {/* User Management */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
              User Management
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Manage users in this tenant. You cannot change your own role or deactivate your own account.
            </p>
            {tenantUsers.length === 0 ? (
              <div className="rounded-xl bg-zinc-800 border border-zinc-700 px-5 py-4">
                <p className="text-sm text-zinc-500">No users found.</p>
              </div>
            ) : (
              <UserManagementTable
                users={tenantUsers}
                currentUserId={session.user.id}
              />
            )}

            <div className="mt-6 bg-zinc-900 rounded-xl border border-zinc-700 p-6">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
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
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          Calendar Integration
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
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
