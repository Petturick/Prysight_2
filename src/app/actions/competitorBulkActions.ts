'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const MAX_SELECTED_COMPETITORS = 1000
const REVALIDATE_AFTER_DELETE = [
  '/concurrenten', '/beheer/concurrenten', '/producten', '/productmatches',
  '/dashboard', '/monitoring', '/waarschuwingen', '/instellingen/data',
]

/**
 * Remove only explicitly selected competitors in the current company. A single
 * transaction protects against partial deletion and records the audit trail.
 */
export async function deleteSelectedCompetitorsAction(formData: FormData): Promise<{ deleted: number }> {
  const actor = await requirePermission('competitors.write')
  const ids = formData.getAll('competitorIds').map(value => String(value).trim())
  const expectedNames = formData.getAll('expectedNames').map(value => String(value))
  const expectedOffers = formData.getAll('expectedOffers').map(value => Number(String(value)))
  const confirmation = String(formData.get('confirmation') ?? '').trim()

  if (ids.length < 1 || ids.length > MAX_SELECTED_COMPETITORS || ids.some(id => !id || id.length > 128)
    || new Set(ids).size !== ids.length || expectedNames.length !== ids.length
    || expectedOffers.length !== ids.length || expectedOffers.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Ongeldige selectie. Vernieuw het overzicht en selecteer de concurrenten opnieuw.')
  }
  if (confirmation !== `VERWIJDER ${ids.length} CONCURRENTEN`) {
    throw new Error('Bevestig het definitief verwijderen door de exacte bevestigingstekst in te vullen.')
  }

  const deleted = await prisma.$transaction(async tx => {
    const competitors = await tx.competitor.findMany({
      where: { companyId: actor.companyId, id: { in: ids } },
      select: { id: true, name: true, _count: { select: { offers: true } } },
    })
    if (competitors.length !== ids.length) {
      throw new Error('De selectie bevat concurrenten die niet meer bestaan of niet tot deze organisatie behoren.')
    }
    const current = new Map(competitors.map(competitor => [competitor.id, competitor]))
    ids.forEach((id, index) => {
      const competitor = current.get(id)
      if (!competitor || competitor.name !== expectedNames[index]
        || competitor._count.offers !== expectedOffers[index]) {
        throw new Error('Concurrenten of gekoppelde prijsbronnen zijn gewijzigd. Vernieuw het overzicht en bevestig de selectie opnieuw.')
      }
    })

    const offerFilter = { companyId: actor.companyId, competitorId: { in: ids } }
    const alerts = await tx.alert.deleteMany({
      where: { companyId: actor.companyId, competitorOffer: offerFilter },
    })
    const matches = await tx.productMatch.deleteMany({
      where: { companyId: actor.companyId, competitorOffer: offerFilter },
    })
    const offers = await tx.competitorOffer.deleteMany({ where: offerFilter })
    const removed = await tx.competitor.deleteMany({
      where: { companyId: actor.companyId, id: { in: ids } },
    })
    if (removed.count !== ids.length || offers.count !== expectedOffers.reduce((sum, count) => sum + count, 0)) {
      throw new Error('De selectie is tijdens het verwijderen gewijzigd. Er is niets verwijderd, probeer het opnieuw.')
    }

    await tx.auditLog.create({
      data: {
        companyId: actor.companyId,
        userId: actor.id,
        action: 'COMPETITORS_BULK_DELETED',
        entityType: 'Competitor',
        entityId: `bulk:${ids.length}`,
        ipAddress: '127.0.0.1',
        newValue: {
          companyId: actor.companyId,
          competitorCount: removed.count,
          offerCount: offers.count,
          matchCount: matches.count,
          alertCount: alerts.count,
          competitors: ids.map((id, index) => ({ id, name: expectedNames[index], offers: expectedOffers[index] })),
        },
      },
    })
    return removed.count
  }, { timeout: 30000 })

  REVALIDATE_AFTER_DELETE.forEach(revalidatePath)
  return { deleted }
}
