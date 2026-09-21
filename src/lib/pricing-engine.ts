import { MatchStatus } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  getPersistedPricingRules,
  getProductPricingGuardrails,
  resolvePricingRule,
  type PriceRoundingMode,
} from '@/lib/pricing-rules'

export type PricingStrategy = 'LOWEST_MATCH' | 'LOWEST_MINUS' | 'SECOND_LOWEST' | 'MARKET_MEDIAN' | 'MARKET_AVERAGE'
export type PricingEngineConfig = { strategy: PricingStrategy; adjustmentPct: number; maxChangePct: number; minimumSignalPct: number; onlyInStock: boolean }
export type PricingRecommendation = {
  productId: string
  articleNumber: string
  productName: string
  countryId: string | null
  countryCode: string | null
  countryName: string | null
  ownPrice: number | null
  costPrice: number | null
  marginBeforePct: number | null
  marginAfterPct: number | null
  marketLowest: number | null
  marketSecondLowest: number | null
  marketMedian: number | null
  marketAverage: number | null
  competitorCount: number
  recommendedPrice: number | null
  changePct: number | null
  action: 'LOWER' | 'RAISE' | 'KEEP' | 'NO_DATA'
  marketPosition: number | null
  reason: string
  guardrailNotes: string[]
  minimumAllowedPrice: number | null
  maximumAllowedPrice: number | null
  appliedRuleId: string | null
  appliedRuleName: string | null
  requiresApproval: boolean
  roundingMode: PriceRoundingMode
}

const defaultConfig: PricingEngineConfig = { strategy: 'MARKET_MEDIAN', adjustmentPct: 0, maxChangePct: 5, minimumSignalPct: 1, onlyInStock: true }

