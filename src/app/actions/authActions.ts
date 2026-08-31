'use server'

import { randomBytes } from 'node:crypto'
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

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
  return `${base || 'bedrijf'}-${randomBytes(3).toString('hex')}`
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
      subject: 'Herstel je Prysight wachtwoord',
      text: `Er is een verzoek ontvangen om je Prysight wachtwoord te herstellen. Open deze beveiligde link binnen 30 minuten: ${resetLink}\n\nHeb je dit niet aangevraagd, dan kun je deze e-mail negeren.`,
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

export async function registerAction(formData: FormData) {
  const loginPath = safeLoginPath(formData.get('loginPath'))
  const fullName = String(formData.get('fullName') ?? '').trim()
  const companyName = String(formData.get('companyName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!fullName || !companyName || !email || !email.includes('@')) {
    redirect(withQuery(loginPath, 'mode=register&error=register-missing'))
  }
  if (companyName.length < 2) {
    redirect(withQuery(loginPath, 'mode=register&error=register-company'))
  }
  if (password.length < 12) {
    redirect(withQuery(loginPath, 'mode=register&error=register-password'))
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    redirect(withQuery(loginPath, 'mode=register&error=register-existing'))
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const trialEndsAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000)

  await prisma.$transaction(async tx => {
    const plan = await tx.licensePlan.upsert({
      where: { code: 'trial' },
      update: {
        isActive: true,
        isPublic: true,
      },
      create: {
        code: 'trial',
        name: 'Prysight Trial',
        description: '9 dagen gratis Prysight proberen.',
        isActive: true,
        isPublic: true,
        maxUsers: 1,
        maxCountries: 3,
        maxCompetitors: 5,
        maxSkus: 1000,
        maxChecksPerDay: 100,
        features: { pricingAdvice: true, feeds: true, reports: true },
      },
    })

    const user = await tx.user.create({
      data: {
        email,
        name: fullName,
        passwordHash,
        role: 'ADMIN',
      },
    })

    const company = await tx.company.create({
      data: {
        name: companyName,
        slug: slugify(companyName),
        billingEmail: email,
        license: {
          create: {
            planId: plan.id,
            status: 'TRIALING',
            trialEndsAt,
          },
        },
      },
    })

    await tx.companyMembership.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: 'OWNER',
      },
    })
  })

  redirect(withQuery(loginPath, 'registered=success'))
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
