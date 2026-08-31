import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { evaluateMonitoringAlerts } from '@/lib/alert-engine'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { normalizePrice } from '@/lib/price-normalization'
import { prisma } from '@/lib/prisma'
import { safeRemoteFetch } from '@/lib/safe-remote-url'

type ExtractionMethod = 'JSON_LD' | 'META' | 'HTML_REGEX'
type ExtractedOffer = {
  price: number | null
  currency: string | null
  stockStatus: string | null
  productTitle: string | null
  sku: string | null
  ean: string | null
  packagingQty: number | null
  method: ExtractionMethod | null
}
type JsonRecord = Record<string, unknown>

const robotsCache = new Map<string, { checkedAt: number; disallow: string[] }>()

function parseLocalizedPrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\u00a0/g, ' ').replace(/[^0-9,.-]/g, '').trim()
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '')
  else normalized = cleaned.replace(',', '.')
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 10_000_000) return null
  return numeric
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function typeNames(value: unknown) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return []
}

function walkJson(value: unknown, records: JsonRecord[] = []): JsonRecord[] {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, records))
    return records
  }
  if (!value || typeof value !== 'object') return records
  const record = value as JsonRecord
  records.push(record)
  Object.values(record).forEach((item) => {
    if (item && typeof item === 'object') walkJson(item, records)
  })
  return records
}

function availabilityLabel(value: unknown) {
  const normalized = String(value ?? '').toLowerCase()
  if (!normalized) return null
  if (normalized.includes('instock') || normalized.includes('in_stock') || normalized.includes('op voorraad')) return 'Op voorraad'
  if (normalized.includes('outofstock') || normalized.includes('out_of_stock') || normalized.includes('niet op voorraad')) return 'Niet op voorraad'
  if (normalized.includes('preorder') || normalized.includes('pre-order')) return 'Pre-order'
  if (normalized.includes('backorder')) return 'Nabestelling'
  if (normalized.includes('limited') || normalized.includes('beperkt')) return 'Beperkt'
  return text(value)
}

function extractJsonLd(html: string): ExtractedOffer | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const script of scripts) {
    const raw = script[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw.replace(/<!--|-->/g, ''))
      const records = walkJson(parsed)
      const product = records.find((record) => typeNames(record['@type']).some((item) => item.toLowerCase() === 'product'))
      const offer = records.find((record) => typeNames(record['@type']).some((item) => ['offer', 'aggregateoffer'].includes(item.toLowerCase())))
      const candidate = offer ?? (product?.offers && typeof product.offers === 'object' ? product.offers as JsonRecord : null)
      if (!candidate) continue
      const price = parseLocalizedPrice(candidate.price ?? candidate.lowPrice ?? candidate.highPrice)
      if (!price) continue
      return {
        price,
        currency: text(candidate.priceCurrency),
        stockStatus: availabilityLabel(candidate.availability),
        productTitle: text(product?.name),
        sku: text(product?.sku ?? candidate.sku),
        ean: text(product?.gtin13 ?? product?.gtin14 ?? product?.gtin ?? product?.ean),
        packagingQty: null,
        method: 'JSON_LD',
      }
    } catch {
      continue
    }
  }
  return null
}

function attribute(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  if (quoted?.[1]) return quoted[1]
  const bare = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'))
  return bare?.[1] ?? null
}

function extractMeta(html: string): ExtractedOffer | null {
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0])
  const values = new Map<string, string>()
  for (const tag of meta) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name') ?? attribute(tag, 'itemprop'))?.toLowerCase()
    const content = attribute(tag, 'content')
    if (key && content) values.set(key, content)
  }
  const price = ['product:price:amount', 'og:price:amount', 'price', 'product.price.amount']
    .map((key) => parseLocalizedPrice(values.get(key)))
    .find((value) => value !== null) ?? null
  if (!price) return null
  return {
    price,
    currency: ['product:price:currency', 'og:price:currency', 'pricecurrency'].map((key) => values.get(key)).find(Boolean) ?? null,
    stockStatus: availabilityLabel(values.get('product:availability') ?? values.get('availability')),
    productTitle: values.get('og:title') ?? null,
    sku: values.get('sku') ?? null,
    ean: values.get('gtin13') ?? values.get('gtin') ?? null,
    packagingQty: null,
    method: 'META',
  }
}

