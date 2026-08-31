import NextAuth from 'next-auth'
import type { AppRole } from '@/lib/roles'

const developmentSecret = 'prysight-development-only-secret-change-in-production'

function resolveAuthSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.PRYSIGHT_AUTH_SECRET?.trim() ||
    process.env.PRICING_DB_PASSWORD?.trim() ||
    (process.env.NODE_ENV !== 'production' ? developmentSecret : undefined)
  )
}

export const { auth: edgeAuth } = NextAuth({
  trustHost: true,
  secret: resolveAuthSecret(),
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: '/',
    error: '/',
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
