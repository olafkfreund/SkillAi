import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { DashboardMobileShell } from '@/components/layout/dashboard-mobile-shell'
import { Providers } from '@/components/providers'
import { CommandPaletteTrigger } from '@/components/search/command-palette-trigger'

// ─────────────────────────────────────────────────────────────────────────────
// DO NOT REMOVE `export const dynamic = 'force-dynamic'`
// ─────────────────────────────────────────────────────────────────────────────
// Two reasons it must stay:
//  1. Dashboard pages are session-gated; static prerender would never apply to
//     authenticated traffic anyway (no useful caching surface).
//  2. Removing it re-breaks `next build` — the segment hits the same Next 16.2
//     / React 19 prerender useContext-null bug tracked in #41. Fixed-by-
//     workaround across page.tsx + this layout. Upstream fix not yet in 16.2.x.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <Providers>
      <CommandPaletteTrigger userRole={session.user.role} />
      <div className="flex h-screen bg-[var(--color-bg-app)]">
        <Sidebar role={session.user.role} userName={session.user.name ?? ''} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardMobileShell
            userRole={session.user.role}
            userName={session.user.name ?? undefined}
          />
          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto px-4 py-6 lg:px-6 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </Providers>
  )
}
