'use server'

/**
 * Server actions for API token management (Epic #105, issue #106).
 *
 * createApiToken  — generates a new token and returns rawToken exactly once
 * revokeApiToken  — soft-deletes by setting revoked_at
 * listApiTokens   — returns metadata only (no secrets)
 *
 * All actions require recruiter+ role. Tenant isolation via withTenant (RLS).
 */

import { eq, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { withTenant } from '@/db'
import { apiTokens } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import { generateApiToken } from '@/lib/api-tokens/format'
import { apiTokenScopes, type ApiTokenScope } from '@/db/schema/api-tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type ApiTokenMetadata = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: Date | null
  lastUsedAt: Date | null
  createdAt: Date
}

export type CreatedApiToken = ApiTokenMetadata & {
  /** Raw token — visible exactly once; not stored in DB */
  rawToken: string
}

// ---------------------------------------------------------------------------
// createApiToken
// ---------------------------------------------------------------------------

export async function createApiToken(params: {
  name: string
  scopes: ApiTokenScope[]
  expiresAt?: Date
}): Promise<ActionResult<CreatedApiToken>> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiter or admin required' }
  }

  // Validate scopes
  const invalidScopes = params.scopes.filter((s) => !apiTokenScopes.includes(s))
  if (invalidScopes.length > 0) {
    return { success: false, error: `Invalid scopes: ${invalidScopes.join(', ')}` }
  }
  if (params.scopes.length === 0) {
    return { success: false, error: 'At least one scope is required' }
  }

  const { rawToken, prefix, hash } = await generateApiToken()

  const [inserted] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(apiTokens)
      .values({
        tenantId,
        userId,
        name: params.name,
        prefix,
        hash,
        scopes: params.scopes,
        expiresAt: params.expiresAt ?? null,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scopes: apiTokens.scopes,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
  )

  await writeAuditLog(tenantId, {
    action: 'api_token.created',
    entityType: 'api_token',
    entityId: inserted.id,
    entityLabel: params.name,
    metadata: { scopes: params.scopes, hasExpiry: !!params.expiresAt },
  })

  revalidatePath('/dashboard/settings/api-tokens')

  return {
    success: true,
    data: {
      ...inserted,
      rawToken,
    },
  }
}

// ---------------------------------------------------------------------------
// revokeApiToken
// ---------------------------------------------------------------------------

export async function revokeApiToken(tokenId: string): Promise<ActionResult<void>> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiter or admin required' }
  }

  const [token] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: apiTokens.id, name: apiTokens.name, revokedAt: apiTokens.revokedAt })
      .from(apiTokens)
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.tenantId, tenantId)))
      .limit(1)
  )

  if (!token) return { success: false, error: 'Token not found' }
  if (token.revokedAt) return { success: false, error: 'Token already revoked' }

  await withTenant(tenantId, async (tx) =>
    tx
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, tokenId), isNull(apiTokens.revokedAt)))
  )

  await writeAuditLog(tenantId, {
    action: 'api_token.revoked',
    entityType: 'api_token',
    entityId: tokenId,
    entityLabel: token.name,
    metadata: { tokenId },
  })

  revalidatePath('/dashboard/settings/api-tokens')
  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// listApiTokens
// ---------------------------------------------------------------------------

export async function listApiTokens(): Promise<ActionResult<ApiTokenMetadata[]>> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiter or admin required' }
  }

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scopes: apiTokens.scopes,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(and(eq(apiTokens.tenantId, tenantId), isNull(apiTokens.revokedAt)))
      .orderBy(apiTokens.createdAt)
  )

  return { success: true, data: rows }
}
