import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import type { AppRole } from '@/lib/roles'
import { verifySupabasePassword } from '@/lib/supabase-auth'

type DatabaseAuthUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  role: 'ADMIN' | 'ANALYST' | 'READONLY'
  isSuperAdmin: boolean
  companyId: string | null
  membershipRole: 'OWNER' | 'ADMIN' | 'ANALYST' | 'READONLY' | null
  hasSupabaseAuth: boolean
}

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

export const { auth, handlers, signIn, signOut } = NextAuth({
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
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mailadres', type: 'email' },
        password: { label: 'Wachtwoord', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials.password === 'string' ? credentials.password : ''

        if (!email || !password) return null

        const users = await prisma.$queryRaw<DatabaseAuthUser[]>`
          SELECT
            u.id,
            u.email,
            u.name,
            u.password_hash AS "passwordHash",
            u.role::text AS role,
            COALESCE(u.is_super_admin, false) AS "isSuperAdmin",
            cm.company_id AS "companyId",
            cm.role::text AS "membershipRole",
            EXISTS (
              SELECT 1
              FROM auth.users au
              WHERE lower(au.email) = lower(u.email)
            ) AS "hasSupabaseAuth"
          FROM users u
          LEFT JOIN company_memberships cm
            ON cm.user_id = u.id
           AND cm.is_active = true
          LEFT JOIN companies c
            ON c.id = cm.company_id
           AND c.status = 'ACTIVE'
          WHERE lower(u.email) = lower(${email})
            AND u.id <> 'system_pricing'
            AND c.id IS NOT NULL
          ORDER BY cm.created_at ASC
          LIMIT 1
        `

        const user = users[0]
        if (!user || !user.companyId || !user.membershipRole) return null

        const localPasswordMatches = await bcrypt.compare(password, user.passwordHash)
        let passwordMatches = localPasswordMatches
        if (!passwordMatches && user.hasSupabaseAuth) {
          passwordMatches = (await verifySupabasePassword(email, password)) === 'valid'
        }

        if (!passwordMatches) return null

        const role: AppRole = user.isSuperAdmin ? 'SUPER_ADMIN' : user.role

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role,
          companyId: user.companyId,
          membershipRole: user.membershipRole,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.role = user.role
        token.companyId = user.companyId
        token.membershipRole = user.membershipRole
      }
      return token
    },
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
