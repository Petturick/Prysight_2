import { MatchStatus } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { runPriceCheck } from '@/lib/price-monitoring'
import { prisma } from '@/lib/prisma'

const DEFAULT_LIMIT = 80
const MAX_LIMIT = 160
const CONCURRENCY = 4

export async function runSelectedPriceChecks({
  companyId,
  productIds,
  limit = DEFAULT_LIMIT,
}: {
  companyId: string
  productIds: string[]
  limit?: number
}) {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))]
  if (uniqueProductIds.length === 0) {
    return { requestedProducts: 0, offers: 0, successful: 0, failed: 0, results: [] as Awaited<ReturnType<typeof runPriceCheck>>[] }
  }

  const cappedLimit = Math.min(Math.max(Math.round(limit), 1), MAX_LIMIT)
  const offers = await prisma.competitorOffer.findMany({
    where: {
      companyId,
      isActive: true,
      competitor: { isActive: true },
      productMatch: {
        productId: { in: uniqueProductIds },
        matchStatus: { in: [MatchStatus.CERTAIN, MatchStatus.REVIEW] },
      },
    },
    select: {
      id: true,
      productMatch: { select: { productId: true } },
    },
    orderBy: [{ lastCheckedAt: 'asc' }, { id: 'asc' }],
    take: cappedLimit,
  })

  if (offers.length > 0) await assertCompanyCapacity(companyId, 'checksPerDay', offers.length)

  const results: Awaited<ReturnType<typeof runPriceCheck>>[] = []
  for (let index = 0; index < offers.length; index += CONCURRENCY) {
    const batch = offers.slice(index, index + CONCURRENCY)
    const batchResults = await Promise.all(batch.map((offer) => runPriceCheck(offer.id, companyId, true)))
    results.push(...batchResults)
  }

  return {
    requestedProducts: uniqueProductIds.length,
    checkedProducts: new Set(offers.map((offer) => offer.productMatch?.productId).filter(Boolean)).size,
    offers: offers.length,
    successful: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    truncated: offers.length === cappedLimit,
    results,
  }
}
