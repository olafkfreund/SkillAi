import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'

const ALLOWED_KEYS = ['anthropic_api_key', 'google_ai_api_key'] as const

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

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
