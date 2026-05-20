'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, inArray, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant, db } from '@/db'
import { tenantSettings, users } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { encrypt } from '@/lib/crypto'
import { getActionContext } from '@/lib/auth/action-context'
import { emitAudit } from '@/lib/audit-middleware'
import { isSupportedLanguage } from '@/lib/ai/language'
import { getSenderForTenant } from '@/lib/email/sender'
import { testWebhookDelivery, type NotificationTestResult } from '@/lib/notifications/dispatcher'
// NOTE: NotificationTestResult is intentionally NOT re-exported here. This file
// has 'use server' which restricts exports to async functions. Consumers must
// import the type directly from '@/lib/notifications/dispatcher'.

const ALLOWED_KEYS = [
  'anthropic_api_key',
  'brave_search_api_key',
  'github_token',
  'google_ai_api_key',
  'google_oauth_client_id',
  'google_oauth_client_secret',
  'microsoft_oauth_client_id',
  'microsoft_oauth_client_secret',
  'microsoft_oauth_tenant_id',
  'openai_api_key',
] as const
type SettingKey = (typeof ALLOWED_KEYS)[number]

// Keys that belong to OAuth credential groups — used to emit targeted audit events.
const OAUTH_KEY_META: Record<string, { provider: 'google' | 'microsoft'; field: 'client_id' | 'client_secret' | 'tenant_id' }> = {
  google_oauth_client_id:     { provider: 'google',    field: 'client_id' },
  google_oauth_client_secret: { provider: 'google',    field: 'client_secret' },
  microsoft_oauth_client_id:     { provider: 'microsoft', field: 'client_id' },
  microsoft_oauth_client_secret: { provider: 'microsoft', field: 'client_secret' },
  microsoft_oauth_tenant_id:     { provider: 'microsoft', field: 'tenant_id' },
}

const GENERAL_KEYS = ['default_ai_model', 'max_upload_mb'] as const
type GeneralKey = (typeof GENERAL_KEYS)[number]

const SaveKeySchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().min(1, 'API key cannot be empty').max(500),
})

export type SettingsState =
  | { success: true }
  | { success: false; error: string }

export async function saveApiKey(
  _prev: SettingsState | null,
  formData: FormData
): Promise<SettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage API keys' }
  }

  const parsed = SaveKeySchema.safeParse({
    key: formData.get('key'),
    value: formData.get('value'),
  })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { key, value } = parsed.data
  const encryptedValue = encrypt(value)

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key, value: encryptedValue, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: encryptedValue, updatedBy: userId, updatedAt: new Date() },
      })
  })

  // Emit targeted audit event for OAuth credential writes
  const oauthMeta = OAUTH_KEY_META[key]
  if (oauthMeta) {
    emitAudit(tenantId, {
      action: 'settings.oauth_credentials_updated',
      entityType: 'settings',
      metadata: { provider: oauthMeta.provider, field: oauthMeta.field },
    })
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function removeApiKey(
  _prev: SettingsState | null,
  formData: FormData
): Promise<SettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage API keys' }
  }

  const key = formData.get('key')?.toString()
  if (!key || !ALLOWED_KEYS.includes(key as SettingKey)) {
    return { success: false, error: 'Invalid key' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)))
  })

  // Emit targeted audit event for OAuth credential removals
  const oauthMeta = OAUTH_KEY_META[key]
  if (oauthMeta) {
    emitAudit(tenantId, {
      action: 'settings.oauth_credentials_removed',
      entityType: 'settings',
      metadata: { provider: oauthMeta.provider, field: oauthMeta.field },
    })
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function getConfiguredKeys(tenantId: string): Promise<SettingKey[]> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
  )
  return rows
    .map((r) => r.key)
    .filter((k): k is SettingKey => ALLOWED_KEYS.includes(k as SettingKey))
}

// ---------------------------------------------------------------------------
// General settings (non-encrypted config values)
// ---------------------------------------------------------------------------

export type GeneralSettingsState = {
  success: boolean
  error?: string
}

