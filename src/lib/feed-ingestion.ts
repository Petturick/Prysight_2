import { MatchStatus } from '@/generated/prisma/client'
import { reactivateFeedProductGroups } from '@/lib/feed-group-reactivation'
import {
  ingestCanonicalProducts as ingestCanonicalProductsV2,
  syncFeedSource as syncFeedSourceV2,
} from '@/lib/feed-ingestion-v2'
import { prisma } from '@/lib/prisma'
import { discoverProductCandidates } from '@/lib/smart-discovery'

export * from '@/lib/feed-ingestion-v2'

export async function ingestCanonicalProducts(...args: Parameters<typeof ingestCanonicalProductsV2>) {
  const result = await ingestCanonicalProductsV2(...args)
  const input = args[0]
  if (input.sourceKey === 'manual:prysight' && result.errors > 0) {
    throw new Error(result.errorMessages[0] || 'Product kon niet volledig worden verwerkt.')
  }
  return result
}

async function discoverFeedProductCompetitors(feedSourceId: string) {
  const source = await prisma.feedSource.findUnique({
    where: { id: feedSourceId },
    select: { id: true, companyId: true, countryCode: true },
  })
  if (!source) return { attempted: 0, suggestions: 0, failed: 0, deferred: 0 }

  const [links, defaultMarket] = await Promise.all([
    prisma.productFeedLink.findMany({
      where: { companyId: source.companyId, feedSourceId },
      orderBy: { updatedAt: 'desc' },
      take: 60,
      select: {
        product: {
          select: {
            id: true,
            articleNumber: true,
            ean: true,
            gtin: true,
            productMarkets: {
              where: { companyId: source.companyId, isActive: true },
              select: { countryId: true },
              take: 8,
            },
            matches: {
              where: {
                companyId: source.companyId,
                matchStatus: { in: [MatchStatus.CERTAIN, MatchStatus.REVIEW] },
                competitorOffer: { isActive: true },
              },
              select: { id: true },
              take: 2,
            },
          },
        },
      },
    }),
    prisma.companyCountry.findFirst({
      where: {
        companyId: source.companyId,
        isActive: true,
        ...(source.countryCode !== 'GLOBAL' ? { country: { code: source.countryCode } } : {}),
      },
      orderBy: source.countryCode === 'GLOBAL' ? [{ isDefault: 'desc' }, { createdAt: 'asc' }] : [{ createdAt: 'asc' }],
      select: { countryId: true },
    }),
  ])

  const unique = new Map<string, { productId: string; countryId: string; articleNumber: string }>()
  for (const link of links) {
    const product = link.product
    if (product.matches.length >= 2) continue
    if (!(product.ean || product.gtin || product.articleNumber)) continue
    const countryId = defaultMarket?.countryId && product.productMarkets.some((market) => market.countryId === defaultMarket.countryId)
      ? defaultMarket.countryId
      : product.productMarkets[0]?.countryId ?? defaultMarket?.countryId
    if (!countryId) continue
    unique.set(`${product.id}:${countryId}`, {
      productId: product.id,
      countryId,
      articleNumber: product.articleNumber,
    })
  }

  const targets = [...unique.values()]
  const immediate = targets.slice(0, 4)
  let suggestions = 0
  let failed = 0

  for (let index = 0; index < immediate.length; index += 2) {
    await Promise.all(immediate.slice(index, index + 2).map(async (target) => {
      try {
        const result = await discoverProductCandidates({
          companyId: source.companyId,
          productId: target.productId,
          countryId: target.countryId,
        })
        suggestions += result.created
      } catch (error) {
        failed += 1
        console.error('Feed competitor discovery failed', {
          companyId: source.companyId,
          feedSourceId,
          productId: target.productId,
          articleNumber: target.articleNumber,
          error,
        })
      }
    }))
  }

  return {
    attempted: immediate.length,
    suggestions,
    failed,
    deferred: Math.max(targets.length - immediate.length, 0),
  }
}

export async function syncFeedSource(feedSourceId: string) {
  const result = await syncFeedSourceV2(feedSourceId)
  await reactivateFeedProductGroups(feedSourceId)

  let competitorDiscovery = { attempted: 0, suggestions: 0, failed: 0, deferred: 0 }
  try {
    competitorDiscovery = await discoverFeedProductCompetitors(feedSourceId)
  } catch (error) {
    console.error('Feed competitor discovery could not start', { feedSourceId, error })
  }

  return { ...result, competitorDiscovery }
}
