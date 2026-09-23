'use server'

import { FeedSourceType, MatchStatus, Prisma } from '@/generated/prisma/client'
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
import { parseOptionalShipping, validateVatPricePair } from '@/lib/manual-price-input'
import { normalizePrice } from '@/lib/price-normalization'
import { convertWithFxSnapshot, getFxSnapshot } from '@/lib/fx-rates'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'
import { findExistingProduct } from '@/lib/product-duplicate'
import { normalizeGtin, validGtin } from '@/lib/gtin'

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



export async function createProductAction(formData: FormData) {
  const user = await requirePermission('products.write')
  const articleNumber = text(formData, 'articleNumber')
  const name = text(formData, 'name')
  const ean = normalizeGtin(text(formData, 'ean'))
  if (ean && !validGtin(ean)) throw new Error('Ongeldige EAN of GTIN. Controleer het aantal cijfers en de controlecode.')
  const productGroup = text(formData, 'productGroup') || 'Onbekend'
  const vatIncluded = text(formData, 'vatIncluded') !== 'false'
  const rawOwnPrice = text(formData, 'ownPrice')
  const ownShippingCost = parseOptionalShipping(text(formData, 'ownShippingCost'))
  const ownShippingVatIncluded = text(formData, 'ownShippingVatIncluded') !== 'false'
  const stockStatus = text(formData, 'stockStatus') || 'Onbekend'
  const packagingUnit = text(formData, 'packagingUnit') || 'stuks'
  const packagingQty = positiveInteger(text(formData, 'packagingQty'))
  const countryId = text(formData, 'countryId')
  const ownUrl = text(formData, 'ownUrl')
  if (!articleNumber || !name) throw new Error('Artikelnummer en productnaam zijn verplicht.')
  const country = countryId ? await requireLicensedCountry(user.companyId, countryId) : null
  const currency = text(formData, 'currency') || country?.currency || 'EUR'
  const ownPrice = String(validateVatPricePair({primary:rawOwnPrice,opposite:text(formData,'ownPriceOther'),vatIncluded,vatRate:country?Number(country.vatRate):null}))
  const existingProduct = await findExistingProduct({
    companyId: user.companyId,
    articleNumber,
    ean: ean || null,
    gtin: ean || null,
    ownUrl: ownUrl || null,
  })
  if (existingProduct) {
    const params = new URLSearchParams({ dubbel: '1' })
    if (country?.id) params.set('markt', country.id)
    redirect(`/producten/${existingProduct.id}?${params.toString()}#product-identiteit`)
  }
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
  await prisma.$transaction(async (tx) => {
    await tx.product.update({where:{id:product.id},data:{ownShippingCost,ownShippingVatIncluded}})
    if(country) await tx.productMarket.updateMany({where:{companyId:user.companyId,productId:product.id,countryId:country.id},data:{vatIncluded,ownShippingCost,ownShippingVatIncluded}})
  })
  let suggestionCount = 0
  if (product.ean && country && user.permissions.includes('competitors.write')) {
    try {
      const discovery = await discoverCompetitorUrlsByEan({ companyId: user.companyId, productId: product.id, countryId: country.id })
      suggestionCount = discovery.created
      if (discovery.created > 0) {
        try {
          await runDuePriceChecks({ companyId: user.companyId, productId: product.id, limit: 4, force: true })
        } catch (checkError) {
          console.error('Automatic price and shipping check failed after EAN discovery', { companyId: user.companyId, productId: product.id, error: checkError })
        }
      }
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
  const vatIncluded = text(formData, 'vatIncluded') !== 'false'
  const ownShippingCost = parseOptionalShipping(text(formData, 'ownShippingCost'))
  const ownShippingVatIncluded = text(formData, 'ownShippingVatIncluded') !== 'false'
  const stockStatus = text(formData, 'stockStatus') || 'Onbekend'
  const ownUrl = text(formData, 'ownUrl')
  if (!productId) throw new Error('Product ontbreekt.')

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: user.companyId, isActive: true },
    select: { id: true, ownPrice: true, currency: true },
  })
  if (!product) throw new Error('Product niet gevonden.')

  const country = countryId ? await requireLicensedCountry(user.companyId, countryId) : null
  const ownPrice = validateVatPricePair({primary:text(formData,'ownPrice'),opposite:text(formData,'ownPriceOther'),vatIncluded,vatRate:country?Number(country.vatRate):null})
  const currency = text(formData, 'currency') || country?.currency || product.currency || 'EUR'
  const companyCountry = countryId
    ? await prisma.companyCountry.findFirst({
        where: { companyId: user.companyId, countryId, isActive: true },
        select: { isDefault: true },
      })
    : null

  await prisma.$transaction(async (tx) => {
    if (country) {
      await tx.productMarket.upsert({
        where: { companyId_productId_countryId: { companyId: user.companyId, productId, countryId: country.id } },
        update: {
          ownPrice,
          vatIncluded,
          ownShippingCost,
          ownShippingVatIncluded,
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
          vatIncluded,
          ownShippingCost,
          ownShippingVatIncluded,
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
          data: { ownPrice, currency, stockStatus, vatIncluded, ownShippingCost, ownShippingVatIncluded },
        })
      }
    } else {
      await tx.product.update({
        where: { id: productId },
        data: { ownPrice, currency, stockStatus, vatIncluded, ownShippingCost, ownShippingVatIncluded },
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
  const ean = normalizeGtin(text(formData, 'ean'))
  const gtinInput = normalizeGtin(text(formData, 'gtin'))

  if (!productId) throw new Error('Product ontbreekt.')
  if (ean && !validGtin(ean)) throw new Error('Controleer het EAN. De controlecode klopt niet.')
  if (gtinInput && !validGtin(gtinInput)) throw new Error('Controleer het GTIN. De controlecode klopt niet.')

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: user.companyId, isActive: true },
    select: { id: true },
  })
  if (!product) throw new Error('Product niet gevonden.')

  const gtin = gtinInput || ean
  const duplicate = await findExistingProduct({
    companyId: user.companyId,
    ean: ean || null,
    gtin: gtin || null,
    excludeProductId: productId,
  })
  if (duplicate) {
    redirect(`/producten/${duplicate.id}?dubbel=1#product-identiteit`)
  }

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
      if (discovery.created > 0) {
        try {
          await runDuePriceChecks({ companyId: user.companyId, productId, limit: 4, force: true })
        } catch (checkError) {
          console.error('Automatic price and shipping check failed after product identifier discovery', { companyId: user.companyId, productId, error: checkError })
        }
      }
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
  const country = await requireLicensedCountry(user.companyId, countryId)
  const safeWebsite = (await assertSafeRemoteHttpUrl(websiteInput)).toString()
  const website = new URL(safeWebsite).origin
  const where = { companyId_name_countryId: { companyId: user.companyId, name, countryId } }
  const existing = await prisma.competitor.findUnique({ where })
  if (!existing) await assertCompanyCapacity(user.companyId, 'competitors')
  await prisma.competitor.upsert({ where, update: { website, isActive: true, checkFrequencyHours }, create: { companyId: user.companyId, name, website, countryId, isActive: true, checkFrequencyHours } })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath('/concurrenten')
  redirect(`/concurrenten?markt=${encodeURIComponent(country.code)}&toegevoegd=1`)
}

export async function updateCompetitorDetailsAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const competitorId = text(formData, 'competitorId')
  const name = text(formData, 'name')
  const websiteInput = text(formData, 'website')
  const countryId = text(formData, 'countryId')
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'), 24)
  if (!competitorId || name.length < 2 || name.length > 120 || !countryId || !websiteInput) {
    throw new Error('Vul een geldige concurrentnaam, website en markt in.')
  }

  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, companyId: actor.companyId },
    select: {
      id: true, name: true, website: true, countryId: true, checkFrequencyHours: true,
      _count: { select: { offers: true, webshops: true, alertRules: true } },
    },
  })
  if (!competitor) throw new Error('Concurrent niet gevonden binnen deze organisatie.')
  const marketChanged = competitor.countryId !== countryId
  if (marketChanged && (competitor._count.offers > 0 || competitor._count.webshops > 0 || competitor._count.alertRules > 0)) {
    throw new Error('Deze concurrent heeft al productprijzen of gekoppelde gegevens. Maak voor een andere markt een nieuwe concurrent aan zodat de bestaande prijzen en historie in het juiste land blijven.')
  }
  if (marketChanged) await requireLicensedCountry(actor.companyId, countryId)
  const safeWebsite = (await assertSafeRemoteHttpUrl(websiteInput)).toString()
  const website = new URL(safeWebsite).origin
  const duplicate = await prisma.competitor.findUnique({
    where: { companyId_name_countryId: { companyId: actor.companyId, name, countryId } },
    select: { id: true },
  })
  if (duplicate && duplicate.id !== competitorId) throw new Error('Er bestaat al een concurrent met deze naam in deze markt.')

  await prisma.competitor.update({
    where: { id: competitorId, companyId: actor.companyId },
    data: { name, website, countryId, checkFrequencyHours },
  })
  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'COMPETITOR_DETAILS_UPDATED',
    entityType: 'Competitor',
    entityId: competitorId,
    oldValue: { name: competitor.name, website: competitor.website, countryId: competitor.countryId, checkFrequencyHours: competitor.checkFrequencyHours },
    newValue: { name, website, countryId, checkFrequencyHours },
  })
  revalidatePath('/concurrenten')
  revalidatePath(`/concurrenten/${competitorId}`)
  revalidatePath(`/concurrenten/${competitorId}/bewerken`)
  revalidatePath('/beheer/concurrenten')
  revalidatePath('/monitoring')
  revalidatePath('/dashboard')
  redirect(`/concurrenten/${competitorId}?bijgewerkt=1`)
}

