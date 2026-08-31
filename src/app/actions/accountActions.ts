'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { signOut } from '@/auth'
import { requireAuthenticatedUser } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

export async function changePasswordAction(formData: FormData) {
  const actor = await requireAuthenticatedUser()
  const currentPassword = String(formData.get('currentPassword') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect('/account/password?error=missing')
  }

  if (newPassword.length < 12) {
    redirect('/account/password?error=length')
  }

  if (newPassword !== confirmPassword) {
    redirect('/account/password?error=match')
  }

  const user = await prisma.user.findUnique({ where: { id: actor.id } })
  if (!user) {
    redirect('/login')
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!currentMatches) {
    redirect('/account/password?error=current')
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: actor.id },
    data: { passwordHash },
  })

  await signOut({ redirectTo: '/login?password=changed' })
}