const GeneralSettingSchema = z.object({
  key: z.enum(GENERAL_KEYS),
  value: z.string().min(1, 'Value cannot be empty').max(50),
})

export async function saveGeneralSetting(
  key: GeneralKey,
  _prev: GeneralSettingsState | null,
  formData: FormData
): Promise<GeneralSettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage settings' }
  }

  const parsed = GeneralSettingSchema.safeParse({
    key,
    value: formData.get('value'),
  })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  // Store plain text — not a secret
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key: parsed.data.key, value: parsed.data.value, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: parsed.data.value, updatedBy: userId, updatedAt: new Date() },
      })
  })

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function getGeneralSettings(tenantId: string): Promise<Record<string, string>> {
  const allApiKeys = [...ALLOWED_KEYS] as string[]
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          notInArray(tenantSettings.key, allApiKeys)
        )
      )
  )

  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// ---------------------------------------------------------------------------
// Trusted hosts (plain JSON list of hostnames the auth system trusts)
// Stored under tenant_settings.key = 'trusted_hosts'. Hosts are not secrets,
// so the value is plain JSON — no encrypt() wrap.
// ---------------------------------------------------------------------------

// Module-internal constants — must NOT be exported from a 'use server' file
// (Next.js requires every export to be an async function).
const TRUSTED_HOSTS_KEY = 'trusted_hosts'
const MAX_TRUSTED_HOSTS = 20
const MAX_HOSTNAME_LENGTH = 253
// RFC1123-ish hostname regex (lowercased): each label 1-63 chars, alnum + hyphen,
// labels separated by dots. Does not validate IPs — those are always-trusted
// fallbacks (localhost, 127.0.0.1) and don't need to be entered here.
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

export type TrustedHostsState =
  | { success: true }
  | { success: false; error: string }

export async function saveTrustedHosts(
  hostnames: string[]
): Promise<TrustedHostsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage trusted hosts' }
  }

  if (!Array.isArray(hostnames)) {
    return { success: false, error: 'Hostnames must be a list' }
  }

  // Normalise: trim + lowercase + drop empties + dedupe (case-insensitive)
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of hostnames) {
    if (typeof raw !== 'string') continue
    const host = raw.trim().toLowerCase()
    if (!host) continue
    if (seen.has(host)) continue
    seen.add(host)
    cleaned.push(host)
  }

  for (const host of cleaned) {
    if (host.length > MAX_HOSTNAME_LENGTH) {
      return { success: false, error: `Hostname too long: ${host}` }
    }
    if (!HOSTNAME_RE.test(host)) {
      return { success: false, error: `Invalid hostname: ${host}` }
    }
  }

  if (cleaned.length > MAX_TRUSTED_HOSTS) {
    return { success: false, error: `Maximum ${MAX_TRUSTED_HOSTS} trusted hosts.` }
  }

  // Compute diff for audit metadata
  const previous = await getTrustedHosts(tenantId)
  const added = cleaned.filter((h) => !previous.includes(h))
  const removed = previous.filter((h) => !cleaned.includes(h))

  const serialised = JSON.stringify(cleaned)

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key: TRUSTED_HOSTS_KEY, value: serialised, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: serialised, updatedBy: userId, updatedAt: new Date() },
      })
  })

  if (added.length > 0 || removed.length > 0) {
    emitAudit(tenantId, {
      action: 'settings.trusted_hosts_updated',
      entityType: 'settings',
      metadata: { added, removed },
    })
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function getTrustedHosts(tenantId: string): Promise<string[]> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.key, TRUSTED_HOSTS_KEY)
        )
      )
      .limit(1)
  )
  if (rows.length === 0) return []
  try {
    const parsed = JSON.parse(rows[0].value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((h): h is string => typeof h === 'string')
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Default pack language (tenant-wide fallback for interview/screening pack
// generation when the candidate has no language preference). Stored as plain
// text under tenant_settings.key = 'default_pack_language' — a BCP 47 short
// code from SUPPORTED_LANGUAGES (en, pl, de, ...).
// ---------------------------------------------------------------------------

const DEFAULT_PACK_LANGUAGE_KEY = 'default_pack_language'

export async function saveDefaultPackLanguage(
  language: string
): Promise<TrustedHostsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can set the default pack language' }
  }

  if (!isSupportedLanguage(language)) {
    return { success: false, error: 'Unsupported language code' }
  }

  // Read previous for audit diff
  const previous = await getDefaultPackLanguage(tenantId)

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key: DEFAULT_PACK_LANGUAGE_KEY, value: language, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: language, updatedBy: userId, updatedAt: new Date() },
      })
  })

  if (previous !== language) {
    emitAudit(tenantId, {
      action: 'settings.default_pack_language_updated',
      entityType: 'settings',
      metadata: { setting: DEFAULT_PACK_LANGUAGE_KEY, previous, current: language },
    })
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function getDefaultPackLanguage(tenantId: string): Promise<string> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.key, DEFAULT_PACK_LANGUAGE_KEY)
        )
      )
      .limit(1)
  )
  const value = rows[0]?.value
  return isSupportedLanguage(value) ? value : 'en'
}

