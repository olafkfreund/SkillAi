import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasRole } from '@/lib/auth/require-role'
import { getAutoMatchStatus } from '@/actions/auto-match-status'

/**
 * Poll endpoint backing the ArchiveMatchesPanel (epic #267 / issue #271).
 *
 * Recruiter+ only — the response carries rate-match annotations and
 * candidate identities derived from internal data (prior customer
 * rejections). Defence-in-depth alongside the panel's audience gate.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userRole = (session.user as { role?: string }).role
  if (!hasRole((userRole ?? 'viewer') as 'admin' | 'recruiter' | 'hiring_manager' | 'viewer', 'recruiter')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { roleId } = await params
  const result = await getAutoMatchStatus(roleId)
  return NextResponse.json(result)
}
