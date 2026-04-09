'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq, and, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { encrypt } from '@/lib/crypto'
import type { UserRole } from '@/lib/auth/types'

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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId || !userId) return { success: false, error: 'Unauthorized' }
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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId) return { success: false, error: 'Unauthorized' }
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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id')
  const userRole = headersList.get('x-user-role') as UserRole | null

  if (!tenantId || !userId) return { success: false, error: 'Unauthorized' }
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
