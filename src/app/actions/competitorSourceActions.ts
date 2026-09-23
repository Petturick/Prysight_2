'use server'

import { MatchStatus } from '@/generated/prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'
import { runDuePriceChecks } from '@/lib/price-monitoring'

function field(data: FormData, name: string) {
  const value = data.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function refreshSourcePages(competitorId: string, offerId: string, productIds: Array<string | null | undefined>) {
  for (const path of [
    '/concurrenten', `/concurrenten/${competitorId}`,
    `/concurrenten/${competitorId}/bronnen/${offerId}/bewerken`,
    '/producten', '/productmatches', '/dashboard', '/monitoring', '/waarschuwingen', '/acties',
    ...productIds.filter((id): id is string => Boolean(id)).map((id) => `/producten/${id}`),
  ]) revalidatePath(path)
}

export async function saveCompetitorSourceAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const competitorId = field(formData, 'competitorId')
  const offerId = field(formData, 'offerId')
  const productId = field(formData, 'productId')
  const offerUrl = field(formData, 'offerUrl')
  const confirmedReset = field(formData, 'confirmReset') === 'on'
  const packagingQty = Number(field(formData, 'packagingQty'))
  const packagingUnit = field(formData, 'packagingUnit') || 'stuks'
  const vatIncluded = field(formData, 'vatIncluded') === 'true'
  if (!competitorId || !offerId || !offerUrl || packagingUnit.length > 40 ||
      !Number.isSafeInteger(packagingQty) || packagingQty < 1 || packagingQty > 100000) {
    throw new Error('Vul een product URL, verpakkingseenheid en geldig aantal per verpakking in.')
  }

  const offer = await prisma.competitorOffer.findFirst({
    where: { id: offerId, competitorId, companyId: actor.companyId, isActive: true },
    include: {
      competitor: { select: { id: true, website: true, countryId: true, isActive: true } },
      productMatch: { select: { id: true, productId: true } },
    },
  })
  if (!offer) throw new Error('Prijsbron niet gevonden binnen deze organisatie of concurrent.')
  await requireLicensedCountry(actor.companyId, offer.competitor.countryId)
  const safeUrl = (await assertSafeRemoteHttpUrl(offerUrl)).toString()
  const urlChanged = safeUrl !== offer.url
  if (urlChanged) {
    const websiteHost = new URL(offer.competitor.website).hostname.replace(/^www\./, '')
    const sourceHost = new URL(safeUrl).hostname.replace(/^www\./, '')
    if (sourceHost !== websiteHost && !sourceHost.endsWith(`.${websiteHost}`)) {
      throw new Error('De nieuwe product URL hoort niet bij de website van deze concurrent. Wijzig eerst de concurrent of kies de juiste prijsbron.')
    }
  }
  const productChanged = (offer.productMatch?.productId ?? '') !== productId
  const packagingChanged = packagingQty !== (offer.packagingQty ?? 1) || packagingUnit !== (offer.packagingUnit ?? 'stuks') || vatIncluded !== offer.vatIncluded
  const resetMeasurements = urlChanged || productChanged || packagingChanged
  if (resetMeasurements && !confirmedReset) {
    throw new Error('Bevestig dat oude prijsmetingen van deze bron worden gewist wanneer je de URL, productkoppeling, verpakking of btw wijzigt.')
  }

  if (urlChanged) {
    const duplicate = await prisma.competitorOffer.findFirst({
      where: { companyId: actor.companyId, competitorId, url: safeUrl, NOT: { id: offerId } },
      select: { id: true },
    })
    if (duplicate) throw new Error('Deze product URL bestaat al bij deze concurrent. Bewerk de bestaande bron.')
  }
  let product: { id: string; packagingUnit: string | null; packagingQty: number | null } | null = null
  if (productId) {
    product = await prisma.product.findFirst({
      where: { id: productId, companyId: actor.companyId, isActive: true },
      select: { id: true, packagingUnit: true, packagingQty: true },
    })
    if (!product) throw new Error('Het gekozen product bestaat niet of hoort niet bij jouw organisatie.')
  }

  await prisma.$transaction(async (tx) => {
    if (resetMeasurements) {
      await tx.alert.deleteMany({ where: { companyId: actor.companyId, competitorOfferId: offerId } })
      await tx.priceHistory.deleteMany({ where: { companyId: actor.companyId, competitorOfferId: offerId } })
      await tx.priceCheck.deleteMany({ where: { companyId: actor.companyId, competitorOfferId: offerId } })
    }

    if (productChanged) {
      if (offer.productMatch) await tx.productMatch.delete({ where: { id: offer.productMatch.id, companyId: actor.companyId } })
      if (product) {
        // A product can be assigned to a new country explicitly without copying Dutch selling prices.
        const existingMarket = await tx.productMarket.findUnique({
          where: { companyId_productId_countryId: { companyId: actor.companyId, productId: product.id, countryId: offer.competitor.countryId } },
          select: { isActive: true },
        })
        if (existingMarket && !existingMarket.isActive) throw new Error('Dit product is in deze markt gepauzeerd. Activeer het product eerst bij Producten.')
        if (!existingMarket) {
          if (actor.role !== 'SUPER_ADMIN' && !actor.permissions.includes('products.write')) {
            throw new Error('Het product is nog niet actief in deze markt. Vraag een productbeheerder het product aan deze markt toe te voegen.')
          }
          const country = await tx.country.findUnique({ where: { id: offer.competitor.countryId }, select: { currency: true } })
          if (!country) throw new Error('De markt bestaat niet meer.')
          await tx.productMarket.create({
            data: { companyId: actor.companyId, productId: product.id, countryId: offer.competitor.countryId, currency: country.currency, ownPrice: null, isActive: true },
          })
        }
        await tx.productMatch.create({
          data: {
            companyId: actor.companyId, competitorOfferId: offerId, productId: product.id,
            matchStatus: urlChanged ? MatchStatus.REVIEW : MatchStatus.CERTAIN,
            confidenceScore: urlChanged ? 70 : 100,
            matchEvidence: { source: urlChanged ? 'edited-url' : 'manual', reason: urlChanged ? 'Nieuwe URL en product vereisen verificatie.' : 'Product handmatig gekoppeld via concurrentbeheer.' },
            approvedBy: urlChanged ? null : actor.id, approvedAt: urlChanged ? null : new Date(),
          },
        })
      }
    } else if (urlChanged && offer.productMatch) {
      await tx.productMatch.update({
        where: { id: offer.productMatch.id, companyId: actor.companyId },
        data: {
          matchStatus: MatchStatus.REVIEW, confidenceScore: 70,
          matchEvidence: { source: 'edited-url', reason: 'Nieuwe product URL vereist een nieuwe productmatchcontrole.' },
          approvedBy: null, approvedAt: null,
        },
      })
    }
    await tx.competitorOffer.update({
      where: { id: offerId, companyId: actor.companyId },
      data: {
        url: safeUrl, packagingUnit, packagingQty, vatIncluded,
        ...(resetMeasurements ? {
          rawPrice: null, normalizedPrice: null, shippingCost: null, normalizedShippingCost: null,
          deliveredPrice: null, shippingCurrency: null, shippingLabel: null,
          stockStatus: null, lastCheckedAt: null,
        } : {}),
      },
    })
  })

  await createAuditLog({
    companyId: actor.companyId, userId: actor.id, action: 'COMPETITOR_SOURCE_UPDATED',
    entityType: 'CompetitorOffer', entityId: offerId,
    oldValue: { competitorId, productId: offer.productMatch?.productId ?? null, url: offer.url, packagingUnit: offer.packagingUnit, packagingQty: offer.packagingQty, vatIncluded: offer.vatIncluded },
    newValue: { competitorId, productId: productId || null, url: safeUrl, packagingUnit, packagingQty, vatIncluded, resetMeasurements },
  })
  refreshSourcePages(competitorId, offerId, [offer.productMatch?.productId, productId])
  redirect(`/concurrenten/${competitorId}?bronbijgewerkt=1#prijsbronnen`)
}

