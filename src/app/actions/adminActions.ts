'use server'

import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { CompanyMemberRole, CompanyStatus, Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { ACTIVE_COMPANY_COOKIE, requirePermission, requireSuperAdmin } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { requireLicensedCountry } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'
import { competitorSchema, countrySchema, productGroupSchema, userSchema, webshopSchema } from '@/lib/validators'
import { isUnnamedGroup, MERGED_GROUP_PREFIX, mergedGroupTarget, productGroupLabel } from '@/lib/product-groups'
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
  await createAuditLog({ companyId: company.id, userId: actor.id, action: 'COMPANY_CREATED', entityType: 'Company', entityId: company.id, newValue: { companyId: company.id, name: company.name, slug: company.slug } })
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
  await createAuditLog({ companyId: company.id, userId: actor.id, action: 'COMPANY_STATUS_UPDATED', entityType: 'Company', entityId: company.id, newValue: { companyId: company.id, status: company.status } })
  revalidatePath('/instellingen/organisaties')
}

export async function saveCountryAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const parsed = countrySchema.parse({ id: formData.get('id') || undefined, code: formData.get('code'), name: formData.get('name'), vatRate: formData.get('vatRate'), currency: formData.get('currency'), isActive: formData.get('isActive') === 'on' })
  const existingCountry = await prisma.country.findUnique({ where: parsed.id ? { id: parsed.id } : { code: parsed.code } })
  const existingAssociation = existingCountry ? await prisma.companyCountry.findUnique({ where: { companyId_countryId: { companyId: actor.companyId, countryId: existingCountry.id } } }) : null
  if (!existingAssociation?.isActive) await assertCompanyCapacity(actor.companyId, 'countries')

  let result
  if (actor.role === 'SUPER_ADMIN') {
    result = await prisma.country.upsert({ where: { code: parsed.code }, update: { name: parsed.name, vatRate: new Prisma.Decimal(parsed.vatRate), currency: parsed.currency, isActive: parsed.isActive }, create: { code: parsed.code, name: parsed.name, vatRate: new Prisma.Decimal(parsed.vatRate), currency: parsed.currency, isActive: parsed.isActive } })
  } else {
    if (!existingCountry?.isActive) throw new Error('Alleen een super admin kan nieuwe landen of globale landinstellingen aanmaken.')
    result = existingCountry
  }

  const hasDefault = await prisma.companyCountry.findFirst({ where: { companyId: actor.companyId, isActive: true, isDefault: true }, select: { id: true } })
  await prisma.companyCountry.upsert({
    where: { companyId_countryId: { companyId: actor.companyId, countryId: result.id } },
    update: { isActive: true, isDefault: existingAssociation?.isDefault || !hasDefault },
    create: { companyId: actor.companyId, countryId: result.id, isDefault: !hasDefault },
  })
  await audit(actor.id, 'COUNTRY_SAVED', 'Country', result.id, null, { companyId: actor.companyId, code: result.code, name: result.name })
  revalidatePath('/beheer/landen'); revalidatePath('/beheer'); revalidatePath('/instellingen/markten')
}

export async function deleteCountryAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const id = String(formData.get('id'))
  await prisma.companyCountry.update({ where: { companyId_countryId: { companyId: actor.companyId, countryId: id } }, data: { isActive: false, isDefault: false } })
  await audit(actor.id, 'COMPANY_COUNTRY_REMOVED', 'Country', id, null, { companyId: actor.companyId, isActive: false }); revalidatePath('/beheer/landen'); revalidatePath('/instellingen/markten')
}

export async function saveCompetitorAdminAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const parsed = competitorSchema.parse({ name: formData.get('name'), website: formData.get('website'), countryId: formData.get('countryId'), checkFrequencyHours: formData.get('checkFrequencyHours'), isActive: formData.get('isActive') === 'on' })
  await requireLicensedCountry(actor.companyId, parsed.countryId)
  const id = formData.get('id') ? String(formData.get('id')) : undefined
  if (!id) await assertCompanyCapacity(actor.companyId, 'competitors')
  const result = id ? await prisma.competitor.update({ where: { id, companyId: actor.companyId }, data: parsed }) : await prisma.competitor.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'COMPETITOR_SAVED', 'Competitor', result.id, null, { companyId: actor.companyId, name: result.name }); revalidatePath('/beheer/concurrenten'); revalidatePath('/concurrenten')
}
export async function setCompetitorActiveAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const id = String(formData.get('id') ?? '')
  const isActive = String(formData.get('isActive')) === 'true'
  const competitor = await prisma.competitor.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true, name: true, isActive: true, countryId: true },
  })
  if (!competitor) throw new Error('Concurrent niet gevonden binnen deze organisatie.')
  if (isActive) await requireLicensedCountry(actor.companyId, competitor.countryId)
  await prisma.competitor.update({ where: { id, companyId: actor.companyId }, data: { isActive } })
  await audit(actor.id, isActive ? 'COMPETITOR_RESUMED' : 'COMPETITOR_PAUSED', 'Competitor', id,
    { isActive: competitor.isActive }, { companyId: actor.companyId, isActive })
  revalidatePath('/concurrenten')
  revalidatePath('/beheer/concurrenten')
  revalidatePath('/producten')
  revalidatePath('/dashboard')
  revalidatePath('/monitoring')
}

