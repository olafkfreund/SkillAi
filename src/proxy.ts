/**
 * Next.js middleware — auth + tenant context forwarding
 *
 * Protects:
 *  - /(dashboard)/* — all dashboard routes
 *  - /api/(candidates|roles|agencies|export|settings)/* — all data API routes
 *
 * On authenticated requests:
 *  - Forwards x-tenant-id and x-user-role as request headers
 *  - These headers are consumed by Server Actions and API route handlers
 *    to set the RLS context via withTenant()
 *
 * On unauthenticated requests:
 *  - Dashboard routes → redirect to /login
 *  - API routes → 401 JSON response
 */

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const DASHBOARD_PATTERN = /^\/(dashboard|settings)/
const API_PROTECTED_PATTERN = /^\/api\/(candidates|roles|agencies|export|settings|interview-packs|extract|transcripts)/

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  const isDashboard = DASHBOARD_PATTERN.test(pathname)
  const isProtectedApi = API_PROTECTED_PATTERN.test(pathname)

  if (!isDashboard && !isProtectedApi) {
    return NextResponse.next()
  }

  if (!session?.user?.tenantId) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Force password change for users with passwordResetRequired === true.
  // Allow them to reach /settings (where the change-password form lives)
  // and the auth API; everything else dashboard-side redirects to settings.
  const mustResetPassword =
    (session.user as { passwordResetRequired?: boolean }).passwordResetRequired === true
  if (mustResetPassword && isDashboard && !pathname.startsWith('/settings')) {
    const url = new URL('/settings#change-password', req.url)
    return NextResponse.redirect(url)
  }

  // Forward tenant + role as request headers for downstream handlers
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-tenant-id', session.user.tenantId)
  requestHeaders.set('x-user-role', session.user.role ?? 'viewer')
  requestHeaders.set('x-user-id', session.user.id ?? '')

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/settings/:path*',
    '/api/candidates/:path*',
    '/api/roles/:path*',
    '/api/agencies/:path*',
    '/api/export/:path*',
    '/api/settings/:path*',
    '/api/interview-packs/:path*',
    '/api/extract/:path*',
    '/api/transcripts/:path*',
  ],
}
