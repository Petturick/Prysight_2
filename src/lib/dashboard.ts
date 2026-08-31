import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { calculatePriceDifference } from '@/lib/price-normalization'
import { decimalToNumber } from '@/lib/format'

export type DashboardFilters = {
  countryId?: string
  productGroupId?: string
  competitorId?: string
  matchStatus?: MatchStatus | ''
  q?: string
}

const productInclude = {
  productGroup: true,
  productMarkets: { include: { country: true } },
  ownPriceHistory: { orderBy: { recordedAt: 'desc' as const }, take: 8 },
  matches: {
    include: {
      competitorOffer: {
        include: {
          competitor: { include: { country: true } },
          priceHistory: { orderBy: { recordedAt: 'desc' as const }, take: 5 },
          priceChecks: { orderBy: { checkedAt: 'desc' as const }, take: 3 },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>

const competitorInclude = {
  country: true,
  offers: {
    include: {
      productMatch: { include: { product: true } },
      priceChecks: true,
      priceHistory: { orderBy: { recordedAt: 'desc' as const }, take: 3 },
    },
  },
} satisfies Prisma.CompetitorInclude

export type CompetitorWithRelations = Prisma.CompetitorGetPayload<{ include: typeof competitorInclude }>

export async function getFilterOptions() {
  const [countries, productGroups, competitors] = await Promise.all([
    prisma.country.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.productGroup.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.competitor.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, include: { country: true } }),
  ])

  return { countries, productGroups, competitors }
}

export async function getFilteredProducts(filters: DashboardFilters = {}) {
  return prisma.product.findMany({
    where: {
      isActive: true,
      productGroupId: filters.productGroupId || undefined,
      AND: [
        filters.q
          ? {
              OR: [
                { articleNumber: { contains: filters.q, mode: 'insensitive' } },
                { name: { contains: filters.q, mode: 'insensitive' } },
                { ean: { contains: filters.q } },
              ],
            }
          : {},
        filters.countryId
          ? {
              OR: [
                { productMarkets: { some: { countryId: filters.countryId, isActive: true } } },
                { matches: { some: { competitorOffer: { competitor: { countryId: filters.countryId } } } } },
              ],
            }
          : {},
      ],
    },
    include: productInclude,
    orderBy: [{ productGroup: { name: 'asc' } }, { articleNumber: 'asc' }],
  })
}

function getFilteredMatches(product: ProductWithRelations, filters: DashboardFilters) {
  return product.matches.filter((match) => {
    if (!match.competitorOffer.isActive) return false
    if (filters.matchStatus && match.matchStatus !== filters.matchStatus) return false
    if (filters.competitorId && match.competitorOffer.competitorId !== filters.competitorId) return false
    if (filters.countryId && match.competitorOffer.competitor.countryId !== filters.countryId) return false
    return true
  })
}

export function deriveProductMetrics(product: ProductWithRelations, filters: DashboardFilters = {}) {
  const relevantMatches = getFilteredMatches(product, filters)
  const pricedOffers = relevantMatches.filter((match) => match.competitorOffer.normalizedPrice !== null)
  const prices = pricedOffers.map((match) => decimalToNumber(match.competitorOffer.normalizedPrice)).filter((value): value is number => value !== null)
  const lowestPrice = prices.length ? Math.min(...prices) : null
  const averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null
  const lastCheckedDates = relevantMatches.map((match) => match.competitorOffer.lastCheckedAt).filter((value): value is Date => Boolean(value))
  const lastCheckedAt = lastCheckedDates.length ? new Date(Math.max(...lastCheckedDates.map((value) => value.getTime()))) : null
  const selectedMarket = filters.countryId ? product.productMarkets.find((market) => market.countryId === filters.countryId && market.isActive) : null
  const ownPrice = decimalToNumber(selectedMarket?.ownPrice ?? product.ownPrice)
  const ownCurrency = selectedMarket?.currency ?? product.currency
  const difference = calculatePriceDifference(ownPrice, lowestPrice)
  const trendSource = pricedOffers
    .flatMap((match) => match.competitorOffer.priceHistory)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
  const latestHistory = trendSource[0]
  const previousHistory = trendSource[1]
  const trendDelta = latestHistory && previousHistory ? decimalToNumber(latestHistory.normalizedPrice ?? latestHistory.price)! - decimalToNumber(previousHistory.normalizedPrice ?? previousHistory.price)! : null
  const validMatches = relevantMatches.filter((match) => match.matchStatus === MatchStatus.CERTAIN)
  const reviewMatches = relevantMatches.filter((match) => match.matchStatus === MatchStatus.REVIEW)
  const stale = !lastCheckedAt || Date.now() - lastCheckedAt.getTime() > 72 * 60 * 60 * 1000
  const lowestOffer = pricedOffers.sort((a, b) => Number(a.competitorOffer.normalizedPrice) - Number(b.competitorOffer.normalizedPrice))[0]

  return {
    product,
    selectedMarket,
    ownPrice,
    ownCurrency,
    lowestPrice,
    averagePrice,
    difference,
    offerCount: pricedOffers.length,
    validMatches: validMatches.length,
    reviewMatches: reviewMatches.length,
    lastCheckedAt,
    trendDelta,
    stale,
    lowestOffer,
    marketPosition:
      lowestPrice === null
        ? 'Geen concurrentieprijs'
        : difference.position === 'LAAGSTE'
          ? 'Engels laagste'
          : difference.position === 'DUURDER'
            ? 'Engels duurder'
            : 'Gelijk aan markt',
  }
}

export type DashboardSnapshot = Awaited<ReturnType<typeof getDashboardSnapshot>>

export async function getDashboardSnapshot(filters: DashboardFilters = {}) {
  const [products, failedChecks, staleOffers, filterOptions] = await Promise.all([
    getFilteredProducts(filters),
    prisma.priceCheck.findMany({
      where: { isSuccess: false },
      include: { competitorOffer: { include: { competitor: true, productMatch: { include: { product: true } } } } },
      orderBy: { checkedAt: 'desc' },
      take: 10,
    }),
    prisma.competitorOffer.findMany({
      where: {
        isActive: true,
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 72 * 60 * 60 * 1000) } }],
      },
      include: { competitor: true, productMatch: { include: { product: true } } },
      orderBy: { lastCheckedAt: 'asc' },
      take: 10,
    }),
    getFilterOptions(),
  ])

  const metrics = products.map((product) => deriveProductMetrics(product, filters))
  const allOfferMoves = products
    .flatMap((product) =>
      product.matches.flatMap((match) => {
        const [current, previous] = match.competitorOffer.priceHistory
        if (!current || !previous) return []
        const currentPrice = decimalToNumber(current.normalizedPrice ?? current.price)
        const previousPrice = decimalToNumber(previous.normalizedPrice ?? previous.price)
        if (currentPrice === null || previousPrice === null) return []
        return [
          {
            id: `${product.id}-${match.id}`,
            productName: product.name,
            competitor: match.competitorOffer.competitor.name,
            latestPrice: currentPrice,
            previousPrice,
            delta: currentPrice - previousPrice,
            recordedAt: current.recordedAt,
          },
        ]
      }),
    )
    .sort((a, b) => b.delta - a.delta)

  const comparableProducts = metrics.filter((item) => item.lowestPrice !== null && item.ownPrice !== null)
  const averagePriceIndex = comparableProducts.length
    ? comparableProducts.reduce((sum, item) => sum + ((item.ownPrice ?? 0) / (item.lowestPrice ?? 1)) * 100, 0) / comparableProducts.length
    : null

  return {
    filterOptions,
    metrics,
    kpis: {
      monitoredProducts: products.length,
      activeOffers: metrics.reduce((sum, item) => sum + item.offerCount, 0),
      validMatches: metrics.filter((item) => item.validMatches > 0).length,
      reviewMatches: metrics.reduce((sum, item) => sum + item.reviewMatches, 0),
      withoutCompetitorPrice: metrics.filter((item) => item.lowestPrice === null).length,
      engelsLowest: metrics.filter((item) => item.marketPosition === 'Engels laagste').length,
      engelsHigher: metrics.filter((item) => item.marketPosition === 'Engels duurder').length,
      averagePriceIndex,
      failedChecks: failedChecks.length,
      staleData: staleOffers.length,
    },
    biggestIncreases: allOfferMoves.slice(0, 5),
    biggestDecreases: [...allOfferMoves].sort((a, b) => a.delta - b.delta).slice(0, 5),
    failedChecks,
    staleOffers,
  }
}

