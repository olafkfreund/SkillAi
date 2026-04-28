// Credential resolution order:
// 1. Per-tenant microsoft_oauth_client_id / microsoft_oauth_client_secret /
//    microsoft_oauth_tenant_id in tenant_settings (encrypted)
// 2. MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID env vars
// 3. microsoft_oauth_tenant_id falls back to 'common' when not set in either source
// 4. 503 "Microsoft OAuth not configured" when client_id + client_secret absent
//
// Required env vars (fallback):
// MICROSOFT_CLIENT_ID=
// MICROSOFT_TENANT_ID=common   (or specific tenant GUID)
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

  const creds = await getOAuthCredentials(session.user.tenantId, 'microsoft')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!creds) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 503 })
  }

  const state = randomBytes(32).toString('hex')
  const redirectUri = `${appUrl}/api/auth/calendar/microsoft/callback`

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
    state,
  })

  const authUrl = `https://login.microsoftonline.com/${creds.microsoftTenantId}/oauth2/v2.0/authorize?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('calendar_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
