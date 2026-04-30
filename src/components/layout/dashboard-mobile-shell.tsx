'use client'

import { useState } from 'react'
import { TopAppBar } from './top-app-bar'
import { MobileDrawer } from './mobile-drawer'
import type { UserRole } from '@/lib/auth/types'

// Mobile/tablet shell: renders the top app bar + drawer (both `lg:hidden` so
// they vanish on desktop). Holds the drawer's open state on the client. The
// dashboard server layout still owns auth + the desktop sidebar; this shell
// only adds the mobile chrome alongside.
type Props = {
  userRole: UserRole
  userName?: string
}

export function DashboardMobileShell({ userRole, userName }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <TopAppBar onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userRole={userRole}
        userName={userName}
      />
    </>
  )
}
