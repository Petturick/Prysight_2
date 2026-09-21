'use server'

import { FeedSourceType, MatchStatus } from '@/generated/prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { assertCompanyCapacity } from '@/lib/company-license'
import { discoverCompetitorUrlsByEan } from '@/lib/ean-competitor-discovery'
import { discoverProductCandidates } from '@/lib/smart-discovery'
import { ingestCanonicalProducts } from '@/lib/feed-ingestion'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

const MANUAL_CHECK_FREQUENCY_HOURS = 876000

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

function requiredPrice(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Vul een geldige verkoopprijs groter dan 0 in.')
  return parsed
}

function normalizedBarcode(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function validGtinChecksum(value: string) {
  if (![8, 12, 13, 14].includes(value.length)) return false
  const digits = value.split('').map(Number)
  const check = digits.pop()
  if (check === undefined) return false
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}


export async function createProductAction(formData: FormData) {
  const user = await requirePermission('products.write')
  const articleNumber = text(formData, 'articleNumber')
  const name = text(formData, 'name')
  const ean = text(formData, 'ean')
  const productGroup = text(formData, 'productGroup') || 'Onbekend'
  const ownPrice = text(formData, 'ownPrice')
  const vatIncluded = text(formData, 'vatIncluded') !== 'false'
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
    products: [{ articleNumber, ean: ean || undefined, gtin: ean || undefined, name, productGroup, ownPrice: ownPrice || undefined, vatIncluded, currency, stockStatus, packagingUnit, packagingQty, countryCode: country?.code, ownUrl: ownUrl || undefined, isActive: true }],
    config: { mode: 'manual', createdBy: user.email },
  })
  const product = await prisma.product.findUnique({ where: { companyId_articleNumber: { companyId: user.companyId, articleNumber } } })
  if (!product) throw new Error('Product is verwerkt, maar kon niet opnieuw worden geladen.')
  let suggestionCount = 0
  if (product.ean && country && user.permissions.includes('competitors.write')) {
    try {
      const discovery = await discoverCompetitorUrlsByEan({ companyId: user.companyId, productId: product.id, countryId: country.id })
      suggestionCount = discovery.created
    } catch (error) { console.error('Automatic EAN competitor discovery failed', error) }
  }
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath('/feeds'); revalidatePath('/productmatches')
  const createParams = new URLSearchParams({ toegevoegd: '1', suggesties: String(suggestionCount) })
  if (country?.id) createParams.set('markt', country.id)
  redirect(`/producten/${product.id}?${createParams.toString()}`)
}

