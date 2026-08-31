'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn, signOut } from '@/auth'
import { prisma } from '@/lib/prisma'
import { createPasswordResetToken, verifyPasswordResetToken } from '@/lib/password-reset'

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

async function sendPasswordResetEmail(email: string, resetLink: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.PASSWORD_RESET_FROM_EMAIL?.trim()
  if (!apiKey || !from) return false

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Herstel je PrySight wachtwoord',
      text: `Er is een verzoek ontvangen om je PrySight wachtwoord te herstellen. Open deze beveiligde link binnen 30 minuten: ${resetLink}\n\nHeb je dit niet aangevraagd, dan kun je deze e-mail negeren.`,
    }),
  })

  return response.ok
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const loginPath = safeLoginPath(formData.get('loginPath'))

  if (!email || !password) {
    redirect(withQuery(loginPath, 'error=missing'))
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(withQuery(loginPath, 'error=credentials'))
    }
    throw error
  }
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const loginPath = safeLoginPath(formData.get('loginPath'))

  if (!email || !email.includes('@')) {
    redirect(withQuery(loginPath, 'mode=forgot&error=reset-missing'))
  }

  const origin = passwordResetOrigin()
  if (!origin || !process.env.RESEND_API_KEY?.trim() || !process.env.PASSWORD_RESET_FROM_EMAIL?.trim()) {
    redirect(withQuery(loginPath, 'mode=forgot&reset=unavailable'))
  }

  const user = await prisma.user.findFirst({
    where: {
      email,
      memberships: {
        some: {
          isActive: true,
          company: { status: 'ACTIVE' },
        },
      },
    },
  })

  if (user) {
    const token = createPasswordResetToken(user.email, user.passwordHash)
    const resetLink = `${origin}/reset-password?token=${encodeURIComponent(token)}`
    await sendPasswordResetEmail(user.email, resetLink)
  }

  redirect(withQuery(loginPath, 'mode=forgot&reset=requested'))
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const encodedToken = encodeURIComponent(token)

  if (!token || !newPassword || !confirmPassword) {
    redirect(`/reset-password?token=${encodedToken}&error=missing`)
  }
  if (newPassword.length < 12) {
    redirect(`/reset-password?token=${encodedToken}&error=length`)
  }
  if (newPassword !== confirmPassword) {
    redirect(`/reset-password?token=${encodedToken}&error=match`)
  }

  const user = await verifyPasswordResetToken(token)
  if (!user) {
    redirect('/reset-password?error=invalid')
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
  await signOut({ redirectTo: '/?reset=success' })
}

export async function logoutAction() {
  await signOut({ redirectTo: '/' })
}