export async function getCompetitorsOverview() {
  return prisma.competitor.findMany({
    where: { isActive: true },
    include: competitorInclude,
    orderBy: [{ country: { name: 'asc' } }, { name: 'asc' }],
  })
}

export function deriveCompetitorMetrics(competitor: CompetitorWithRelations) {
  const matchedOffers = competitor.offers.filter((offer) => offer.productMatch)
  const validPrices = competitor.offers.filter((offer) => offer.normalizedPrice !== null)
  const positions = matchedOffers.map((offer) => {
    const ownPrice = decimalToNumber(offer.productMatch?.product.ownPrice)
    const competitorPrice = decimalToNumber(offer.normalizedPrice)
    return calculatePriceDifference(ownPrice, competitorPrice)
  })
  const lowerCount = positions.filter((position) => position.position === 'LAAGSTE').length
  const failedChecks = competitor.offers.flatMap((offer) => offer.priceChecks).filter((check) => !check.isSuccess)
  const totalChecks = competitor.offers.flatMap((offer) => offer.priceChecks)
  const lastChecked = competitor.offers
    .map((offer) => offer.lastCheckedAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    linkedProducts: matchedOffers.length,
    validPrices: validPrices.length,
    averagePositionPct: matchedOffers.length ? (lowerCount / matchedOffers.length) * 100 : null,
    lastChecked,
    failedRate: totalChecks.length ? (failedChecks.length / totalChecks.length) * 100 : null,
  }
}
