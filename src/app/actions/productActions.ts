'use server'

import { FeedSourceType, MatchStatus } from '@/generated/prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWritableUser } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { assertCompanyCapacity } from '@/lib/company-license'
import { ingestCanonicalProducts } from '@/lib/feed-ingestion'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

export const MANUAL_CHECK_FREQUENCY_HOURS = 876000

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(value: string, fallback = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

function monitoringFrequency(value: string, fallback = 24) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.round(parsed)
  const allowed = [6, 12, 24, 48, 168, MANUAL_CHECK_FREQUENCY_HOURS]
  return allowed.includes(rounded) ? rounded : fallback
}

export async function createProductAction(formData: FormData) {
  const user = await requireWritableUser()
  const articleNumber = text(formData, 'articleNumber')
  const name = text(formData, 'name')
  const ean = text(formData, 'ean')
  const productGroup = text(formData, 'productGroup') || 'Onbekend'
  const ownPrice = text(formData, 'ownPrice')
  const stockStatus = text(formData, 'stockStatus') || 'Onbekend'
  const packagingUnit = text(formData, 'packagingUnit') || 'stuks'
  const packagingQty = positiveInteger(text(formData, 'packagingQty'))
  const countryId = text(formData, 'countryId')
  const ownUrl = text(formData, 'ownUrl')

  if (!articleNumber || !name) throw new Error('Artikelnummer en productnaam zijn verplicht.')

  const country = countryId ? await requireLicensedCountry(user.companyId, countryId) : null
  const currency = text(formData, 'currency') || country?.currency || 'EUR'

  await ingestCanonicalProducts({
    companyId: user.companyId,
    sourceKey: 'manual:prysight',
    sourceName: 'Handmatig toegevoegd in Prysight',
    sourceType: FeedSourceType.API,
    countryCode: country?.code ?? 'GLOBAL',
    products: [{
      articleNumber,
      ean: ean || undefined,
      gtin: ean || undefined,
      name,
      productGroup,
      ownPrice: ownPrice || undefined,
      currency,
      stockStatus,
      packagingUnit,
      packagingQty,
      countryCode: country?.code,
      ownUrl: ownUrl || undefined,
      isActive: true,
    }],
    config: { mode: 'manual', createdBy: user.email },
  })

  const product = await prisma.product.findUnique({ where: { companyId_articleNumber: { companyId: user.companyId, articleNumber } } })
  if (!product) throw new Error('Product is verwerkt, maar kon niet opnieuw worden geladen.')

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/feeds')
  redirect(`/producten/${product.id}?toegevoegd=1`)
}

export async function addCompetitorOfferAction(formData: FormData) {
  const user = await requireWritableUser()
  const productId = text(formData, 'productId')
  const competitorName = text(formData, 'competitorName')
  const countryId = text(formData, 'countryId')
  const offerUrl = text(formData, 'offerUrl')
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'), 24)

  if (!productId || !competitorName || !countryId || !offerUrl) throw new Error('Product, concurrent, land en product URL zijn verplicht.')

  const product = await prisma.product.findFirst({ where: { id: productId, companyId: user.companyId, isActive: true } })
  if (!product) throw new Error('Product niet gevonden.')
  const country = await requireLicensedCountry(user.companyId, countryId)

  const safeOfferUrl = (await assertSafeRemoteHttpUrl(offerUrl)).toString()
  const website = new URL(safeOfferUrl).origin

  const competitorWhere = { companyId_name_countryId: { companyId: user.companyId, name: competitorName, countryId } }
  const existingCompetitor = await prisma.competitor.findUnique({ where: competitorWhere })
  if (!existingCompetitor) await assertCompanyCapacity(user.companyId, 'competitors')

  const competitor = await prisma.competitor.upsert({
    where: competitorWhere,
    update: { website, isActive: true, checkFrequencyHours },
    create: { companyId: user.companyId, name: competitorName, website, countryId, isActive: true, checkFrequencyHours },
  })

  const existingOffer = await prisma.competitorOffer.findUnique({
    where: { companyId_competitorId_url: { companyId: user.companyId, competitorId: competitor.id, url: safeOfferUrl } },
    include: { productMatch: true },
  })
  if (existingOffer?.productMatch && existingOffer.productMatch.productId !== product.id) {
    throw new Error('Deze concurrent URL is al aan een ander product gekoppeld.')
  }

  const offer = existingOffer ?? await prisma.competitorOffer.create({
    data: {
      companyId: user.companyId,
      competitorId: competitor.id,
      url: safeOfferUrl,
      currency: country.currency,
      vatIncluded: true,
      packagingUnit: product.packagingUnit,
      packagingQty: product.packagingQty,
      isActive: true,
    },
  })

  await prisma.productMatch.upsert({
    where: { competitorOfferId: offer.id },
    update: {
      productId: product.id,
      confidenceScore: 100,
      matchStatus: MatchStatus.CERTAIN,
      matchEvidence: { source: 'manual', reason: 'Handmatig gekoppeld in Prysight' },
      approvedBy: user.id,
      approvedAt: new Date(),
    },
    create: {
      companyId: user.companyId,
      productId: product.id,
      competitorOfferId: offer.id,
      confidenceScore: 100,
      matchStatus: MatchStatus.CERTAIN,
      matchEvidence: { source: 'manual', reason: 'Handmatig gekoppeld in Prysight' },
      approvedBy: user.id,
      approvedAt: new Date(),
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${product.id}`)
  revalidatePath('/concurrenten')
  redirect(`/producten/${product.id}?bron=toegevoegd`)
}

export async function updateCompetitorFrequencyAction(formData: FormData) {
  const user = await requireWritableUser()
  const competitorId = text(formData, 'competitorId')
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'))

  if (!competitorId) throw new Error('Concurrent ontbreekt.')

  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, companyId: user.companyId },
    select: { id: true },
  })
  if (!competitor) throw new Error('Concurrent niet gevonden.')

  await prisma.competitor.update({
    where: { id: competitorId },
    data: { checkFrequencyHours },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/concurrenten')
}

export async function runProductResearchAction(formData: FormData) {
  const user = await requireWritableUser()
  const productId = text(formData, 'productId')
  if (!productId) throw new Error('Product ontbreekt.')

  const product = await prisma.product.findFirst({ where: { id: productId, companyId: user.companyId, isActive: true }, select: { id: true } })
  if (!product) throw new Error('Product niet gevonden.')

  const summary = await runDuePriceChecks({ companyId: user.companyId, productId, limit: 20, force: true })
  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  redirect(`/producten/${productId}?controle=${summary.successful}-${summary.failed}`)
}