export async function addCompetitorOfferAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const productId = text(formData, 'productId')
  const competitorName = text(formData, 'competitorName')
  const countryId = text(formData, 'countryId')
  const offerUrl = text(formData, 'offerUrl')
  const checkFrequencyHours = monitoringFrequency(text(formData, 'checkFrequencyHours'), 24)
  if (!productId || !competitorName || !countryId || !offerUrl) throw new Error('Product, concurrent, land en product URL zijn verplicht.')
  const product = await prisma.product.findFirst({ where: { id: productId, companyId: user.companyId, isActive: true }, select: { id: true, ean: true, gtin: true, packagingUnit: true, packagingQty: true } })
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
  if (product.ean || product.gtin) {
    try {
      await runDuePriceChecks({ companyId: user.companyId, competitorOfferId: offer.id, limit: 1, force: true })
    } catch (error) {
      console.error('Automatic competitor price and shipping check failed after manual source link', {
        companyId: user.companyId, productId: product.id, competitorOfferId: offer.id, error,
      })
    }
  }
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
  const manualPriceText = text(formData, 'manualPrice')
  const manualShippingText = text(formData, 'manualShippingCost')
  if (!manualPriceText && manualShippingText) throw new Error('Vul ook de handmatige productprijs in als je de verzendkosten van deze concurrent wilt vastleggen.')

  if (!productId || !competitorOfferId || !competitorName || !offerUrl) {
    throw new Error('Concurrent, product en product URL zijn verplicht.')
  }

  const existing = await prisma.competitorOffer.findFirst({
    where: {
      id: competitorOfferId,
      companyId: user.companyId,
      productMatch: { companyId: user.companyId, productId },
    },
    include: { competitor: { include: { country: true } }, productMatch: { include: { product: { select: { ean: true, gtin: true } } } } },
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
  if (urlChanged && manualPriceText) throw new Error('Sla de nieuwe product URL eerst op en controleer daarna de handmatige prijs.')
  const manualPrice = manualPriceText
    ? validateVatPricePair({
        primary: manualPriceText, opposite: text(formData, 'manualPriceOther'),
        vatIncluded, vatRate: Number(existing.competitor.country.vatRate),
      })
    : null
  const manualShipping = manualPrice === null ? null : parseOptionalShipping(manualShippingText)
  const manualShippingVatIncluded = text(formData, 'manualShippingVatIncluded') !== 'false'
  const now = new Date()
  const currency = existing.currency.toUpperCase()
  const fxSnapshot = manualPrice !== null && currency !== 'EUR' ? await getFxSnapshot() : null
  // Never silently compare prices in different currencies without a credible rate.
  if (fxSnapshot?.source === 'FALLBACK') throw new Error('Actuele wisselkoers ontbreekt. Controleer de prijs later opnieuw of voer een EUR prijsbron in.')
  const fxAmount = (amount: number) => currency === 'EUR' ? amount : convertWithFxSnapshot(amount, currency, 'EUR', fxSnapshot!)
  const normalizedPrice = manualPrice === null ? null : normalizePrice(
    new Prisma.Decimal(fxAmount(manualPrice)), vatIncluded, existing.competitor.country.vatRate,
    'EUR', packagingUnit, packagingQty, true, 'EUR',
  ).amount
  const normalizedShipping = manualShipping === null ? null : normalizePrice(
    new Prisma.Decimal(fxAmount(manualShipping)), manualShippingVatIncluded, existing.competitor.country.vatRate,
    'EUR', packagingUnit, packagingQty, true, 'EUR',
  ).amount
  const deliveredPrice = normalizedPrice === null || normalizedShipping === null ? null : normalizedPrice.add(normalizedShipping)
  const manualData = manualPrice === null ? {} : {
    rawPrice: new Prisma.Decimal(manualPrice),
    normalizedPrice,
    shippingCost: manualShipping === null ? null : new Prisma.Decimal(manualShipping),
    normalizedShippingCost: normalizedShipping,
    deliveredPrice,
    shippingCurrency: manualShipping === null ? null : currency,
    shippingLabel: manualShipping === null ? 'Verzendkosten niet vastgesteld' : manualShipping === 0 ? 'Gratis verzending' : 'Handmatig ingevoerde verzendkosten',
    currency,
    lastCheckedAt: now,
  }
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
        ...manualData,
        ...(urlChanged
          ? {
              rawPrice: null,
              normalizedPrice: null,
              shippingCost: null,
              normalizedShippingCost: null,
              deliveredPrice: null,
              shippingCurrency: null,
              shippingLabel: null,
              stockStatus: null,
              lastCheckedAt: null,
            }
          : {}),
      },
    }),
    ...(manualPrice === null ? [] : [
      prisma.priceCheck.create({data:{
        companyId:user.companyId,competitorOfferId:existing.id,checkedAt:now,foundPrice:new Prisma.Decimal(manualPrice),
        shippingCost:manualShipping===null?null:new Prisma.Decimal(manualShipping),normalizedShippingCost:normalizedShipping,
        deliveredPrice,shippingCurrency:manualShipping===null?null:currency,
        shippingLabel:manualShipping===null?'Verzendkosten niet vastgesteld':'Handmatig ingevoerd',
        currency,checkMethod:'MANUAL',sourceUrl:safeOfferUrl,isSuccess:true,stockStatus:existing.stockStatus,
        productTitle:null,packagingUnit,
      }}),
      prisma.priceHistory.create({data:{
        companyId:user.companyId,competitorOfferId:existing.id,recordedAt:now,price:new Prisma.Decimal(manualPrice),
        normalizedPrice,shippingCost:manualShipping===null?null:new Prisma.Decimal(manualShipping),
        normalizedShippingCost:normalizedShipping,deliveredPrice,
        shippingCurrency:manualShipping===null?null:currency,
        shippingLabel:manualShipping===null?'Verzendkosten niet vastgesteld':'Handmatig ingevoerd',
        currency,stockStatus:existing.stockStatus,source:'MANUAL',
      }}),
    ]),
  ])

  if (urlChanged && (existing.productMatch?.product.ean || existing.productMatch?.product.gtin)) {
    try {
      await runDuePriceChecks({ companyId: user.companyId, competitorOfferId: existing.id, limit: 1, force: true })
    } catch (error) {
      console.error('Automatic competitor price and shipping check failed after source URL update', {
        companyId: user.companyId, productId, competitorOfferId: existing.id, error,
      })
    }
  }

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
  redirect(`/producten/${productId}?markt=${encodeURIComponent(existing.competitor.countryId)}&concurrent=${existing.id}&bron=bijgewerkt#concurrentieprijzen`)
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

  await prisma.$transaction(async (tx) => {
    await tx.alert.deleteMany({ where: { companyId: user.companyId, competitorOfferId: match.competitorOfferId } })
    await tx.productMatch.delete({ where: { id: match.id } })
    await tx.competitorOffer.update({
      where: { id: match.competitorOfferId, companyId: user.companyId },
      data: { isActive: false },
    })
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  revalidatePath('/productmatches')
  revalidatePath('/concurrenten')
  revalidatePath('/waarschuwingen')
  revalidatePath('/monitoring')
}

export async function refreshProductIntelligenceAction(formData: FormData) {
  const user = await requirePermission('competitors.write')
  const productId = text(formData, 'productId')
  const countryId = text(formData, 'countryId')
  if (!productId || !countryId) throw new Error('Product en markt zijn verplicht om prijzen en concurrenten op te halen.')

  await requireLicensedCountry(user.companyId, countryId)
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: user.companyId, isActive: true },
    select: { id: true, ean: true, gtin: true },
  })
  if (!product) throw new Error('Product niet gevonden.')
  if (![product.ean, product.gtin].some(validGtin)) throw new Error('Voeg een geldige EAN of GTIN toe om automatisch te kunnen zoeken.')

  let discovery = { found: 0, created: 0, alreadyLinked: 0, reason: null as string | null, provider: null as string | null }
  try {
    const result = await discoverProductCandidates({ companyId: user.companyId, productId, countryId })
    discovery = {
      found: Number(result.found ?? 0),
      created: Number(result.created ?? 0),
      alreadyLinked: 'alreadyLinked' in result ? Number(result.alreadyLinked ?? 0) : 0,
      reason: result.reason ?? null,
      provider: 'provider' in result ? String(result.provider ?? '') || null : null,
    }
  } catch (error) {
    discovery.reason = error instanceof Error ? error.message : 'Concurrenten zoeken is niet volledig gelukt.'
    console.error('Product intelligence discovery failed', { companyId: user.companyId, productId, countryId, error })
  }

  let successful = 0
  let failed = 0
  try {
    const checks = await runDuePriceChecks({
      companyId: user.companyId,
      productId,
      limit: 12,
      force: true,
    })
    successful = checks.successful
    failed = checks.failed
  } catch (error) {
    failed = 1
    console.error('Product intelligence price refresh failed', { companyId: user.companyId, productId, countryId, error })
  }

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${productId}`)
  revalidatePath('/productmatches')
  revalidatePath('/concurrenten')
  revalidatePath('/monitoring')

  const params = new URLSearchParams({
    markt: countryId,
    intelligence: 'updated',
    gevonden: String(discovery.found),
    nieuw: String(discovery.created),
    gekoppeld: String(discovery.alreadyLinked),
    prijzen: String(successful),
    fouten: String(failed),
  })
  if (discovery.provider) params.set('zoekbron', discovery.provider)
  if (discovery.reason) params.set('reden', discovery.reason)
  redirect(`/producten/${productId}?${params.toString()}#ean-prijssuggesties`)
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
    select: { id: true, competitor: { select: { countryId: true } } },
  })
  if (!offer) throw new Error('Concurrentiebron niet gevonden of niet actief.')
  const summary = await runDuePriceChecks({ companyId: user.companyId, competitorOfferId: offer.id, limit: 1, force: true })
  revalidatePath('/dashboard'); revalidatePath('/producten'); revalidatePath(`/producten/${productId}`); revalidatePath('/monitoring')
  redirect(`/producten/${productId}?markt=${encodeURIComponent(offer.competitor.countryId)}&broncontrole=${summary.successful}-${summary.failed}#concurrentieprijzen`)
}
