import { cache } from 'react'
import { auth } from '@/auth'
import { cookies } from 'next/headers'
import { isAdminRole, isSuperAdminRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'

const ACTIVE_COMPANY_COOKIE = 'prysight_active_company'

export const PERMISSIONS = [
  'products.read',
  'products.write',
  'competitors.read',
  'competitors.write',
  'feeds.read',
  'feeds.write',
  'imports.run',
  'reports.read',
  'alerts.manage',
  'pricing.manage',
  'users.manage',
  'settings.manage',
  'billing.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

type CustomRoleRow = { id: string | null; name: string | null; permissions: unknown }

const READ_PERMISSIONS: Permission[] = ['products.read', 'competitors.read', 'feeds.read', 'reports.read']
const ANALYST_PERMISSIONS: Permission[] = [...READ_PERMISSIONS, 'products.write', 'competitors.write', 'feeds.write', 'imports.run', 'alerts.manage', 'pricing.manage']
const ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS]
const IMPLIED_PERMISSIONS: Partial<Record<Permission, Permission[]>> = {
  'products.write': ['products.read'],
  'competitors.write': ['competitors.read'],
  'feeds.write': ['feeds.read'],
  'pricing.manage': ['products.read', 'competitors.read'],
  'imports.run': ['products.read'],
}

function withImpliedPermissions(source: Permission[]) {
  const resolved = new Set<Permission>(source)
  for (const permission of source) for (const implied of IMPLIED_PERMISSIONS[permission] ?? []) resolved.add(implied)
  return [...resolved]
}

function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return []
  return withImpliedPermissions(value.filter((item): item is Permission => typeof item === 'string' && (PERMISSIONS as readonly string[]).includes(item)))
}

function builtInPermissions(membershipRole: string): Permission[] {
  if (membershipRole === 'OWNER' || membershipRole === 'ADMIN') return ADMIN_PERMISSIONS
  if (membershipRole === 'ANALYST') return ANALYST_PERMISSIONS
  return READ_PERMISSIONS
}

const getAuthenticatedUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Niet geauthenticeerd')

  const cookieStore = await cookies()
  const requestedCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value || session.user.companyId || undefined
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, email: true, name: true, role: true, isSuperAdmin: true,
      memberships: {
        where: { isActive: true, company: { status: 'ACTIVE' }, ...(requestedCompanyId ? { companyId: requestedCompanyId } : {}) },
        select: { companyId: true, role: true }, orderBy: { createdAt: 'asc' }, take: 1,
      },
    },
  })

  let membership = user?.memberships[0]
  if (user?.isSuperAdmin && requestedCompanyId && !membership) {
    const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, select: { id: true } })
    if (company) membership = { companyId: company.id, role: 'OWNER' as const }
  }
  if (!user || user.id === 'system_pricing' || !membership) throw new Error('Niet geauthenticeerd')

  let customRole: CustomRoleRow | null = null
  try {
    const rows = await prisma.$queryRaw<CustomRoleRow[]>`
      SELECT cr.id, cr.name, cr.permissions
      FROM company_memberships cm
      LEFT JOIN custom_roles cr ON cr.id = cm.custom_role_id AND cr.is_active = true
      WHERE cm.user_id = ${user.id} AND cm.company_id = ${membership.companyId} AND cm.is_active = true
      LIMIT 1
    `
    customRole = rows[0] ?? null
  } catch { customRole = null }

  const permissions = user.isSuperAdmin ? ADMIN_PERMISSIONS : customRole?.id ? normalizePermissions(customRole.permissions) : builtInPermissions(membership.role)
  return {
    id: user.id, email: user.email, name: user.name,
    role: user.isSuperAdmin ? 'SUPER_ADMIN' as const : user.role,
    companyId: membership.companyId, membershipRole: membership.role,
    customRoleId: customRole?.id ?? null, customRoleName: customRole?.name ?? null, permissions,
  }
})

export async function requireAuthenticatedUser() { return getAuthenticatedUser() }
export async function requirePermission(permission: Permission) {
  const user = await requireAuthenticatedUser()
  if (user.role !== 'SUPER_ADMIN' && !user.permissions.includes(permission)) throw new Error('Onvoldoende rechten voor deze actie.')
  return user
}
export async function requireWritableUser() { return requirePermission('products.write') }
export async function requireAdmin() {
  const user = await requireAuthenticatedUser()
  if (!isAdminRole(user.role) && !user.permissions.includes('settings.manage')) throw new Error('Onvoldoende rechten')
  return user
}
export async function requireSuperAdmin() {
  const user = await requireAuthenticatedUser()
  if (!isSuperAdminRole(user.role)) throw new Error('Super admin rechten vereist')
  return user
}
export { ACTIVE_COMPANY_COOKIE }
