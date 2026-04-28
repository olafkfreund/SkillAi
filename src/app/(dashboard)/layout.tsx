import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Providers } from '@/components/providers'

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
      <div className="flex h-screen bg-zinc-950">
        <Sidebar role={session.user.role} userName={session.user.name ?? ''} />
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </Providers>
  )
}