function extractHtmlFallback(html: string): ExtractedOffer | null {
  const compact = html.replace(/\s+/g, ' ')
  const patterns: Array<{ regex: RegExp; currency: string }> = [
    { regex: /€\s*([0-9][0-9.,\s]{0,14})/i, currency: 'EUR' },
    { regex: /([0-9][0-9.,\s]{0,14})\s*€/i, currency: 'EUR' },
    { regex: /£\s*([0-9][0-9.,\s]{0,14})/i, currency: 'GBP' },
    { regex: /(?:DKK|kr\.?)[\s:]?([0-9][0-9.,\s]{0,14})/i, currency: 'DKK' },
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern.regex)
    const price = parseLocalizedPrice(match?.[1])
    if (!price) continue
    const title = compact.match(/<title[^>]*>([^<]{2,180})<\/title>/i)?.[1]?.trim() ?? null
    const stockStatus = /niet op voorraad|out of stock|sold out/i.test(compact)
      ? 'Niet op voorraad'
      : /op voorraad|in stock|available/i.test(compact)
        ? 'Op voorraad'
        : null
    return { price, currency: pattern.currency, stockStatus, productTitle: title, sku: null, ean: null, packagingQty: null, method: 'HTML_REGEX' }
  }
  return null
}

export function extractOfferSnapshot(html: string): ExtractedOffer {
  return extractJsonLd(html) ?? extractMeta(html) ?? extractHtmlFallback(html) ?? {
    price: null,
    currency: null,
    stockStatus: null,
    productTitle: null,
    sku: null,
    ean: null,
    packagingQty: null,
    method: null,
  }
}

async function robotsRules(targetUrl: string) {
  const url = new URL(targetUrl)
  const origin = url.origin
  const cached = robotsCache.get(origin)
  if (cached && Date.now() - cached.checkedAt < 60 * 60 * 1000) return cached.disallow

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const response = await safeRemoteFetch(`${origin}/robots.txt`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EngelsPricingMonitor/1.0' },
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!response.ok) return []
    const lines = (await response.text()).split(/\r?\n/).map((line) => line.split('#')[0].trim()).filter(Boolean)
    const disallow: string[] = []
    let applies = false
    for (const line of lines) {
      const [rawKey, ...rawValue] = line.split(':')
      const key = rawKey?.trim().toLowerCase()
      const value = rawValue.join(':').trim()
      if (key === 'user-agent') {
        const agent = value.toLowerCase()
        applies = agent === '*' || agent.includes('engelspricingmonitor')
      } else if (key === 'disallow' && applies && value) {
        disallow.push(value)
      }
    }
    robotsCache.set(origin, { checkedAt: Date.now(), disallow })
    return disallow
  } catch {
    return []
  }
}

async function isAllowedByRobots(targetUrl: string) {
  const url = new URL(targetUrl)
  const disallow = await robotsRules(targetUrl)
  return !disallow.some((rule) => rule === '/' || url.pathname.startsWith(rule))
}

async function fetchOfferPage(targetUrl: string) {
  if (!(await isAllowedByRobots(targetUrl))) throw new Error('Controle overgeslagen omdat robots.txt deze URL uitsluit.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await safeRemoteFetch(targetUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'EngelsPricingMonitor/1.0 (+pricing intelligence)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.7',
      },
    })
    if (!response.ok) throw new Error(`Bron gaf HTTP ${response.status}.`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`Onverwacht contenttype: ${contentType || 'onbekend'}.`)
    }
    return { html: await response.text(), statusCode: response.status }
  } finally {
    clearTimeout(timer)
  }
}

