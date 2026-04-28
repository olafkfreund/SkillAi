// Required env vars:
// MICROSOFT_CLIENT_ID=
// MICROSOFT_CLIENT_SECRET=
// MICROSOFT_TENANT_ID=common
// NEXT_PUBLIC_APP_URL=http://localhost:3000

import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { calendarConnections } from '@/db/schema'
import { encrypt } from '@/lib/crypto'

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user.id) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const storedState = req.cookies.get('calendar_oauth_state')?.value

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL('/settings?error=calendar_state_mismatch', req.url)
    )
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/auth/calendar/microsoft/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/settings?error=calendar_not_configured', req.url)
    )
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      }),
    }
  )

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL('/settings?error=calendar_token_exchange_failed', req.url)
    )
  }

  const tokens = (await tokenRes.json()) as MicrosoftTokenResponse
  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)

  // Upsert into calendar_connections
  const existing = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, session.user.id),
        eq(calendarConnections.provider, 'microsoft')
      )
    )
    .limit(1)

  const encryptedAccess = encrypt(tokens.access_token)
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null

  if (existing.length > 0) {
    await db
      .update(calendarConnections)
      .set({
        accessToken: encryptedAccess,
        ...(encryptedRefresh ? { refreshToken: encryptedRefresh } : {}),
        tokenExpiry,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarConnections.userId, session.user.id),
          eq(calendarConnections.provider, 'microsoft')
        )
      )
  } else {
    await db.insert(calendarConnections).values({
      userId: session.user.id,
      provider: 'microsoft',
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiry,
    })
  }

  const response = NextResponse.redirect(
    new URL('/settings?calendarConnected=microsoft', req.url)
  )
  response.cookies.delete('calendar_oauth_state')

  return response
}