// ---------------------------------------------------------------------------
// HR Skill settings (per-tenant AI Behaviour toggle + skill profile selector)
// Stored as plain-text key-value rows in tenant_settings (not encrypted — not
// a secret). Default: enabled=false, profile='recruiter-eu-uk'.
// ---------------------------------------------------------------------------

const HR_SKILL_ENABLED_KEY = 'hr_skill_enabled'
const HR_SKILL_PROFILE_KEY = 'hr_skill_profile'

import { HR_SKILL_PROFILES, type HrSkillProfile } from '@/lib/ai/skills/profiles'

const HrSkillSettingsSchema = z.object({
  enabled: z.boolean(),
  profile: z.enum(HR_SKILL_PROFILES),
})

export type HrSkillSettingsState =
  | { success: true }
  | { success: false; error: string }

export type HrSkillSettingsRecord = {
  enabled: boolean
  profile: HrSkillProfile
}

export async function updateHrSkillSettings(
  enabled: boolean,
  profile: HrSkillProfile
): Promise<HrSkillSettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage AI behaviour settings' }
  }

  const parsed = HrSkillSettingsSchema.safeParse({ enabled, profile })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key: HR_SKILL_ENABLED_KEY, value: String(parsed.data.enabled), updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: String(parsed.data.enabled), updatedBy: userId, updatedAt: new Date() },
      })
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key: HR_SKILL_PROFILE_KEY, value: parsed.data.profile, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: parsed.data.profile, updatedBy: userId, updatedAt: new Date() },
      })
  })

  emitAudit(tenantId, {
    action: 'settings.hr_skill_toggled',
    entityType: 'settings',
    metadata: { enabled: parsed.data.enabled, profile: parsed.data.profile },
  })

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function getHrSkillSettings(tenantId: string): Promise<HrSkillSettingsRecord> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          inArray(tenantSettings.key, [HR_SKILL_ENABLED_KEY, HR_SKILL_PROFILE_KEY])
        )
      )
  )
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const rawProfile = m.get(HR_SKILL_PROFILE_KEY)
  const profile: HrSkillProfile = HR_SKILL_PROFILES.includes(rawProfile as HrSkillProfile)
    ? (rawProfile as HrSkillProfile)
    : 'recruiter-eu-uk'
  return {
    enabled: (m.get(HR_SKILL_ENABLED_KEY) ?? 'false') === 'true',
    profile,
  }
}

// ---------------------------------------------------------------------------
// SMTP settings
// ---------------------------------------------------------------------------

const SMTP_KEYS = [
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_pass',
  'smtp_from_email',
  'smtp_from_name',
] as const
type SmtpKey = (typeof SMTP_KEYS)[number]

export type SmtpSettingsState =
  | { success: true }
  | { success: false; error: string }

