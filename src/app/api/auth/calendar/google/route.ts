// Credential resolution order:
// 1. Per-tenant google_oauth_client_id in tenant_settings (encrypted)
// 2. GOOGLE_CLIENT_ID env var
// 3. 503 "Google OAuth not configured"
//
// Required env vars (fallback):
// GOOGLE_CLIENT_ID=
// NEXT_PUBLIC_APP_URL=http://localhost:3000

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { getOAuthCredentials } from '@/lib/calendar/credentials'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const creds = await getOAuthCredentials(session.user.tenantId, 'google')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!creds) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 503 })
  }

  const state = randomBytes(32).toString('hex')
  const redirectUri = `${appUrl}/api/auth/calendar/google/callback`

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  // Store state in httpOnly cookie (10 min expiry)
  response.cookies.set('calendar_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