export async function deleteCompetitorSourceAction(formData: FormData) {
  const actor = await requirePermission('competitors.write')
  const competitorId = field(formData, 'competitorId')
  const offerId = field(formData, 'offerId')
  const confirmedUrl = field(formData, 'confirmedUrl')
  const offer = await prisma.competitorOffer.findFirst({
    where: { id: offerId, competitorId, companyId: actor.companyId },
    select: { id: true, url: true, productMatch: { select: { id: true, productId: true } } },
  })
  if (!offer || confirmedUrl !== offer.url) throw new Error('Deze prijsbron is gewijzigd. Vernieuw de pagina en bevestig de verwijdering opnieuw.')
  await prisma.$transaction(async (tx) => {
    await tx.alert.deleteMany({ where: { companyId: actor.companyId, competitorOfferId: offerId } })
    if (offer.productMatch) await tx.productMatch.delete({ where: { id: offer.productMatch.id, companyId: actor.companyId } })
    // Price checks and history are linked to this exact source and cascade on source deletion.
    await tx.competitorOffer.delete({ where: { id: offerId, companyId: actor.companyId } })
  })
  await createAuditLog({
    companyId: actor.companyId, userId: actor.id, action: 'COMPETITOR_SOURCE_DELETED',
    entityType: 'CompetitorOffer', entityId: offerId,
    oldValue: { competitorId, url: offer.url, productId: offer.productMatch?.productId ?? null },
    newValue: { removed: true },
  })
  refreshSourcePages(competitorId, offerId, [offer.productMatch?.productId])
  redirect(`/concurrenten/${competitorId}?bronverwijderd=1#prijsbronnen`)
}

export async function checkCompetitorSourceAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const competitorId = field(formData, 'competitorId')
  const offerId = field(formData, 'offerId')
  const offer = await prisma.competitorOffer.findFirst({
    where: { id: offerId, competitorId, companyId: actor.companyId, isActive: true,
      competitor: { isActive: true }, productMatch: { companyId: actor.companyId } },
    select: { id: true },
  })
  if (!offer) throw new Error('Koppel eerst een actief product en activeer de concurrent om een betrouwbare prijs op te halen.')
  const summary = await runDuePriceChecks({ companyId: actor.companyId, competitorOfferId: offer.id, force: true, limit: 1 })
  refreshSourcePages(competitorId, offerId, [])
  redirect(`/concurrenten/${competitorId}?broncontrole=${summary.successful ? 'gelukt' : 'mislukt'}#prijsbronnen`)
}