/**
 * Saves a single SMTP setting. smtp_pass is encrypted; all others are stored
 * as plain text. Validates the key is in the smtp_* set before writing.
 */
export async function saveSmtpSetting(
  key: string,
  value: string
): Promise<SmtpSettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage SMTP settings' }
  }

  if (!SMTP_KEYS.includes(key as SmtpKey)) {
    return { success: false, error: 'Invalid SMTP setting key' }
  }

  if (!value || value.trim().length === 0) {
    return { success: false, error: 'Value cannot be empty' }
  }

  const storedValue = key === 'smtp_pass' ? encrypt(value) : value.trim()

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key, value: storedValue, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: storedValue, updatedBy: userId, updatedAt: new Date() },
      })
  })

  emitAudit(tenantId, {
    action: 'settings.smtp_updated',
    entityType: 'settings',
    metadata: { key },
  })

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export type SmtpSettingsRecord = {
  smtp_host: string
  smtp_port: string
  smtp_secure: string
  smtp_user: string
  smtp_from_email: string
  smtp_from_name: string
  smtp_pass_configured: boolean
}

/**
 * Returns SMTP settings for the given tenant. smtp_pass is never returned —
 * only a boolean indicating whether it is configured.
 */
export async function getSmtpSettings(tenantId: string): Promise<SmtpSettingsRecord> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
  )

  const map: Record<string, string> = {}
  for (const row of rows) {
    if (SMTP_KEYS.includes(row.key as SmtpKey)) {
      map[row.key] = row.value
    }
  }

  return {
    smtp_host: map['smtp_host'] ?? '',
    smtp_port: map['smtp_port'] ?? '587',
    smtp_secure: map['smtp_secure'] ?? 'false',
    smtp_user: map['smtp_user'] ?? '',
    smtp_from_email: map['smtp_from_email'] ?? '',
    smtp_from_name: map['smtp_from_name'] ?? '',
    smtp_pass_configured: Boolean(map['smtp_pass']),
  }
}

// ---------------------------------------------------------------------------
// SMTP test send
// ---------------------------------------------------------------------------

/**
 * Sends a test email to the current user's address using the tenant's
 * stored SMTP credentials. Reports success or a descriptive error inline.
 */
export async function sendSmtpTestEmail(): Promise<SmtpSettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can send test emails' }
  }

  const sender = await getSenderForTenant(tenantId)
  if (!sender) {
    return { success: false, error: 'SMTP is not fully configured. Set host, user, password, and from address first.' }
  }

  // Look up the current user's email address
  const [userRow] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!userRow?.email) {
    return { success: false, error: 'Could not determine your email address.' }
  }

  const result = await sender.send({
    to: userRow.email,
    toName: userRow.name,
    from: '',      // sender.ts uses fromEmail from config
    fromName: '',  // same — ignored by SmtpSender
    subject: 'SkillAI — SMTP test message',
    bodyHtml: '<p>Your SMTP configuration is working correctly.</p>',
    bodyText: 'Your SMTP configuration is working correctly.',
  })

  if (!result.ok) {
    return { success: false, error: result.error }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Notification settings (Slack / Teams webhooks + per-event toggles)
// ---------------------------------------------------------------------------

const NOTIFICATION_KEYS = [
  'slack_webhook_url',
  'teams_webhook_url',
  'notify_high_score_enabled',
  'notify_manager_decision_enabled',
  'notify_score_threshold',
] as const
type NotificationKey = (typeof NOTIFICATION_KEYS)[number]

// Keys that are encrypted before storage (webhook URLs contain bearer secrets)
const ENCRYPTED_NOTIFICATION_KEYS = new Set<string>(['slack_webhook_url', 'teams_webhook_url'])

export type NotificationSettingsState =
  | { success: true }
  | { success: false; error: string }

/**
 * Saves a single notification setting for the current tenant.
 *
 * Webhook URL keys (slack_webhook_url, teams_webhook_url) are encrypted with
 * the same AES-256-GCM scheme used for SMTP passwords and API keys.
 * Toggle and threshold keys are stored as plain text.
 */
export async function saveNotificationSetting(
  key: string,
  value: string
): Promise<NotificationSettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage notification settings' }
  }

  if (!NOTIFICATION_KEYS.includes(key as NotificationKey)) {
    return { success: false, error: 'Invalid notification setting key' }
  }

  if (!value || value.trim().length === 0) {
    return { success: false, error: 'Value cannot be empty' }
  }

  const storedValue = ENCRYPTED_NOTIFICATION_KEYS.has(key) ? encrypt(value.trim()) : value.trim()

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key, value: storedValue, updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: storedValue, updatedBy: userId, updatedAt: new Date() },
      })
  })

  emitAudit(tenantId, {
    action: 'settings.notification_updated',
    entityType: 'settings',
    metadata: { key },
  })

  revalidatePath('/dashboard/settings')
  return { success: true }
}