export async function deleteCompetitorAdminAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const id = String(formData.get('id') ?? '')
  const confirmationName = String(formData.get('confirmationName') ?? '').trim()
  const expectedOffers = Number(formData.get('expectedOffers'))
  const competitor = await prisma.competitor.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true, name: true, _count: { select: { offers: true } } },
  })
  if (!competitor) throw new Error('Concurrent niet gevonden binnen deze organisatie.')
  if (confirmationName !== competitor.name || !Number.isSafeInteger(expectedOffers) || expectedOffers !== competitor._count.offers) {
    throw new Error('De bevestiging of het aantal gekoppelde prijsbronnen is gewijzigd. Vernieuw de pagina en probeer opnieuw.')
  }
  const counts = await prisma.$transaction(async (tx) => {
    const offers = { competitorId: competitor.id, companyId: actor.companyId }
    const alerts = await tx.alert.deleteMany({ where: { companyId: actor.companyId, competitorOffer: offers } })
    const matches = await tx.productMatch.deleteMany({ where: { companyId: actor.companyId, competitorOffer: offers } })
    const deletedOffers = await tx.competitorOffer.deleteMany({ where: offers })
    await tx.competitor.delete({ where: { id: competitor.id, companyId: actor.companyId } })
    return { alerts: alerts.count, matches: matches.count, offers: deletedOffers.count }
  })
  await audit(actor.id, 'COMPETITOR_DELETED', 'Competitor', id, null,
    { companyId: actor.companyId, name: competitor.name, ...counts })
  for (const path of ['/beheer/concurrenten', '/concurrenten', '/producten', '/productmatches', '/dashboard', '/monitoring', '/waarschuwingen']) revalidatePath(path)
}

export async function saveWebshopAction(formData: FormData) {
  const actor = await requirePermission('settings.manage')
  const parsed = webshopSchema.parse({ id: formData.get('id') || undefined, name: formData.get('name'), url: formData.get('url'), countryId: formData.get('countryId'), competitorId: formData.get('competitorId') || null, isActive: formData.get('isActive') === 'on' })
  await requireLicensedCountry(actor.companyId, parsed.countryId)
  if (parsed.competitorId) {
    const competitor = await prisma.competitor.findFirst({ where: { id: parsed.competitorId, companyId: actor.companyId, countryId: parsed.countryId }, select: { id: true } })
    if (!competitor) throw new Error('De gekozen concurrent hoort niet bij deze organisatie en markt.')
  }
  const result = parsed.id ? await prisma.webshop.update({ where: { id: parsed.id, companyId: actor.companyId }, data: parsed }) : await prisma.webshop.create({ data: { ...parsed, companyId: actor.companyId } })
  await audit(actor.id, 'WEBSHOP_SAVED', 'Webshop', result.id, null, { companyId: actor.companyId, name: result.name }); revalidatePath('/beheer/webshops')
}
export async function deleteWebshopAction(formData: FormData) {
  const actor = await requirePermission('settings.manage'); const id = String(formData.get('id'))
  await prisma.webshop.delete({ where: { id, companyId: actor.companyId } }); await audit(actor.id, 'WEBSHOP_DELETED', 'Webshop', id, null, { companyId: actor.companyId }); revalidatePath('/beheer/webshops')
}

