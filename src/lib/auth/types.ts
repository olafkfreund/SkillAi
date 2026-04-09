/**
 * Next-Auth type augmentation
 *
 * Extends the default Session and JWT types with our custom claims
 * (tenantId, role) so they are available type-safely throughout the app.
 */

import type { DefaultSession } from 'next-auth'

export type UserRole = 'admin' | 'recruiter' | 'viewer'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      tenantId: string
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
    tenantId: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    tenantId: string
  }
}
