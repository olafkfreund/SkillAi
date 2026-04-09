// Required env vars:
// MICROSOFT_CLIENT_ID=
// MICROSOFT_TENANT_ID=common   (or specific tenant GUID)
// NEXT_PUBLIC_APP_URL=http://localhost:3000

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!clientId) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 503 })
  }

  const state = randomBytes(32).toString('hex')
  const redirectUri = `${appUrl}/api/auth/calendar/microsoft/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
    state,
  })

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`

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