export async function saveProductGroupAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const id = String(formData.get('id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const isActive = formData.get('isActive') === 'on'
  if (!name || isUnnamedGroup(name)) throw new Error('Geef de productgroep een herkenbare naam, geen categoriecode.')
  const existing = id ? await prisma.productGroup.findFirst({ where: { id, companyId: actor.companyId } }) : null
  if (id && !existing) throw new Error('Productgroep niet gevonden in deze organisatie.')
  if (existing && mergedGroupTarget(existing.description)) throw new Error('Deze productgroep is al samengevoegd.')
  // Imported feed codes are stable source identifiers. Store their visible label in
  // the description so the next feed sync cannot recreate an anonymous category.
  const saved = existing && /^\d+$/.test(existing.name)
    ? await prisma.productGroup.update({
      where: { id: existing.id, companyId: actor.companyId },
      data: { description: name, isActive },
    })
    : existing
      ? await prisma.productGroup.update({
        where: { id: existing.id, companyId: actor.companyId },
        data: { name, description, isActive },
      })
      : await prisma.productGroup.create({ data: { companyId: actor.companyId, name, description, isActive } })
  await audit(actor.id, 'PRODUCT_GROUP_SAVED', 'ProductGroup', saved.id, null, { companyId: actor.companyId, displayName: productGroupLabel(saved) })
  revalidatePath('/beheer/productgroepen')
  revalidatePath('/producten')
  revalidatePath('/producten/nieuw')
}

export async function mergeProductGroupAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const sourceId = String(formData.get('sourceId') ?? '')
  const targetId = String(formData.get('targetId') ?? '')
  if (!sourceId || !targetId || sourceId === targetId) throw new Error('Kies twee verschillende productgroepen.')
  const [source, target] = await Promise.all([
    prisma.productGroup.findFirst({ where: { id: sourceId, companyId: actor.companyId } }),
    prisma.productGroup.findFirst({ where: { id: targetId, companyId: actor.companyId, isActive: true } }),
  ])
  if (!source || !target || mergedGroupTarget(source.description) || mergedGroupTarget(target.description) || productGroupLabel(target) === 'Nog niet ingedeeld') {
    throw new Error('Selecteer een bestaande bron en een actieve productgroep met een herkenbare naam.')
  }
  await prisma.$transaction(async (tx) => {
    // Preserve the source record as a feed alias, including its original code.
    await tx.product.updateMany({ where: { companyId: actor.companyId, productGroupId: source.id }, data: { productGroupId: target.id } })
    await tx.alertRule.updateMany({ where: { companyId: actor.companyId, productGroupId: source.id }, data: { productGroupId: target.id } })
    await tx.productGroup.update({
      where: { id: source.id, companyId: actor.companyId },
      data: { isActive: false, description: MERGED_GROUP_PREFIX + target.id },
    })
    // Repoint any prior feed aliases that were mapped to the merged source.
    await tx.productGroup.updateMany({
      where: { companyId: actor.companyId, description: MERGED_GROUP_PREFIX + source.id },
      data: { description: MERGED_GROUP_PREFIX + target.id },
    })
  })
  await audit(actor.id, 'PRODUCT_GROUP_MERGED', 'ProductGroup', source.id, null, { companyId: actor.companyId, targetId: target.id })
  revalidatePath('/beheer/productgroepen')
  revalidatePath('/producten')
  revalidatePath('/producten/nieuw')
}

export async function deleteProductGroupAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const id = String(formData.get('id') ?? '').trim()
  const group = await prisma.productGroup.findFirst({ where: { id, companyId: actor.companyId } })
  if (!group) throw new Error('Productgroep niet gevonden in deze organisatie.')
  const [products, aliases] = await Promise.all([
    prisma.product.count({ where: { companyId: actor.companyId, productGroupId: id } }),
    prisma.productGroup.count({ where: { companyId: actor.companyId, description: MERGED_GROUP_PREFIX + id } }),
  ])
  if (products || aliases) throw new Error('Deze groep is nog in gebruik. Verplaats eerst de producten naar een andere groep.')
  await prisma.productGroup.delete({ where: { id, companyId: actor.companyId } })
  await audit(actor.id, 'PRODUCT_GROUP_DELETED', 'ProductGroup', id, null, { companyId: actor.companyId })
  revalidatePath('/beheer/productgroepen')
  revalidatePath('/producten')
  revalidatePath('/producten/nieuw')
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

  const passwordHash = await bcrypt.hash(parsed.password, 12)
  let result
  if (parsed.id) {
    result = await prisma.user.update({ where: { id: parsed.id }, data: { email: parsed.email, name: parsed.name, passwordHash } })
  } else {
    await assertCompanyCapacity(actor.companyId, 'users')
    const existingUser = await prisma.user.findUnique({ where: { email: parsed.email } })
    result = existingUser ?? await prisma.user.create({ data: { email: parsed.email, name: parsed.name, passwordHash, role: parsed.role } })
    const alreadyMember = await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId: actor.companyId, userId: result.id } } })
    if (alreadyMember?.isActive) throw new Error('Deze gebruiker is al actief binnen de organisatie.')
  }

  await prisma.companyMembership.upsert({ where: { companyId_userId: { companyId: actor.companyId, userId: result.id } }, update: { isActive: true, role: requestedMembershipRole }, create: { companyId: actor.companyId, userId: result.id, role: requestedMembershipRole } })
  await audit(actor.id, 'USER_SAVED', 'User', result.id, null, { companyId: actor.companyId, email: result.email, membershipRole: requestedMembershipRole }); revalidatePath('/beheer/gebruikers'); revalidatePath('/instellingen/gebruikers')
}

export async function deleteUserAction(formData: FormData) {
  const actor = await requirePermission('users.manage'); const id = String(formData.get('id'))
  if (id === actor.id && actor.role === 'SUPER_ADMIN') throw new Error('Je kunt je eigen super admin account niet verwijderen')
  const membership = await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId: actor.companyId, userId: id } }, select: { isActive: true, user: { select: { isSuperAdmin: true } } } })
  if (!membership?.isActive) throw new Error('Deze gebruiker hoort niet bij de actieve organisatie.')
  if (membership.user.isSuperAdmin && actor.role !== 'SUPER_ADMIN') throw new Error('Een super admin account kan alleen door een super admin worden beheerd.')
  await prisma.companyMembership.update({ where: { companyId_userId: { companyId: actor.companyId, userId: id } }, data: { isActive: false } })
  await audit(actor.id, 'COMPANY_USER_REMOVED', 'User', id, null, { companyId: actor.companyId, isActive: false }); revalidatePath('/beheer/gebruikers'); revalidatePath('/instellingen/gebruikers')
}
