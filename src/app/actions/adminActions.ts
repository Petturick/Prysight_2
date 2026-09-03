'use server'

import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { CompanyMemberRole, CompanyStatus, Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { ACTIVE_COMPANY_COOKIE, requirePermission, requireSuperAdmin } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { competitorSchema, countrySchema, productGroupSchema, userSchema, webshopSchema } from '@/lib/validators'
import { revalidatePath } from 'next/cache'

async function audit(userId: string, action: string, entityType: string, entityId: string, oldValue?: Prisma.InputJsonValue | null, newValue?: Prisma.InputJsonValue | null) {
  await createAuditLog({ userId, action, entityType, entityId, oldValue, newValue })
}
function companySlug(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

export async function createCompanyAction(formData: FormData) {
  const actor = await requireSuperAdmin()
  const name = String(formData.get('name') ?? '').trim()
  const billingEmail = String(formData.get('billingEmail') ?? '').trim().toLowerCase()
  const currency = String(formData.get('defaultCurrency') ?? 'EUR').trim().toUpperCase() || 'EUR'
  const timezone = String(formData.get('timezone') ?? 'Europe/Amsterdam').trim() || 'Europe/Amsterdam'
  if (name.length < 2) throw new Error('Vul een geldige bedrijfsnaam in.')
  if (billingEmail && !billingEmail.includes('@')) throw new Error('Vul een geldig facturatie e-mailadres in.')
  const baseSlug = companySlug(name) || 'organisatie'
  let slug = baseSlug
  let suffix = 2
  while (await prisma.company.findUnique({ where: { slug }, select: { id: true } })) slug = `${baseSlug}-${suffix++}`
  const defaultPlan = await prisma.licensePlan.findFirst({ where: { isActive: true }, orderBy: [{ isPublic: 'desc' }, { createdAt: 'asc' }], select: { id: true } })
  if (!defaultPlan) throw new Error('Er is geen actief licentieplan beschikbaar om de organisatie te activeren.')
  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({ data: { name, slug, billingEmail: billingEmail || null, defaultCurrency: currency, timezone, status: CompanyStatus.ACTIVE } })
    await tx.companyMembership.create({ data: { companyId: created.id, userId: actor.id, role: CompanyMemberRole.OWNER, isActive: true } })
    await tx.companyLicense.create({ data: { companyId: created.id, planId: defaultPlan.id, status: 'ACTIVE', source: 'MANUAL' } })
    return created
  })
  await audit(actor.id, 'COMPANY_CREATED', 'Company', company.id, null, { name: company.name, slug: company.slug })
  revalidatePath('/instellingen/organisaties')
}

export async function switchCompanyAction(formData: FormData) {
  await requireSuperAdmin()
  const companyId = String(formData.get('companyId') ?? '')
  const company = await prisma.company.findFirst({ where: { id: companyId, status: 'ACTIVE' }, select: { id: true } })
  if (!company) throw new Error('Deze organisatie bestaat niet of is niet actief.')
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_COMPANY_COOKIE, company.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 })
  revalidatePath('/', 'layout')
}

export async function updateCompanyStatusAction(formData: FormData) {
  const actor = await requireSuperAdmin()
  const companyId = String(formData.get('companyId') ?? '')
  const status = String(formData.get('status') ?? '') as CompanyStatus
  if (!Object.values(CompanyStatus).includes(status)) throw new Error('Ongeldige organisatiestatus.')
  if (companyId === actor.companyId && status !== CompanyStatus.ACTIVE) throw new Error('De actieve organisatie kan niet worden gedeactiveerd. Schakel eerst naar een andere organisatie.')
  const company = await prisma.company.update({ where: { id: companyId }, data: { status } })
  await audit(actor.id, 'COMPANY_STATUS_UPDATED', 'Company', company.id, null, { status: company.status })
  revalidatePath('/instellingen/organisaties')
}

