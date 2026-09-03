'use server'

import { revalidatePath } from 'next/cache'
import { PERMISSIONS, type Permission, requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

function selectedPermissions(formData: FormData): Permission[] {
  return PERMISSIONS.filter((permission) => formData.get(permission) === 'on')
}

export async function createCustomRoleAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const permissions = selectedPermissions(formData)
  if (name.length < 2) throw new Error('Geef de rol een duidelijke naam.')
  if (permissions.length === 0) throw new Error('Selecteer minimaal één recht.')
  await prisma.$executeRaw`
    INSERT INTO custom_roles (company_id, name, description, permissions)
    VALUES (${actor.companyId}, ${name}, ${description || null}, CAST(${JSON.stringify(permissions)} AS jsonb))
  `
  revalidatePath('/instellingen/rollen')
}

export async function updateCustomRoleAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const roleId = String(formData.get('roleId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const permissions = selectedPermissions(formData)
  if (!roleId || name.length < 2 || permissions.length === 0) throw new Error('Controleer de rol en de geselecteerde rechten.')
  await prisma.$executeRaw`
    UPDATE custom_roles SET name = ${name}, description = ${description || null}, permissions = CAST(${JSON.stringify(permissions)} AS jsonb), updated_at = now()
    WHERE id = ${roleId} AND company_id = ${actor.companyId}
  `
  revalidatePath('/instellingen/rollen')
}

export async function assignCustomRoleAction(formData: FormData) {
  const actor = await requirePermission('users.manage')
  const userId = String(formData.get('userId') ?? '')
  const roleId = String(formData.get('roleId') ?? '')
  if (!userId) throw new Error('Selecteer een gebruiker.')
  if (userId === actor.id && actor.role === 'SUPER_ADMIN' && roleId) throw new Error('Het eigen super admin account behoudt altijd volledige platformrechten.')
  const membership = await prisma.companyMembership.findUnique({
    where: { companyId_userId: { companyId: actor.companyId, userId } },
    select: { isActive: true, user: { select: { isSuperAdmin: true } } },
  })
  if (!membership?.isActive) throw new Error('Deze gebruiker hoort niet bij de actieve organisatie.')
  if (membership.user.isSuperAdmin && actor.role !== 'SUPER_ADMIN') throw new Error('Een super admin account kan alleen door een super admin worden beheerd.')
  if (roleId) {
    const roles = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM custom_roles WHERE id = ${roleId} AND company_id = ${actor.companyId} AND is_active = true LIMIT 1
    `
    if (!roles[0]) throw new Error('Deze rol bestaat niet binnen de actieve organisatie.')
  }
  await prisma.$executeRaw`
    UPDATE company_memberships SET custom_role_id = ${roleId || null}, updated_at = now()
    WHERE company_id = ${actor.companyId} AND user_id = ${userId} AND is_active = true
  `
  revalidatePath('/instellingen/rollen')
  revalidatePath('/instellingen/gebruikers')
}

export async function deleteCustomRoleAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const roleId = String(formData.get('roleId') ?? '')
  if (!roleId) return
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE company_memberships SET custom_role_id = NULL, updated_at = now() WHERE custom_role_id = ${roleId} AND company_id = ${actor.companyId}`
    await tx.$executeRaw`DELETE FROM custom_roles WHERE id = ${roleId} AND company_id = ${actor.companyId}`
  })
  revalidatePath('/instellingen/rollen')
  revalidatePath('/instellingen/gebruikers')
}
