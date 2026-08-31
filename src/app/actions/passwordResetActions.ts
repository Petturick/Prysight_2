'use server'

import { redirect } from 'next/navigation'
import { requestPasswordResetAction as requestLegacyPasswordResetAction } from '@/app/actions/authActions'
import { prisma } from '@/lib/prisma'
import { sendSupabasePasswordRecovery } from '@/lib/supabase-auth'

function safeLoginPath(value: FormDataEntryValue | null): '/' | '/login' {
  return value === '/login' ? '/login' : '/'
}

function withQuery(path: '/' | '/login', query: string) {
  return path === '/' ? `/?${query}` : `/login?${query}`
}

function passwordResetOrigin() {
  const configured = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? process.env.URL
  if (configured) return configured.trim().replace(/\/$/, '')
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return null
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const loginPath = safeLoginPath(formData.get('loginPath'))

  if (!email || !email.includes('@')) {
    redirect(withQuery(loginPath, 'mode=forgot&error=reset-missing'))
  }

  const rows = await prisma.$queryRaw<Array<{ hasSupabaseAuth: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM users u
      INNER JOIN company_memberships cm
        ON cm.user_id = u.id
       AND cm.is_active = true
      INNER JOIN companies c
        ON c.id = cm.company_id
       AND c.status = 'ACTIVE'
      INNER JOIN auth.users au
        ON lower(au.email) = lower(u.email)
      WHERE lower(u.email) = lower(${email})
        AND u.id <> 'system_pricing'
    ) AS "hasSupabaseAuth"
  `

  if (!rows[0]?.hasSupabaseAuth) {
    return requestLegacyPasswordResetAction(formData)
  }

  const origin = passwordResetOrigin()
  if (!origin) {
    redirect(withQuery(loginPath, 'mode=forgot&reset=unavailable'))
  }

  const sent = await sendSupabasePasswordRecovery(email, `${origin}/auth/supabase-recovery`)
  if (!sent) {
    redirect(withQuery(loginPath, 'mode=forgot&reset=unavailable'))
  }

  redirect(withQuery(loginPath, 'mode=forgot&reset=requested'))
}