export async function saveCountryAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const parsed = countrySchema.parse({ id: formData.get('id') || undefined, code: formData.get('code'), name: formData.get('name'), vatRate: formData.get('vatRate'), currency: formData.get('currency'), isActive: formData.get('isActive') === 'on' })
  const existingCountry = await prisma.country.findUnique({ where: parsed.id ? { id: parsed.id } : { code: parsed.code }, select: { id: true } })
  const existingAssociation = existingCountry ? await prisma.companyCountry.findUnique({ where: { companyId_countryId: { companyId: actor.companyId, countryId: existingCountry.id } } }) : null
  if (!existingAssociation?.isActive) await assertCompanyCapacity(actor.companyId, 'countries')
  const result = await prisma.country.upsert({ where: { code: parsed.code }, update: { name: parsed.name, vatRate: new Prisma.Decimal(parsed.vatRate), currency: parsed.currency, isActive: parsed.isActive }, create: { code: parsed.code, name: parsed.name, vatRate: new Prisma.Decimal(parsed.vatRate), currency: parsed.currency, isActive: parsed.isActive } })
  await prisma.companyCountry.upsert({ where: { companyId_countryId: { companyId: actor.companyId, countryId: result.id } }, update: { isActive: true }, create: { companyId: actor.companyId, countryId: result.id, isDefault: result.code === 'NL' } })
  await audit(actor.id, 'COUNTRY_SAVED', 'Country', result.id, null, { code: result.code, name: result.name })
  revalidatePath('/beheer/landen'); revalidatePath('/beheer')
}

export async function deleteCountryAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const id = String(formData.get('id'))
  await prisma.companyCountry.update({ where: { companyId_countryId: { companyId: actor.companyId, countryId: id } }, data: { isActive: false, isDefault: false } })
  await audit(actor.id, 'COMPANY_COUNTRY_REMOVED', 'Country', id); revalidatePath('/beheer/landen')
}

export async function saveCompetitorAdminAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const parsed = competitorSchema.parse({ name: formData.get('name'), website: formData.get('website'), countryId: formData.get('countryId'), checkFrequencyHours: formData.get('checkFrequencyHours'), isActive: formData.get('isActive') === 'on' })
  const id = formData.get('id') ? String(formData.get('id')) : undefined
  if (!id) await assertCompanyCapacity(actor.companyId, 'competitors')
  const result = id ? await prisma.competitor.update({ where: { id, companyId: actor.companyId }, data: parsed }) : await prisma.competitor.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'COMPETITOR_SAVED', 'Competitor', result.id, null, { name: result.name }); revalidatePath('/beheer/concurrenten'); revalidatePath('/concurrenten')
}
export async function deleteCompetitorAdminAction(formData: FormData) {
  const actor = await requirePermission('competitors.write'); const id = String(formData.get('id'))
  await prisma.competitor.delete({ where: { id, companyId: actor.companyId } }); await audit(actor.id, 'COMPETITOR_DELETED', 'Competitor', id); revalidatePath('/beheer/concurrenten')
}

export async function saveWebshopAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const parsed = webshopSchema.parse({ id: formData.get('id') || undefined, name: formData.get('name'), url: formData.get('url'), countryId: formData.get('countryId'), competitorId: formData.get('competitorId') || null, isActive: formData.get('isActive') === 'on' })
  const result = parsed.id ? await prisma.webshop.update({ where: { id: parsed.id, companyId: actor.companyId }, data: parsed }) : await prisma.webshop.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'WEBSHOP_SAVED', 'Webshop', result.id, null, { name: result.name }); revalidatePath('/beheer/webshops')
}
export async function deleteWebshopAction(formData: FormData) {
  const actor = await requirePermission('settings.manage'); const id = String(formData.get('id'))
  await prisma.webshop.delete({ where: { id, companyId: actor.companyId } }); await audit(actor.id, 'WEBSHOP_DELETED', 'Webshop', id); revalidatePath('/beheer/webshops')
}

