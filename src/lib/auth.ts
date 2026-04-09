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

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        token.id = user.id
        token.role = (user as { role: string }).role
        token.tenantId = (user as { tenantId: string }).tenantId
      }
      return token
    },

    // Expose custom claims on the session object
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        ;(session.user as { role: string }).role = token.role as string
        ;(session.user as { tenantId: string }).tenantId = token.tenantId as string
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
  },
})
