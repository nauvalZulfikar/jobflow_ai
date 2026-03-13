// Lightweight auth config for Edge middleware — NO Prisma, NO Node.js-only modules
import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  providers: [], // providers listed in auth.ts (not needed in middleware)
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/verify-email',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublic =
        nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/verify-email') ||
        nextUrl.pathname.startsWith('/api/auth')

      if (isPublic) return true
      if (!isLoggedIn) return false // will redirect to signIn page
      return true
    },
  },
}
