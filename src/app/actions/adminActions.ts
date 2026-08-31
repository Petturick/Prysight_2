'use server'

import bcrypt from 'bcryptjs'
import { CompanyMemberRole, Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requireAdmin, requireSuperAdmin } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { competitorSchema, countrySchema, productGroupSchema, userSchema, webshopSchema } from '@/lib/validators'
import { revalidatePath } from 'next/cache'

async function audit(userId: string, action: string, entityType: string, entityId: string, oldValue?: Prisma.InputJsonValue | null, newValue?: Prisma.InputJsonValue | null) {
  await createAuditLog({ userId, action, entityType, entityId, oldValue, newValue })
}

export async function saveCountryAction(formData: FormData) {
  const actor = await requireAdmin()
  const parsed = countrySchema.parse({
    id: formData.get('id') || undefined,
    code: formData.get('code'),
    name: formData.get('name'),
    vatRate: formData.get('vatRate'),
    currency: formData.get('currency'),
    isActive: formData.get('isActive') === 'on',
  })

  const existingCountry = await prisma.country.findUnique({
    where: parsed.id ? { id: parsed.id } : { code: parsed.code },
    select: { id: true },
  })
  const existingAssociation = existingCountry
    ? await prisma.companyCountry.findUnique({
        where: { companyId_countryId: { companyId: actor.companyId, countryId: existingCountry.id } },
      })
    : null
  if (!existingAssociation?.isActive) await assertCompanyCapacity(actor.companyId, 'countries')

  const result = await prisma.country.upsert({
    where: { code: parsed.code },
    update: { name: parsed.name, vatRate: new Prisma.Decimal(parsed.vatRate), currency: parsed.currency, isActive: parsed.isActive },
    create: { code: parsed.code, name: parsed.name, vatRate: new Prisma.Decimal(parsed.vatRate), currency: parsed.currency, isActive: parsed.isActive },
  })
  await prisma.companyCountry.upsert({
    where: { companyId_countryId: { companyId: actor.companyId, countryId: result.id } },
    update: { isActive: true },
    create: { companyId: actor.companyId, countryId: result.id, isDefault: result.code === 'NL' },
  })

  await audit(actor.id, 'COUNTRY_SAVED', 'Country', result.id, null, { code: result.code, name: result.name })
  revalidatePath('/beheer/landen')
  revalidatePath('/beheer')
}

export async function deleteCountryAction(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('id'))
  await prisma.companyCountry.update({
    where: { companyId_countryId: { companyId: actor.companyId, countryId: id } },
    data: { isActive: false, isDefault: false },
  })
  await audit(actor.id, 'COMPANY_COUNTRY_REMOVED', 'Country', id)
  revalidatePath('/beheer/landen')
}

export async function saveCompetitorAdminAction(formData: FormData) {
  const actor = await requireAdmin()
  const parsed = competitorSchema.parse({
    name: formData.get('name'),
    website: formData.get('website'),
    countryId: formData.get('countryId'),
    checkFrequencyHours: formData.get('checkFrequencyHours'),
    isActive: formData.get('isActive') === 'on',
  })
  const id = formData.get('id') ? String(formData.get('id')) : undefined
  if (!id) await assertCompanyCapacity(actor.companyId, 'competitors')
  const result = id
    ? await prisma.competitor.update({ where: { id, companyId: actor.companyId }, data: parsed })
    : await prisma.competitor.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'COMPETITOR_SAVED', 'Competitor', result.id, null, { name: result.name })
  revalidatePath('/beheer/concurrenten')
  revalidatePath('/concurrenten')
}

export async function deleteCompetitorAdminAction(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('id'))
  await prisma.competitor.delete({ where: { id, companyId: actor.companyId } })
  await audit(actor.id, 'COMPETITOR_DELETED', 'Competitor', id)
  revalidatePath('/beheer/concurrenten')
}

export async function saveWebshopAction(formData: FormData) {
  const actor = await requireAdmin()
  const parsed = webshopSchema.parse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    url: formData.get('url'),
    countryId: formData.get('countryId'),
    competitorId: formData.get('competitorId') || null,
    isActive: formData.get('isActive') === 'on',
  })
  const result = parsed.id
    ? await prisma.webshop.update({ where: { id: parsed.id, companyId: actor.companyId }, data: parsed })
    : await prisma.webshop.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'WEBSHOP_SAVED', 'Webshop', result.id, null, { name: result.name })
  revalidatePath('/beheer/webshops')
}

export async function deleteWebshopAction(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('id'))
  await prisma.webshop.delete({ where: { id, companyId: actor.companyId } })
  await audit(actor.id, 'WEBSHOP_DELETED', 'Webshop', id)
  revalidatePath('/beheer/webshops')
}

export async function saveProductGroupAction(formData: FormData) {
  const actor = await requireAdmin()
  const parsed = productGroupSchema.parse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    description: formData.get('description') || '',
    isActive: formData.get('isActive') === 'on',
  })
  const result = parsed.id
    ? await prisma.productGroup.update({ where: { id: parsed.id, companyId: actor.companyId }, data: parsed })
    : await prisma.productGroup.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'PRODUCT_GROUP_SAVED', 'ProductGroup', result.id, null, { name: result.name })
  revalidatePath('/beheer/productgroepen')
  revalidatePath('/beheer')
}

export async function deleteProductGroupAction(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('id'))
  await prisma.productGroup.delete({ where: { id, companyId: actor.companyId } })
  await audit(actor.id, 'PRODUCT_GROUP_DELETED', 'ProductGroup', id)
  revalidatePath('/beheer/productgroepen')
}

export async function saveUserAction(formData: FormData) {
  const actor = await requireSuperAdmin()
  const parsed = userSchema.parse({
    id: formData.get('id') || undefined,
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
    role: formData.get('role'),
  })

  const existingMembership = parsed.id
    ? await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId: actor.companyId, userId: parsed.id } } })
    : null
  if (!existingMembership?.isActive) await assertCompanyCapacity(actor.companyId, 'users')

  const passwordHash = await bcrypt.hash(parsed.password, 10)
  const result = parsed.id
    ? await prisma.user.update({ where: { id: parsed.id }, data: { email: parsed.email, name: parsed.name, passwordHash, role: parsed.role } })
    : await prisma.user.create({ data: { email: parsed.email, name: parsed.name, passwordHash, role: parsed.role } })
  await prisma.companyMembership.upsert({
    where: { companyId_userId: { companyId: actor.companyId, userId: result.id } },
    update: { isActive: true, role: parsed.role as CompanyMemberRole },
    create: { companyId: actor.companyId, userId: result.id, role: parsed.role as CompanyMemberRole },
  })
  await audit(actor.id, 'USER_SAVED', 'User', result.id, null, { email: result.email, role: result.role })
  revalidatePath('/beheer/gebruikers')
}

export async function deleteUserAction(formData: FormData) {
  const actor = await requireSuperAdmin()
  const id = String(formData.get('id'))
  if (id === actor.id) {
    throw new Error('Je kunt je eigen super admin account niet verwijderen')
  }
  await prisma.companyMembership.update({
    where: { companyId_userId: { companyId: actor.companyId, userId: id } },
    data: { isActive: false },
  })
  await audit(actor.id, 'COMPANY_USER_REMOVED', 'User', id)
  revalidatePath('/beheer/gebruikers')
}
