/**
 * Auth.js v5 configuration
 *
 * Uses credentials provider (email + password) with JWT sessions.
 * Tenant ID and role are embedded in the JWT so every request has
 * the necessary context without an extra DB round-trip.
 */

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authorizeUser } from '@/lib/auth/authorize'
import type { UserRole } from '@/lib/auth/types'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        return authorizeUser(
          credentials.email as string,
          credentials.password as string
        )
      },
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    // Embed custom claims into the JWT on sign-in
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id?: string
          role: UserRole
          tenantId: string
          passwordResetRequired?: boolean
        }
        token.id = u.id
        token.role = u.role
        token.tenantId = u.tenantId
        token.passwordResetRequired = u.passwordResetRequired ?? false
      }
      return token
    },

    // Expose custom claims on the session object
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = (token.role ?? 'viewer') as UserRole
        session.user.tenantId = (token.tenantId ?? '') as string
        session.user.passwordResetRequired = token.passwordResetRequired ?? false
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
  },
})
