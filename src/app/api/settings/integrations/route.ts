import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'

const ALLOWED_KEYS = ['anthropic_api_key', 'google_ai_api_key'] as const

export async function GET() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, updatedAt: tenantSettings.updatedAt })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
  )

  // Return which keys are configured (never the values)
  const configured = rows
    .filter((r) => ALLOWED_KEYS.includes(r.key as (typeof ALLOWED_KEYS)[number]))
    .map((r) => ({ key: r.key, updatedAt: r.updatedAt }))

  return NextResponse.json({ configured })
}
