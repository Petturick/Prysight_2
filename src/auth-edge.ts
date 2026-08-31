import NextAuth from 'next-auth'
import type { AppRole } from '@/lib/roles'

const developmentSecret = 'prysight-development-only-secret-change-in-production'

export const { auth: edgeAuth } = NextAuth({
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : developmentSecret),
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: '/',
  },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? token.sub ?? '')
        session.user.role = (token.role ?? 'READONLY') as AppRole
        session.user.companyId = String(token.companyId ?? '')
        session.user.membershipRole = (token.membershipRole ?? 'READONLY') as 'OWNER' | 'ADMIN' | 'ANALYST' | 'READONLY'
      }
      return session
    },
  },
})
