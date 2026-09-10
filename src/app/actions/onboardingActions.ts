'use server'

import { revalidatePath } from 'next/cache'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'

export async function activateCompanyCountryAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const countryId = String(formData.get('countryId') ?? '')
  if (!countryId) throw new Error('Kies een geldig land.')
  const country = await prisma.country.findFirst({ where: { id: countryId, isActive: true }, select: { id: true, code: true, name: true } })
  if (!country) throw new Error('Dit land is niet beschikbaar.')
  const current = await prisma.companyCountry.findUnique({ where: { companyId_countryId: { companyId: actor.companyId, countryId } } })
  if (!current?.isActive) await assertCompanyCapacity(actor.companyId, 'countries')
  const hasDefault = await prisma.companyCountry.findFirst({ where: { companyId: actor.companyId, isActive: true, isDefault: true }, select: { id: true } })
  await prisma.companyCountry.upsert({
    where: { companyId_countryId: { companyId: actor.companyId, countryId } },
    update: { isActive: true, isDefault: current?.isDefault || !hasDefault },
    create: { companyId: actor.companyId, countryId, isActive: true, isDefault: !hasDefault },
  })
  await createAuditLog({ userId: actor.id, action: 'COMPANY_COUNTRY_ACTIVATED', entityType: 'Country', entityId: country.id, newValue: { code: country.code, name: country.name } })
  revalidatePath('/onboarding')
  revalidatePath('/dashboard')
  revalidatePath('/instellingen/markten')
}
