// Required env vars:
// GOOGLE_CLIENT_ID=
// GOOGLE_CLIENT_SECRET=
// NEXT_PUBLIC_APP_URL=http://localhost:3000

import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { calendarConnections } from '@/db/schema'

interface GoogleTokenResponse {
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
      new URL('/dashboard/settings?error=calendar_state_mismatch', req.url)
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/auth/calendar/google/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=calendar_not_configured', req.url)
    )
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=calendar_token_exchange_failed', req.url)
    )
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse
  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)

  // Upsert into calendar_connections
  const existing = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, session.user.id),
        eq(calendarConnections.provider, 'google')
      )
    )
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(calendarConnections)
      .set({
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        tokenExpiry,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarConnections.userId, session.user.id),
          eq(calendarConnections.provider, 'google')
        )
      )
  } else {
    await db.insert(calendarConnections).values({
      userId: session.user.id,
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiry,
      calendarId: 'primary',
    })
  }

  const response = NextResponse.redirect(
    new URL('/dashboard/settings?calendarConnected=google', req.url)
  )
  // Clear state cookie
  response.cookies.delete('calendar_oauth_state')

  return response
}
