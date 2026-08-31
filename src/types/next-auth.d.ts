import type { DefaultSession } from 'next-auth'
import type { AppRole } from '@/lib/roles'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: AppRole
      companyId: string
      membershipRole: 'OWNER' | 'ADMIN' | 'ANALYST' | 'READONLY'
    } & DefaultSession['user']
  }

  interface User {
    role: AppRole
    companyId: string
    membershipRole: 'OWNER' | 'ADMIN' | 'ANALYST' | 'READONLY'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    role?: AppRole
    companyId?: string
    membershipRole?: 'OWNER' | 'ADMIN' | 'ANALYST' | 'READONLY'
  }
}
