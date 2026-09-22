'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAuditLog } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const PRODUCT_CONFIRMATION = 'VERWIJDER ALLE PRODUCTEN'
const COMPETITOR_CONFIRMATION = 'VERWIJDER ALLE CONCURRENTEN'

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function readExpectedCount(formData: FormData) {
  const value = Number(readText(formData, 'expectedCount'))
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

export async function deleteAllProductsAction(formData: FormData) {
  const actor = await requireSuperAdmin()
  const confirmation = readText(formData, 'confirmation')
  const expectedCount = readExpectedCount(formData)
  const pauseFeeds = formData.get('pauseFeeds') === 'on'

  if (confirmation !== PRODUCT_CONFIRMATION) {
    redirect('/instellingen/data?deleteError=product_confirmation#danger-zone')
  }

  const actualCount = await prisma.product.count({ where: { companyId: actor.companyId } })
  if (expectedCount === null || actualCount !== expectedCount) {
    redirect('/instellingen/data?deleteError=products_changed#danger-zone')
  }

  if (actualCount === 0) {
    redirect('/instellingen/data?productsDeleted=0#danger-zone')
  }

  const { pausedFeeds, deletedAlerts, deletedMatches, deletedOffers, deletedProducts } = await prisma.$transaction(async (tx) => {
    const pausedFeeds = pauseFeeds
      ? await tx.feedSource.updateMany({
          where: { companyId: actor.companyId, isActive: true },
          data: { isActive: false },
        })
      : await tx.feedSource.updateMany({
          where: { companyId: actor.companyId, id: '__no_feed__' },
          data: { isActive: false },
        })
    const deletedAlerts = await tx.alert.deleteMany({ where: { companyId: actor.companyId } })
    const deletedMatches = await tx.productMatch.deleteMany({ where: { companyId: actor.companyId } })
    const deletedOffers = await tx.competitorOffer.deleteMany({ where: { companyId: actor.companyId } })
    const deletedProducts = await tx.product.deleteMany({ where: { companyId: actor.companyId } })
    return { pausedFeeds, deletedAlerts, deletedMatches, deletedOffers, deletedProducts }
  })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'ALL_PRODUCTS_DELETED',
    entityType: 'Product',
    entityId: 'all',
    newValue: {
      count: deletedProducts.count,
      productMatchesDeleted: deletedMatches.count,
      competitorOffersDeleted: deletedOffers.count,
      alertsDeleted: deletedAlerts.count,
      feedsPaused: pausedFeeds.count,
      explicitConfirmation: PRODUCT_CONFIRMATION,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/productmatches')
  revalidatePath('/concurrenten')
  revalidatePath('/instellingen/data')
  revalidatePath('/instellingen/feedbeheer')
  revalidatePath('/waarschuwingen')
  revalidatePath('/monitoring')
  redirect(`/instellingen/data?productsDeleted=${deletedProducts.count}&feedsPaused=${pausedFeeds.count}#danger-zone`)
}

export async function deleteAllCompetitorsAction(formData: FormData) {
  const actor = await requireSuperAdmin()
  const confirmation = readText(formData, 'confirmation')
  const expectedCount = readExpectedCount(formData)

  if (confirmation !== COMPETITOR_CONFIRMATION) {
    redirect('/instellingen/data?deleteError=competitor_confirmation#danger-zone')
  }

  const actualCount = await prisma.competitor.count({ where: { companyId: actor.companyId } })
  if (expectedCount === null || actualCount !== expectedCount) {
    redirect('/instellingen/data?deleteError=competitors_changed#danger-zone')
  }

  if (actualCount === 0) {
    redirect('/instellingen/data?competitorsDeleted=0#danger-zone')
  }

  const { deletedAlerts, deletedMatches, deletedOffers, deletedCompetitors } = await prisma.$transaction(async (tx) => {
    const deletedAlerts = await tx.alert.deleteMany({ where: { companyId: actor.companyId } })
    const deletedMatches = await tx.productMatch.deleteMany({
      where: {
        companyId: actor.companyId,
        competitorOffer: {
          competitor: { companyId: actor.companyId },
        },
      },
    })
    const deletedOffers = await tx.competitorOffer.deleteMany({
      where: {
        companyId: actor.companyId,
        competitor: { companyId: actor.companyId },
      },
    })
    const deletedCompetitors = await tx.competitor.deleteMany({ where: { companyId: actor.companyId } })
    return { deletedAlerts, deletedMatches, deletedOffers, deletedCompetitors }
  })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'ALL_COMPETITORS_DELETED',
    entityType: 'Competitor',
    entityId: 'all',
    newValue: {
      count: deletedCompetitors.count,
      competitorOffersDeleted: deletedOffers.count,
      productMatchesDeleted: deletedMatches.count,
      alertsDeleted: deletedAlerts.count,
      explicitConfirmation: COMPETITOR_CONFIRMATION,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/concurrenten')
  revalidatePath('/beheer/concurrenten')
  revalidatePath('/producten')
  revalidatePath('/productmatches')
  revalidatePath('/instellingen/data')
  revalidatePath('/waarschuwingen')
  revalidatePath('/monitoring')
  redirect(`/instellingen/data?competitorsDeleted=${deletedCompetitors.count}#danger-zone`)
}