export async function updateProductOwnPriceAction(formData: FormData) {
  const user = await requirePermission('products.write')
  const productId = text(formData, 'productId')
  const countryId = text(formData, 'countryId')
  const ownPrice = requiredPrice(text(formData, 'ownPrice'))
  const vatIncluded = text(formData, 'vatIncluded') !== 'false'
  const stockStatus = text(formData, 'stockStatus') || 'Onbekend'
  const ownUrl = text(formData, 'ownUrl')
  if (!productId) throw new Error('Product ontbreekt.')

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: user.companyId, isActive: true },
    select: { id: true, ownPrice: true, currency: true },
  })
  if (!product) throw new Error('Product niet gevonden.')

  const country = countryId ? await requireLicensedCountry(user.companyId, countryId) : null
  const currency = text(formData, 'currency') || country?.currency || product.currency || 'EUR'
  const companyCountry = countryId
    ? await prisma.companyCountry.findFirst({
        where: { companyId: user.companyId, countryId, isActive: true },
        select: { isDefault: true },
      })
    : null

  await prisma.$transaction(async (tx) => {
    if (country) {
      await tx.product.update({ where: { id: productId }, data: { vatIncluded } })
      await tx.productMarket.upsert({
        where: { companyId_productId_countryId: { companyId: user.companyId, productId, countryId: country.id } },
        update: {
          ownPrice,
          currency,
          stockStatus,
          ownUrl: ownUrl || null,
          isActive: true,
        },
        create: {
          companyId: user.companyId,
          productId,
          countryId: country.id,
          ownPrice,
          currency,
          stockStatus,
          ownUrl: ownUrl || null,
          isActive: true,
        },
      })
      await tx.ownPriceHistory.create({
        data: { companyId: user.companyId, productId, countryId: country.id, recordedAt: new Date(), price: ownPrice, currency },
      })
      if (companyCountry?.isDefault || product.ownPrice === null) {
        await tx.product.update({
          where: { id: productId },
          data: { ownPrice, currency, stockStatus },
        })
      }
    } else {
      await tx.product.update({
        where: { id: productId },
        data: { ownPrice, currency, stockStatus, vatIncluded },
      })
      await tx.ownPriceHistory.create({
        data: { companyId: user.companyId, productId, countryId: null, recordedAt: new Date(), price: ownPrice, currency },
      })
    }
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  revalidatePath('/prijsstrategie')
  const priceParams = new URLSearchParams({ prijs: 'bijgewerkt' })
  if (countryId) priceParams.set('markt', countryId)
  redirect(`/producten/${productId}?${priceParams.toString()}#eigen-prijs`)
}

export async function updateProductIdentifiersAction(formData: FormData) {
  const user = await requirePermission('products.write')
  const productId = text(formData, 'productId')
  const countryId = text(formData, 'countryId')
  const ean = normalizedBarcode(text(formData, 'ean'))
  const gtinInput = normalizedBarcode(text(formData, 'gtin'))

  if (!productId) throw new Error('Product ontbreekt.')
  if (ean && !validGtinChecksum(ean)) throw new Error('Controleer het EAN. De controlecode klopt niet.')
  if (gtinInput && !validGtinChecksum(gtinInput)) throw new Error('Controleer het GTIN. De controlecode klopt niet.')

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: user.companyId, isActive: true },
    select: { id: true },
  })
  if (!product) throw new Error('Product niet gevonden.')

  const gtin = gtinInput || ean
  await prisma.product.update({
    where: { id: productId },
    data: {
      ean: ean || null,
      gtin: gtin || null,
    },
  })

  let discovery: {
    created: number
    found: number
    reason?: string | null
    alreadyLinked?: number
    provider?: string | null
    queryMode?: string | null
  } = { created: 0, found: 0, reason: ean || gtin ? 'Nog geen concurrentsuggesties gevonden.' : 'EAN en GTIN zijn leeg.' }

  const canDiscover = user.role === 'SUPER_ADMIN' || user.permissions.includes('competitors.write')
  if (countryId && (ean || gtin) && canDiscover) {
    await requireLicensedCountry(user.companyId, countryId)
    try {
      discovery = await discoverProductCandidates({ companyId: user.companyId, productId, countryId })
    } catch (error) {
      console.error('Product identifier discovery failed', { companyId: user.companyId, productId, error })
      discovery = { created: 0, found: 0, reason: 'Productgegevens zijn opgeslagen, maar concurrentherkenning kon niet direct worden afgerond.' }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  revalidatePath('/productmatches')

  const params = new URLSearchParams({
    identiteit: 'bijgewerkt',
    suggesties: String(discovery.created),
    gevonden: String(discovery.found),
    algekoppeld: String(discovery.alreadyLinked ?? 0),
    zoekbron: discovery.provider ?? '',
    zoekmodus: discovery.queryMode ?? (ean ? 'EAN' : 'PRODUCT'),
    reden: discovery.reason ?? '',
  })
  if (countryId) params.set('markt', countryId)
  redirect(`/producten/${productId}?${params.toString()}#concurrenten-vinden`)
}

export async function createCompetitorAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const name = text(formData, 'name')
  const websiteInput = text(formData, 'website')
  const countryId = text(formData, 'countryId')
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'), 24)
  if (!name || !websiteInput || !countryId) throw new Error('Naam, website en land zijn verplicht.')
  await requireLicensedCountry(user.companyId, countryId)
  const safeWebsite = (await assertSafeRemoteHttpUrl(websiteInput)).toString()
  const website = new URL(safeWebsite).origin
  const where = { companyId_name_countryId: { companyId: user.companyId, name, countryId } }
  const existing = await prisma.competitor.findUnique({ where })
  if (!existing) await assertCompanyCapacity(user.companyId, 'competitors')
  await prisma.competitor.upsert({ where, update: { website, isActive: true, checkFrequencyHours }, create: { companyId: user.companyId, name, website, countryId, isActive: true, checkFrequencyHours } })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath('/concurrenten')
  redirect('/concurrenten?toegevoegd=1')
}