export async function runPriceCheck(competitorOfferId: string, companyId = DEFAULT_COMPANY_ID, capacityVerified = false) {
  const offer = await prisma.competitorOffer.findFirst({
    where: { id: competitorOfferId, companyId },
    include: { competitor: { include: { country: true } }, productMatch: { include: { product: true } } },
  })
  if (!offer) throw new Error('Concurrentieaanbieding niet gevonden.')
  if (!offer.isActive || !offer.competitor.isActive) throw new Error('Aanbieding of concurrent is niet actief.')
  if (!capacityVerified) await assertCompanyCapacity(offer.companyId, 'checksPerDay')

  const checkedAt = new Date()
  const previousPrice = offer.normalizedPrice
  const previousStockStatus = offer.stockStatus

  try {
    const { html, statusCode } = await fetchOfferPage(offer.url)
    const extracted = extractOfferSnapshot(html)
    if (!extracted.price) throw new Error('Geen betrouwbare prijs gevonden op de productpagina.')
    const currency = extracted.currency ?? offer.currency ?? offer.competitor.country.currency
    const packagingQty = extracted.packagingQty ?? offer.packagingQty ?? 1
    const normalized = normalizePrice(
      new Prisma.Decimal(extracted.price),
      offer.vatIncluded,
      offer.competitor.country.vatRate,
      currency,
      offer.packagingUnit,
      packagingQty,
      true,
      'EUR',
    ).amount

    await prisma.$transaction([
      prisma.priceCheck.create({
        data: {
          companyId: offer.companyId,
          competitorOfferId: offer.id,
          checkedAt,
          foundPrice: new Prisma.Decimal(extracted.price),
          currency,
          stockStatus: extracted.stockStatus ?? offer.stockStatus,
          productTitle: extracted.productTitle ?? offer.productMatch?.product.name ?? null,
          packagingUnit: offer.packagingUnit,
          checkMethod: extracted.method ?? 'SCRAPER',
          statusCode,
          sourceUrl: offer.url,
          isSuccess: true,
        },
      }),
      prisma.priceHistory.create({
        data: {
          companyId: offer.companyId,
          competitorOfferId: offer.id,
          recordedAt: checkedAt,
          price: new Prisma.Decimal(extracted.price),
          normalizedPrice: normalized,
          currency,
          stockStatus: extracted.stockStatus ?? offer.stockStatus,
          source: extracted.method ?? 'SCRAPER',
        },
      }),
      prisma.competitorOffer.update({
        where: { id: offer.id },
        data: {
          rawPrice: new Prisma.Decimal(extracted.price),
          normalizedPrice: normalized,
          currency,
          stockStatus: extracted.stockStatus ?? offer.stockStatus,
          lastCheckedAt: checkedAt,
        },
      }),
      prisma.competitor.update({ where: { id: offer.competitorId }, data: { lastCheckedAt: checkedAt } }),
    ])

    await evaluateMonitoringAlerts({
      competitorOfferId: offer.id,
      competitorId: offer.competitorId,
      countryId: offer.competitor.countryId,
      productId: offer.productMatch?.productId ?? null,
      productGroupId: offer.productMatch?.product.productGroupId ?? null,
      competitorName: offer.competitor.name,
      productName: offer.productMatch?.product.name ?? extracted.productTitle ?? 'Ongekoppeld product',
      previousPrice,
      currentPrice: normalized,
      ownPrice: offer.productMatch?.product.ownPrice,
      previousStockStatus,
      currentStockStatus: extracted.stockStatus ?? offer.stockStatus,
    })

    return {
      competitorOfferId: offer.id,
      success: true,
      checkedAt,
      price: extracted.price,
      normalizedPrice: normalized.toNumber(),
      currency,
      method: extracted.method,
      stockStatus: extracted.stockStatus ?? offer.stockStatus,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout tijdens prijscontrole.'
    await prisma.$transaction([
      prisma.priceCheck.create({
        data: {
          companyId: offer.companyId,
          competitorOfferId: offer.id,
          checkedAt,
          foundPrice: null,
          currency: offer.currency,
          stockStatus: offer.stockStatus,
          productTitle: offer.productMatch?.product.name ?? null,
          packagingUnit: offer.packagingUnit,
          checkMethod: 'SCRAPER',
          statusCode: null,
          errorMessage: message,
          sourceUrl: offer.url,
          isSuccess: false,
        },
      }),
      prisma.competitor.update({ where: { id: offer.competitorId }, data: { lastCheckedAt: checkedAt } }),
    ])
    return { competitorOfferId: offer.id, success: false, checkedAt, error: message }
  }
}

export async function runDuePriceChecks({
  companyId = DEFAULT_COMPANY_ID,
  limit = 40,
  competitorOfferId,
  productId,
  force = false,
}: {
  companyId?: string
  limit?: number
  competitorOfferId?: string
  productId?: string
  force?: boolean
} = {}) {
  const cappedLimit = Math.min(Math.max(limit, 1), 200)
  const offers = await prisma.competitorOffer.findMany({
    where: {
      companyId,
      id: competitorOfferId,
      isActive: true,
      competitor: { isActive: true },
      productMatch: productId
        ? { productId, matchStatus: { in: [MatchStatus.CERTAIN, MatchStatus.REVIEW] } }
        : { matchStatus: { in: [MatchStatus.CERTAIN, MatchStatus.REVIEW] } },
    },
    include: { competitor: true },
    orderBy: { lastCheckedAt: 'asc' },
    take: Math.min(cappedLimit * 5, 500),
  })

  const now = Date.now()
  const due = offers
    .filter((offer) => force || competitorOfferId || !offer.lastCheckedAt || now - offer.lastCheckedAt.getTime() >= offer.competitor.checkFrequencyHours * 60 * 60 * 1000)
    .slice(0, cappedLimit)

  if (due.length > 0) await assertCompanyCapacity(companyId, 'checksPerDay', due.length)
  const results = []
  for (const offer of due) results.push(await runPriceCheck(offer.id, companyId, true))

  return {
    requested: cappedLimit,
    due: due.length,
    successful: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  }
}