export async function saveProductGroupAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const parsed = productGroupSchema.parse({ id: formData.get('id') || undefined, name: formData.get('name'), description: formData.get('description') || '', isActive: formData.get('isActive') === 'on' })
  const result = parsed.id ? await prisma.productGroup.update({ where: { id: parsed.id, companyId: actor.companyId }, data: parsed }) : await prisma.productGroup.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'PRODUCT_GROUP_SAVED', 'ProductGroup', result.id, null, { name: result.name }); revalidatePath('/beheer/productgroepen'); revalidatePath('/beheer')
}
export async function deleteProductGroupAction(formData: FormData) {
  const actor = await requirePermission('products.write'); const id = String(formData.get('id'))
  await prisma.productGroup.delete({ where: { id, companyId: actor.companyId } }); await audit(actor.id, 'PRODUCT_GROUP_DELETED', 'ProductGroup', id); revalidatePath('/beheer/productgroepen')
}

export async function saveUserAction(formData: FormData) {
  const actor = await requirePermission('users.manage')
  const parsed = userSchema.parse({ id: formData.get('id') || undefined, email: formData.get('email'), name: formData.get('name'), password: formData.get('password'), role: formData.get('role') })
  const requestedMembershipRole = parsed.role as CompanyMemberRole
  if (actor.role !== 'SUPER_ADMIN' && (requestedMembershipRole === CompanyMemberRole.ADMIN || requestedMembershipRole === CompanyMemberRole.OWNER)) {
    throw new Error('Alleen een super admin kan administratorrechten toekennen.')
  }
  const existingMembership = parsed.id ? await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId: actor.companyId, userId: parsed.id } }, select: { isActive: true, user: { select: { isSuperAdmin: true } } } }) : null
  if (parsed.id && !existingMembership?.isActive) throw new Error('Deze gebruiker hoort niet bij de actieve organisatie.')
  if (existingMembership?.user.isSuperAdmin && actor.role !== 'SUPER_ADMIN') throw new Error('Een super admin account kan alleen door een super admin worden beheerd.')
  if (!parsed.id) await assertCompanyCapacity(actor.companyId, 'users')
  const passwordHash = await bcrypt.hash(parsed.password, 10)
  const result = parsed.id ? await prisma.user.update({ where: { id: parsed.id }, data: { email: parsed.email, name: parsed.name, passwordHash, role: parsed.role } }) : await prisma.user.create({ data: { email: parsed.email, name: parsed.name, passwordHash, role: parsed.role } })
  await prisma.companyMembership.upsert({ where: { companyId_userId: { companyId: actor.companyId, userId: result.id } }, update: { isActive: true, role: requestedMembershipRole }, create: { companyId: actor.companyId, userId: result.id, role: requestedMembershipRole } })
  await audit(actor.id, 'USER_SAVED', 'User', result.id, null, { email: result.email, role: result.role }); revalidatePath('/beheer/gebruikers'); revalidatePath('/instellingen/gebruikers')
}

export async function deleteUserAction(formData: FormData) {
  const actor = await requirePermission('users.manage'); const id = String(formData.get('id'))
  if (id === actor.id && actor.role === 'SUPER_ADMIN') throw new Error('Je kunt je eigen super admin account niet verwijderen')
  const membership = await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId: actor.companyId, userId: id } }, select: { isActive: true, user: { select: { isSuperAdmin: true } } } })
  if (!membership?.isActive) throw new Error('Deze gebruiker hoort niet bij de actieve organisatie.')
  if (membership.user.isSuperAdmin && actor.role !== 'SUPER_ADMIN') throw new Error('Een super admin account kan alleen door een super admin worden beheerd.')
  await prisma.companyMembership.update({ where: { companyId_userId: { companyId: actor.companyId, userId: id } }, data: { isActive: false } })
  await audit(actor.id, 'COMPANY_USER_REMOVED', 'User', id); revalidatePath('/beheer/gebruikers'); revalidatePath('/instellingen/gebruikers')
}
