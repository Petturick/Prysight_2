import { MatchStatus } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

export type PricingStrategy = 'LOWEST_MATCH' | 'LOWEST_MINUS' | 'SECOND_LOWEST' | 'MARKET_MEDIAN' | 'MARKET_AVERAGE'
export type PricingEngineConfig = { strategy: PricingStrategy; adjustmentPct: number; maxChangePct: number; minimumSignalPct: number; onlyInStock: boolean }
export type PricingRecommendation = { productId: string; articleNumber: string; productName: string; ownPrice: number | null; marketLowest: number | null; marketSecondLowest: number | null; marketMedian: number | null; marketAverage: number | null; competitorCount: number; recommendedPrice: number | null; changePct: number | null; action: 'LOWER' | 'RAISE' | 'KEEP' | 'NO_DATA'; marketPosition: number | null; reason: string; guardrailNotes: string[] }

const defaultConfig: PricingEngineConfig = { strategy: 'MARKET_MEDIAN', adjustmentPct: 0, maxChangePct: 5, minimumSignalPct: 1, onlyInStock: true }
function numeric(value: unknown) { if (value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle] }
function isStockRelevant(stockStatus: string | null | undefined) { const normalized = (stockStatus ?? '').toLowerCase(); if (!normalized) return true; return !['niet op voorraad', 'out of stock', 'sold out', 'unavailable'].some((value) => normalized.includes(value)) }
function strategyTarget(strategy: PricingStrategy, prices: number[], adjustmentPct: number) {
  if (prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const average = sorted.reduce((sum, price) => sum + price, 0) / sorted.length
  const med = median(sorted) ?? sorted[0]
  const base = strategy === 'LOWEST_MATCH' ? sorted[0] : strategy === 'LOWEST_MINUS' ? sorted[0] : strategy === 'SECOND_LOWEST' ? sorted[1] ?? sorted[0] : strategy === 'MARKET_AVERAGE' ? average : med
  const effectiveAdjustment = strategy === 'LOWEST_MINUS' && adjustmentPct === 0 ? -1 : adjustmentPct
  return base * (1 + effectiveAdjustment / 100)
}
function clampChange(current: number, target: number, maxChangePct: number) { const maxDelta = current * (Math.max(maxChangePct, 0) / 100); return Math.max(current - maxDelta, Math.min(current + maxDelta, target)) }

export async function getPricingRecommendations(configOverrides: Partial<PricingEngineConfig> = {}, limit = 200): Promise<{ config: PricingEngineConfig; recommendations: PricingRecommendation[] }> {
  const config: PricingEngineConfig = { ...defaultConfig, ...configOverrides }
  const products = await prisma.product.findMany({ where: { isActive: true }, include: { matches: { where: { matchStatus: MatchStatus.CERTAIN }, include: { competitorOffer: { include: { competitor: true } } } } }, orderBy: { name: 'asc' }, take: Math.min(Math.max(limit, 1), 500) })

  const recommendations = products.map<PricingRecommendation>((product) => {
    const ownPrice = numeric(product.ownPrice)
    const offers = product.matches.map((match) => match.competitorOffer).filter((offer) => offer.isActive && offer.normalizedPrice !== null).filter((offer) => !config.onlyInStock || isStockRelevant(offer.stockStatus))
    const prices = offers.map((offer) => numeric(offer.normalizedPrice)).filter((price): price is number => price !== null && price > 0).sort((a, b) => a - b)
    const marketLowest = prices[0] ?? null
    const marketSecondLowest = prices[1] ?? marketLowest
    const marketMedian = median(prices)
    const marketAverage = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null

    if (!ownPrice || prices.length === 0) return { productId: product.id, articleNumber: product.articleNumber, productName: product.name, ownPrice, marketLowest, marketSecondLowest, marketMedian, marketAverage, competitorCount: prices.length, recommendedPrice: null, changePct: null, action: 'NO_DATA', marketPosition: null, reason: ownPrice ? 'Nog geen bruikbare, goedgekeurde concurrentieprijs beschikbaar.' : 'Eigen verkoopprijs ontbreekt.', guardrailNotes: ['Kostprijs en minimum marge zijn nog niet als productveld beschikbaar.'] }

    const rawTarget = strategyTarget(config.strategy, prices, config.adjustmentPct) ?? ownPrice
    const roundedTarget = Math.round(clampChange(ownPrice, rawTarget, config.maxChangePct) * 100) / 100
    const changePct = ((roundedTarget - ownPrice) / ownPrice) * 100
    const action: PricingRecommendation['action'] = Math.abs(changePct) < config.minimumSignalPct ? 'KEEP' : changePct < 0 ? 'LOWER' : 'RAISE'
    const marketPosition = [...prices, ownPrice].sort((a, b) => a - b).findIndex((price) => price === ownPrice) + 1
    const strategyNames: Record<PricingStrategy, string> = { LOWEST_MATCH: 'laagste marktprijs volgen', LOWEST_MINUS: 'onder de laagste marktprijs positioneren', SECOND_LOWEST: 'tweede laagste marktprijs volgen', MARKET_MEDIAN: 'marktmediaan volgen', MARKET_AVERAGE: 'marktgemiddelde volgen' }
    return { productId: product.id, articleNumber: product.articleNumber, productName: product.name, ownPrice, marketLowest, marketSecondLowest, marketMedian, marketAverage, competitorCount: prices.length, recommendedPrice: roundedTarget, changePct, action, marketPosition, reason: action === 'KEEP' ? `Geen actie nodig, verschil blijft binnen ${config.minimumSignalPct.toFixed(1)}%.` : `Advies op basis van ${strategyNames[config.strategy]} met maximaal ${config.maxChangePct.toFixed(1)}% wijziging per besluit.`, guardrailNotes: [`Alleen ${prices.length} goedgekeurde en ${config.onlyInStock ? 'beschikbare' : 'actieve'} concurrentieprijzen zijn gebruikt.`, 'Automatisch publiceren is bewust niet actief zolang kostprijs, margegrenzen en een writeback koppeling ontbreken.'] }
  })
  return { config, recommendations }
}
