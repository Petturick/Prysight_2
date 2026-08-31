import { auth } from '@/auth'
import { isAdminRole, isSuperAdminRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'

export async function requireAuthenticatedUser() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Niet geauthenticeerd')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isSuperAdmin: true,
      memberships: {
        where: {
          isActive: true,
          company: { status: 'ACTIVE' },
          ...(session.user.companyId ? { companyId: session.user.companyId } : {}),
        },
        select: { companyId: true, role: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  const membership = user?.memberships[0]
  if (!user || user.id === 'system_pricing' || !membership) {
    throw new Error('Niet geauthenticeerd')
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.isSuperAdmin ? 'SUPER_ADMIN' as const : user.role,
    companyId: membership.companyId,
    membershipRole: membership.role,
  }
}

export async function requireWritableUser() {
  const user = await requireAuthenticatedUser()
  if (user.role === 'READONLY' || user.membershipRole === 'READONLY') {
    throw new Error('Uw account heeft alleen leesrechten.')
  }
  return user
}

export async function requireAdmin() {
  const user = await requireAuthenticatedUser()
  if (!isAdminRole(user.role)) {
    throw new Error('Onvoldoende rechten')
  }
  return user
}

export async function requireSuperAdmin() {
  const user = await requireAuthenticatedUser()
  if (!isSuperAdminRole(user.role)) {
    throw new Error('Super admin rechten vereist')
  }
  return user
}