function numeric(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function isStockRelevant(stockStatus: string | null | undefined) {
  const normalized = (stockStatus ?? '').toLowerCase()
  if (!normalized) return true
  return !['niet op voorraad', 'out of stock', 'sold out', 'unavailable'].some((value) => normalized.includes(value))
}

function strategyTarget(strategy: PricingStrategy, prices: number[], adjustmentPct: number) {
  if (prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const average = sorted.reduce((sum, price) => sum + price, 0) / sorted.length
  const med = median(sorted) ?? sorted[0]
  const base = strategy === 'LOWEST_MATCH'
    ? sorted[0]
    : strategy === 'LOWEST_MINUS'
      ? sorted[0]
      : strategy === 'SECOND_LOWEST'
        ? sorted[1] ?? sorted[0]
        : strategy === 'MARKET_AVERAGE'
          ? average
          : med
  const effectiveAdjustment = strategy === 'LOWEST_MINUS' && adjustmentPct === 0 ? -1 : adjustmentPct
  return base * (1 + effectiveAdjustment / 100)
}

function clampChange(current: number, target: number, maxChangePct: number) {
  const maxDelta = current * (Math.max(maxChangePct, 0) / 100)
  return Math.max(current - maxDelta, Math.min(current + maxDelta, target))
}

function roundPrice(value: number, mode: PriceRoundingMode) {
  if (mode === 'WHOLE') return Math.round(value)
  if (mode === 'END_95') return Math.round(value - 0.95) + 0.95
  if (mode === 'END_99') return Math.round(value - 0.99) + 0.99
  return Math.round(value * 100) / 100
}

function highest(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return usable.length ? Math.max(...usable) : null
}

function lowest(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return usable.length ? Math.min(...usable) : null
}

function netSellingPrice(price: number, vatIncluded: boolean, vatRate: number | null) {
  if (!vatIncluded || !vatRate || vatRate <= 0) return price
  return price / (1 + vatRate / 100)
}

function grossSellingPrice(netPrice: number, vatIncluded: boolean, vatRate: number | null) {
  if (!vatIncluded || !vatRate || vatRate <= 0) return netPrice
  return netPrice * (1 + vatRate / 100)
}

function marginPct(sellingPrice: number | null, costPrice: number | null, vatIncluded: boolean, vatRate: number | null) {
  if (!sellingPrice || costPrice === null || costPrice < 0) return null
  const netPrice = netSellingPrice(sellingPrice, vatIncluded, vatRate)
  if (netPrice <= 0) return null
  return ((netPrice - costPrice) / netPrice) * 100
}

function minimumPriceForMargin(costPrice: number | null, minimumMarginPct: number | null, vatIncluded: boolean, vatRate: number | null) {
  if (costPrice === null || minimumMarginPct === null || minimumMarginPct < 0 || minimumMarginPct >= 100) return null
  const requiredNetPrice = costPrice / (1 - minimumMarginPct / 100)
  return grossSellingPrice(requiredNetPrice, vatIncluded, vatRate)
}

const strategyNames: Record<PricingStrategy, string> = {
  LOWEST_MATCH: 'laagste marktprijs volgen',
  LOWEST_MINUS: 'onder de laagste marktprijs positioneren',
  SECOND_LOWEST: 'tweede laagste marktprijs volgen',
  MARKET_MEDIAN: 'marktmediaan volgen',
  MARKET_AVERAGE: 'marktgemiddelde volgen',
}

export async function getPricingRecommendations(
  companyId: string,
  configOverrides: Partial<PricingEngineConfig> = {},
  limit = 200,
  usePersistedRules = true,
  productIds?: string[],
): Promise<{ config: PricingEngineConfig; recommendations: PricingRecommendation[] }> {
  const baseConfig: PricingEngineConfig = { ...defaultConfig, ...configOverrides }
  const scopedProductIds = productIds ? [...new Set(productIds.filter(Boolean))] : []
  const [products, persistedRules] = await Promise.all([
    prisma.product.findMany({
      relationLoadStrategy: 'join',
      where: {
        companyId,
        isActive: true,
        ...(scopedProductIds.length > 0 ? { id: { in: scopedProductIds } } : {}),
      },
      select: {
        id: true,
        articleNumber: true,
        name: true,
        productGroupId: true,
        ownPrice: true,
        vatIncluded: true,
        productMarkets: {
          where: { companyId, isActive: true },
          select: {
            countryId: true,
            ownPrice: true,
            vatIncluded: true,
            currency: true,
            country: { select: { code: true, name: true, vatRate: true } },
          },
        },
        matches: {
          where: { companyId, matchStatus: MatchStatus.CERTAIN },
          select: {
            competitorOffer: {
              select: {
                isActive: true,
                normalizedPrice: true,
                stockStatus: true,
                competitor: { select: { countryId: true, country: { select: { code: true, name: true, vatRate: true } } } },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: scopedProductIds.length > 0 ? Math.min(scopedProductIds.length, 500) : Math.min(Math.max(limit, 1), 500),
    }),
    usePersistedRules ? getPersistedPricingRules(companyId) : Promise.resolve([]),
  ])

  const guardrailMap = await getProductPricingGuardrails(companyId, products.map((product) => product.id))
  const recommendations: PricingRecommendation[] = []

  for (const product of products) {
    const guardrail = guardrailMap.get(product.id) ?? null
    const matchedOffers = product.matches.map((match) => match.competitorOffer).filter((offer) => offer.isActive && offer.normalizedPrice !== null)

    const marketMap = new Map<string, {
      countryId: string | null
      countryCode: string | null
      countryName: string | null
      vatRate: number | null
      ownPrice: number | null
      vatIncluded: boolean
    }>()

    for (const market of product.productMarkets) {
      marketMap.set(market.countryId, {
        countryId: market.countryId,
        countryCode: market.country.code,
        countryName: market.country.name,
        vatRate: numeric(market.country.vatRate),
        ownPrice: numeric(market.ownPrice) ?? numeric(product.ownPrice),
        vatIncluded: market.vatIncluded,
      })
    }

    if (marketMap.size === 0) {
      for (const offer of matchedOffers) {
        const countryId = offer.competitor.countryId
        if (!marketMap.has(countryId)) {
          marketMap.set(countryId, {
            countryId,
            countryCode: offer.competitor.country.code,
            countryName: offer.competitor.country.name,
            vatRate: numeric(offer.competitor.country.vatRate),
            ownPrice: numeric(product.ownPrice),
            vatIncluded: product.vatIncluded,
          })
        }
      }
    }

    if (marketMap.size === 0) {
      marketMap.set('default', { countryId: null, countryCode: null, countryName: null, vatRate: null, ownPrice: numeric(product.ownPrice), vatIncluded: product.vatIncluded })
    }

    for (const market of marketMap.values()) {
      const rule = usePersistedRules ? resolvePricingRule(persistedRules, { productId: product.id, productGroupId: product.productGroupId, countryId: market.countryId }) : null
      const config: PricingEngineConfig = {
        strategy: rule?.strategy ?? baseConfig.strategy,
        adjustmentPct: rule?.adjustmentPct ?? baseConfig.adjustmentPct,
        maxChangePct: rule?.maxChangePct ?? baseConfig.maxChangePct,
        minimumSignalPct: rule?.minimumSignalPct ?? baseConfig.minimumSignalPct,
        onlyInStock: rule?.onlyInStock ?? baseConfig.onlyInStock,
        ...configOverrides,
      }
      const minimumCompetitors = rule?.minimumCompetitors ?? 1
      const roundingMode = guardrail?.priceRoundingMode && guardrail.priceRoundingMode !== 'CENT'
        ? guardrail.priceRoundingMode
        : rule?.roundingMode ?? guardrail?.priceRoundingMode ?? 'CENT'
      const requiresApproval = rule?.requireApproval ?? true
      const ownPrice = market.ownPrice

      const offersForMarket = matchedOffers
        .filter((offer) => !market.countryId || offer.competitor.countryId === market.countryId)
        .filter((offer) => !config.onlyInStock || isStockRelevant(offer.stockStatus))
      const prices = offersForMarket
        .map((offer) => numeric(offer.normalizedPrice))
        .filter((price): price is number => price !== null && price > 0)
        .sort((a, b) => a - b)
      const marketLowest = prices[0] ?? null
      const marketSecondLowest = prices[1] ?? marketLowest
      const marketMedian = median(prices)
      const marketAverage = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null

      const effectiveMinimumMargin = highest([guardrail?.minimumMarginPct, rule?.minimumMarginPct])
      const marginFloor = minimumPriceForMargin(guardrail?.costPrice ?? null, effectiveMinimumMargin, market.vatIncluded, market.vatRate)
      const minimumAllowedPrice = highest([guardrail?.minimumPrice, rule?.minimumPrice, marginFloor])
      const maximumAllowedPrice = lowest([guardrail?.maximumPrice, rule?.maximumPrice])
      const marginBefore = marginPct(ownPrice, guardrail?.costPrice ?? null, market.vatIncluded, market.vatRate)
      const baseNotes = [
        `${prices.length} goedgekeurde ${config.onlyInStock ? 'beschikbare' : 'actieve'} concurrentieprijzen gebruikt voor ${market.countryName ?? 'de beschikbare markt'}.`,
        rule ? `Prijsregel toegepast: ${rule.name}.` : 'Geen opgeslagen prijsregel gevonden, veilige standaardconfiguratie gebruikt.',
      ]
      if (effectiveMinimumMargin !== null) baseNotes.push(`Minimale brutomarge bewaakt op ${effectiveMinimumMargin.toFixed(1)}%.`)
      if (minimumAllowedPrice !== null) baseNotes.push(`Ondergrens voor dit advies is € ${minimumAllowedPrice.toFixed(2)}.`)
      if (maximumAllowedPrice !== null) baseNotes.push(`Bovengrens voor dit advies is € ${maximumAllowedPrice.toFixed(2)}.`)

      const common = {
        productId: product.id,
        articleNumber: product.articleNumber,
        productName: product.name,
        countryId: market.countryId,
        countryCode: market.countryCode,
        countryName: market.countryName,
        ownPrice,
        costPrice: guardrail?.costPrice ?? null,
        marginBeforePct: marginBefore,
        marketLowest,
        marketSecondLowest,
        marketMedian,
        marketAverage,
        competitorCount: prices.length,
        marketPosition: ownPrice ? prices.filter((price) => price < ownPrice).length + 1 : null,
        guardrailNotes: baseNotes,
        minimumAllowedPrice,
        maximumAllowedPrice,
        appliedRuleId: rule?.id ?? null,
        appliedRuleName: rule?.name ?? null,
        requiresApproval,
        roundingMode,
      }

      if (!ownPrice) {
        recommendations.push({ ...common, recommendedPrice: null, changePct: null, action: 'NO_DATA', marginAfterPct: null, reason: 'Eigen verkoopprijs ontbreekt.' })
        continue
      }
      if (prices.length < minimumCompetitors) {
        recommendations.push({ ...common, recommendedPrice: null, changePct: null, action: 'NO_DATA', marginAfterPct: null, reason: `Minimaal ${minimumCompetitors} betrouwbare concurrent${minimumCompetitors === 1 ? '' : 'en'} vereist voor deze prijsregel.` })
        continue
      }
      if (minimumAllowedPrice !== null && maximumAllowedPrice !== null && minimumAllowedPrice > maximumAllowedPrice) {
        recommendations.push({ ...common, recommendedPrice: null, changePct: null, action: 'NO_DATA', marginAfterPct: null, reason: 'Prijsgrenzen conflicteren, de minimumprijs ligt boven de maximumprijs.' })
        continue
      }

      const rawTarget = strategyTarget(config.strategy, prices, config.adjustmentPct) ?? ownPrice
      let guardedTarget = clampChange(ownPrice, rawTarget, config.maxChangePct)
      if (minimumAllowedPrice !== null) guardedTarget = Math.max(guardedTarget, minimumAllowedPrice)
      if (maximumAllowedPrice !== null) guardedTarget = Math.min(guardedTarget, maximumAllowedPrice)
      let recommendedPrice = roundPrice(guardedTarget, roundingMode)
      if (minimumAllowedPrice !== null) recommendedPrice = Math.max(recommendedPrice, minimumAllowedPrice)
      if (maximumAllowedPrice !== null) recommendedPrice = Math.min(recommendedPrice, maximumAllowedPrice)
      recommendedPrice = Math.round(recommendedPrice * 100) / 100

      const changePct = ((recommendedPrice - ownPrice) / ownPrice) * 100
      const action: PricingRecommendation['action'] = Math.abs(changePct) < config.minimumSignalPct ? 'KEEP' : changePct < 0 ? 'LOWER' : 'RAISE'
      const marginAfter = marginPct(recommendedPrice, guardrail?.costPrice ?? null, market.vatIncluded, market.vatRate)
      const reason = action === 'KEEP'
        ? `Geen actie nodig, verschil blijft binnen ${config.minimumSignalPct.toFixed(1)}%.`
        : `Advies op basis van ${strategyNames[config.strategy]}, begrensd op maximaal ${config.maxChangePct.toFixed(1)}% marktbeweging per besluit en de ingestelde commerciële guardrails.`

      recommendations.push({ ...common, recommendedPrice, changePct, action, marginAfterPct: marginAfter, reason })
    }
  }

  return { config: baseConfig, recommendations }
}
