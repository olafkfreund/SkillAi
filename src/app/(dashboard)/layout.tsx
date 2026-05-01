import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { DashboardMobileShell } from '@/components/layout/dashboard-mobile-shell'
import { Providers } from '@/components/providers'
import { CommandPaletteTrigger } from '@/components/search/command-palette-trigger'

// Dashboard pages all depend on the authenticated session, so they cannot be
// statically prerendered. Marking the segment dynamic also avoids the
// useContext null prerender error in Next 16 / React 19 caused by the
// `next-auth/react` module-scope hook initialization (#41).
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
