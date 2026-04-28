'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { encrypt } from '@/lib/crypto'
import { getActionContext } from '@/lib/auth/action-context'
import { writeAuditLog } from '@/lib/audit'
import { isSupportedLanguage } from '@/lib/ai/language'

const ALLOWED_KEYS = [
  'anthropic_api_key',
  'google_ai_api_key',
  'openai_api_key',
  'brave_search_api_key',
  'github_token',
] as const
type SettingKey = (typeof ALLOWED_KEYS)[number]

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
    writeAuditLog(tenantId, {
      action: 'settings.trusted_hosts_updated',
      entityType: 'settings',
      metadata: { added, removed },
    }).catch(() => {})
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
    writeAuditLog(tenantId, {
      action: 'settings.default_pack_language_updated',
      entityType: 'settings',
      metadata: { setting: DEFAULT_PACK_LANGUAGE_KEY, previous, current: language },
    }).catch(() => {})
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