export async function addCompetitorOfferAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
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
  const competitor = await prisma.competitor.upsert({ where: competitorWhere, update: { website, isActive: true, checkFrequencyHours }, create: { companyId: user.companyId, name: competitorName, website, countryId, isActive: true, checkFrequencyHours } })
  const existingOffer = await prisma.competitorOffer.findUnique({ where: { companyId_competitorId_url: { companyId: user.companyId, competitorId: competitor.id, url: safeOfferUrl } }, include: { productMatch: true } })
  if (existingOffer?.productMatch && existingOffer.productMatch.productId !== product.id) throw new Error('Deze concurrent URL is al aan een ander product gekoppeld.')
  const offer = existingOffer ?? await prisma.competitorOffer.create({ data: { companyId: user.companyId, competitorId: competitor.id, url: safeOfferUrl, currency: country.currency, vatIncluded: true, packagingUnit: product.packagingUnit, packagingQty: product.packagingQty, isActive: true } })
  await prisma.productMatch.upsert({
    where: { competitorOfferId: offer.id },
    update: { productId: product.id, confidenceScore: 100, matchStatus: MatchStatus.CERTAIN, matchEvidence: { source: 'manual', reason: 'Handmatig gekoppeld in Prysight' }, approvedBy: user.id, approvedAt: new Date() },
    create: { companyId: user.companyId, productId: product.id, competitorOfferId: offer.id, confidenceScore: 100, matchStatus: MatchStatus.CERTAIN, matchEvidence: { source: 'manual', reason: 'Handmatig gekoppeld in Prysight' }, approvedBy: user.id, approvedAt: new Date() },
  })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath(`/producten/${product.id}`); revalidatePath('/concurrenten')
  redirect(`/producten/${product.id}?markt=${encodeURIComponent(countryId)}&bron=toegevoegd`)
}

export async function updateCompetitorOfferAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const productId = text(formData, 'productId')
  const competitorOfferId = text(formData, 'competitorOfferId')
  const competitorName = text(formData, 'competitorName')
  const offerUrl = text(formData, 'offerUrl')
  const packagingUnit = text(formData, 'packagingUnit') || 'stuks'
  const packagingQty = positiveInteger(text(formData, 'packagingQty'))
  const vatIncluded = text(formData, 'vatIncluded') !== 'false'
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'), 24)

  if (!productId || !competitorOfferId || !competitorName || !offerUrl) {
    throw new Error('Concurrent, product en product URL zijn verplicht.')
  }

  const existing = await prisma.competitorOffer.findFirst({
    where: {
      id: competitorOfferId,
      companyId: user.companyId,
      productMatch: { companyId: user.companyId, productId },
    },
    include: { competitor: true },
  })
  if (!existing) throw new Error('Concurrentiebron niet gevonden.')

  const safeOfferUrl = (await assertSafeRemoteHttpUrl(offerUrl)).toString()
  const duplicateCompetitor = await prisma.competitor.findUnique({
    where: {
      companyId_name_countryId: {
        companyId: user.companyId,
        name: competitorName,
        countryId: existing.competitor.countryId,
      },
    },
    select: { id: true },
  })
  if (duplicateCompetitor && duplicateCompetitor.id !== existing.competitorId) {
    throw new Error('Er bestaat in dit land al een andere concurrent met deze naam.')
  }

  const duplicateOffer = await prisma.competitorOffer.findFirst({
    where: {
      companyId: user.companyId,
      competitorId: existing.competitorId,
      url: safeOfferUrl,
      NOT: { id: existing.id },
    },
    select: { id: true },
  })
  if (duplicateOffer) throw new Error('Deze product URL is al gekoppeld aan dezelfde concurrent.')

  const urlChanged = existing.url !== safeOfferUrl
  await prisma.$transaction([
    prisma.competitor.update({
      where: { id: existing.competitorId },
      data: {
        name: competitorName,
        website: new URL(safeOfferUrl).origin,
        checkFrequencyHours,
      },
    }),
    prisma.competitorOffer.update({
      where: { id: existing.id },
      data: {
        url: safeOfferUrl,
        packagingUnit,
        packagingQty,
        vatIncluded,
        ...(urlChanged
          ? {
              rawPrice: null,
              normalizedPrice: null,
              stockStatus: null,
              lastCheckedAt: null,
            }
          : {}),
      },
    }),
  ])

  await createAuditLog({
    companyId: user.companyId,
    userId: user.id,
    action: 'COMPETITOR_OFFER_UPDATED',
    entityType: 'CompetitorOffer',
    entityId: existing.id,
    oldValue: {
      competitorName: existing.competitor.name,
      url: existing.url,
      packagingUnit: existing.packagingUnit,
      packagingQty: existing.packagingQty,
      vatIncluded: existing.vatIncluded,
      checkFrequencyHours: existing.competitor.checkFrequencyHours,
    },
    newValue: {
      competitorName,
      url: safeOfferUrl,
      packagingUnit,
      packagingQty,
      vatIncluded,
      checkFrequencyHours,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  revalidatePath('/concurrenten')
  revalidatePath('/monitoring')
  redirect(`/producten/${productId}?concurrent=${existing.id}&bron=bijgewerkt#concurrentieprijzen`)
}

export async function removeCompetitorOfferAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const productId = text(formData, 'productId')
  const competitorOfferId = text(formData, 'competitorOfferId')
  if (!productId || !competitorOfferId) throw new Error('Product of concurrent ontbreekt.')

  const match = await prisma.productMatch.findFirst({
    where: {
      companyId: user.companyId,
      productId,
      competitorOfferId,
      competitorOffer: { companyId: user.companyId },
    },
    select: { id: true, competitorOfferId: true },
  })
  if (!match) throw new Error('Deze concurrent is niet meer aan het product gekoppeld.')

  await prisma.$transaction([
    prisma.productMatch.delete({ where: { id: match.id } }),
    prisma.competitorOffer.update({
      where: { id: match.competitorOfferId },
      data: { isActive: false },
    }),
  ])

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  revalidatePath('/productmatches')
  revalidatePath('/concurrenten')
}

export async function discoverCompetitorUrlsAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const productId = text(formData, 'productId')
  const countryId = text(formData, 'countryId')
  if (!productId || !countryId) throw new Error('Product en markt zijn verplicht voor concurrentonderzoek.')
  await requireLicensedCountry(user.companyId, countryId)

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: user.companyId, isActive: true },
    select: { id: true, ean: true },
  })
  if (!product) throw new Error('Product niet gevonden.')

  const result = await discoverProductCandidates({ companyId: user.companyId, productId, countryId })
  const alreadyLinked = 'alreadyLinked' in result ? Number(result.alreadyLinked ?? 0) : 0
  const provider = 'provider' in result ? String(result.provider ?? '') : ''
  const queryMode = 'queryMode' in result ? String(result.queryMode ?? '') : product.ean ? 'EAN' : 'PRODUCT'

  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath(`/producten/${productId}`); revalidatePath('/productmatches'); revalidatePath('/concurrenten')
  const params = new URLSearchParams({
    suggesties: String(result.created),
    gevonden: String(result.found),
    algekoppeld: String(alreadyLinked),
    zoekbron: provider,
    zoekmodus: queryMode,
    reden: result.reason ?? '',
  })
  params.set('markt', countryId)
  redirect(`/producten/${productId}?${params.toString()}#concurrenten-vinden`)
}

export async function updateCompetitorFrequencyAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const competitorId = text(formData, 'competitorId')
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'))
  if (!competitorId) throw new Error('Concurrent ontbreekt.')
  const competitor = await prisma.competitor.findFirst({ where: { id: competitorId, companyId: user.companyId }, select: { id: true } })
  if (!competitor) throw new Error('Concurrent niet gevonden.')
  await prisma.competitor.update({ where: { id: competitorId }, data: { checkFrequencyHours } })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath('/concurrenten')
}

export async function runProductResearchAction(formData: FormData) {
  const user = await requirePermission('pricing.manage')
  const productId = text(formData, 'productId')
  if (!productId) throw new Error('Product ontbreekt.')
  const product = await prisma.product.findFirst({ where: { id: productId, companyId: user.companyId, isActive: true }, select: { id: true } })
  if (!product) throw new Error('Product niet gevonden.')
  const summary = await runDuePriceChecks({ companyId: user.companyId, productId, limit: 20, force: true })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath(`/producten/${productId}`)
  redirect(`/producten/${productId}?controle=${summary.successful}-${summary.failed}`)
}

export async function runCompetitorOfferResearchAction(formData: FormData) {
  const user = await requirePermission('pricing.manage')
  const productId = text(formData, 'productId')
  const competitorOfferId = text(formData, 'competitorOfferId')
  if (!productId || !competitorOfferId) throw new Error('Product of concurrentiebron ontbreekt.')
  const offer = await prisma.competitorOffer.findFirst({
    where: { id: competitorOfferId, companyId: user.companyId, isActive: true, productMatch: { companyId: user.companyId, productId } },
    select: { id: true },
  })
  if (!offer) throw new Error('Concurrentiebron niet gevonden of niet actief.')
  const summary = await runDuePriceChecks({ companyId: user.companyId, competitorOfferId: offer.id, limit: 1, force: true })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath(`/producten/${productId}`); revalidatePath('/monitoring')
  redirect(`/producten/${productId}?broncontrole=${summary.successful}-${summary.failed}#concurrentieprijzen`)
}
