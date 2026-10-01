import { prisma } from '@/lib/prisma'
import { rescheduledCheckAt } from '@/lib/monitoring-schedule'

export async function rescheduleCompetitorOffers({
  companyId,
  competitorId,
  frequencyHours,
}: {
  companyId: string
  competitorId: string
  frequencyHours: number
}) {
  const offers = await prisma.competitorOffer.findMany({
    where: { companyId, competitorId, isActive: true },
    select: {
      id: true,
      lastSuccessfulCheckAt: true,
      lastAttemptAt: true,
    },
  })
  if (!offers.length) return 0

  const now = new Date()
  const results = await prisma.$transaction(
    offers.map((offer) =>
      prisma.competitorOffer.updateMany({
        where: { id: offer.id, companyId, competitorId },
        data: {
          nextCheckAt: rescheduledCheckAt({
            now,
            lastSuccessfulCheckAt: offer.lastSuccessfulCheckAt,
            lastAttemptAt: offer.lastAttemptAt,
            frequencyHours,
          }),
          checkLockedUntil: null,
          checkLockToken: null,
        },
      }),
    ),
  )

  return results.reduce((sum, item) => sum + item.count, 0)
}