/**
 * Removes a single notification setting for the current tenant.
 */
export async function removeNotificationSetting(
  key: string
): Promise<NotificationSettingsState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return { success: false, error: 'Only admins can manage notification settings' }
  }

  if (!NOTIFICATION_KEYS.includes(key as NotificationKey)) {
    return { success: false, error: 'Invalid notification setting key' }
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)))
  })

  emitAudit(tenantId, {
    action: 'settings.notification_updated',
    entityType: 'settings',
    metadata: { key, removed: true },
  })

  revalidatePath('/dashboard/settings')
  return { success: true }
}

/**
 * Sends a test message to all configured Slack / Teams webhooks and returns
 * the per-channel result. Intended for the settings UI "Send test message"
 * button — Agent B's component calls this action directly.
 */
export async function testNotificationDelivery(): Promise<NotificationTestResult> {
  const ctx = await getActionContext()
  if (!ctx) {
    return {
      slack: { configured: false, ok: false, error: 'Unauthorized' },
      teams: { configured: false, ok: false, error: 'Unauthorized' },
    }
  }

  const { tenantId, userRole } = ctx

  try { requireRole(userRole ?? undefined, 'admin') } catch {
    return {
      slack: { configured: false, ok: false, error: 'Forbidden' },
      teams: { configured: false, ok: false, error: 'Forbidden' },
    }
  }

  return testWebhookDelivery(tenantId)
}

/**
 * Reads the current notification settings for the tenant. Returns boolean flags
 * for whether webhook URLs are configured (NEVER returns the decrypted URLs to
 * the client), plus the toggle + threshold values. Used by the settings page
 * to seed the NotificationsPanel props.
 */
export type NotificationSettingsRecord = {
  slack_webhook_configured: boolean
  teams_webhook_configured: boolean
  notify_high_score_enabled: boolean
  notify_manager_decision_enabled: boolean
  notify_score_threshold: number
}

export async function getNotificationSettings(): Promise<NotificationSettingsRecord> {
  const fallback: NotificationSettingsRecord = {
    slack_webhook_configured: false,
    teams_webhook_configured: false,
    notify_high_score_enabled: true,
    notify_manager_decision_enabled: true,
    notify_score_threshold: 85,
  }

  const ctx = await getActionContext()
  if (!ctx) return fallback
  const { tenantId, userRole } = ctx
  try { requireRole(userRole ?? undefined, 'admin') } catch { return fallback }

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, tenantId), inArray(tenantSettings.key, NOTIFICATION_KEYS as unknown as string[])))
  )

  const m = new Map(rows.map((r) => [r.key, r.value]))

  return {
    slack_webhook_configured: m.has('slack_webhook_url'),
    teams_webhook_configured: m.has('teams_webhook_url'),
    notify_high_score_enabled: (m.get('notify_high_score_enabled') ?? 'true') === 'true',
    notify_manager_decision_enabled: (m.get('notify_manager_decision_enabled') ?? 'true') === 'true',
    notify_score_threshold: parseInt(m.get('notify_score_threshold') ?? '85', 10) || 85,
  }
}
