import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { evaluateMonitoringAlerts } from '@/lib/alert-engine'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { convertWithFxSnapshot, getFxSnapshot } from '@/lib/fx-rates'
import { assessPriceQuality } from '@/lib/price-quality'
import { normalizePrice } from '@/lib/price-normalization'
import { prisma } from '@/lib/prisma'
import { safeRemoteFetch } from '@/lib/safe-remote-url'
import { extractShippingSnapshot } from '@/lib/shipping-extraction'
import { detectVatInclusion } from '@/lib/vat-detection'

type ExtractionMethod = 'JSON_LD' | 'META' | 'MAGENTO' | 'HTML_REGEX'
type ExtractedOffer = {
  price: number | null
  currency: string | null
  stockStatus: string | null
  productTitle: string | null
  sku: string | null
  ean: string | null
  packagingQty: number | null
  shippingCost: number | null
  shippingCurrency: string | null
  shippingLabel: string | null
  shippingMethod: string | null
  method: ExtractionMethod | null
}
type JsonRecord = Record<string, unknown>
type FetchMode = 'HTTP' | 'BROWSER'
export type PriceExtractionTarget = {
  ean?: string | null
  sku?: string | null
  productName?: string | null
  countryCode?: string | null
}

const robotsCache = new Map<string, { checkedAt: number; disallow: string[] }>()
const MAX_FETCH_ATTEMPTS = 3

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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


function normalizedIdentifier(value: unknown) {
  return String(value ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase()
}

function productIdentityScore(product: JsonRecord, target?: PriceExtractionTarget) {
  if (!target) return 0

  const targetEan = normalizedIdentifier(target.ean)
  const targetSku = normalizedIdentifier(target.sku)
  const productEan = normalizedIdentifier(product.gtin13 ?? product.gtin14 ?? product.gtin ?? product.ean)
  const productSku = normalizedIdentifier(product.sku ?? product.mpn)

  let score = 0
  if (targetEan && productEan) score += targetEan === productEan ? 100 : -40
  if (targetSku && productSku) score += targetSku === productSku ? 80 : -25

  const expectedWords = new Set(String(target.productName ?? '').toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ').split(/\s+/).filter((word) => word.length >= 3))
  const actualWords = new Set(String(product.name ?? '').toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ').split(/\s+/).filter((word) => word.length >= 3))
  if (expectedWords.size && actualWords.size) {
    const overlap = [...expectedWords].filter((word) => actualWords.has(word)).length / expectedWords.size
    score += Math.round(overlap * 30)
  }

  return score
}

function nestedOfferCandidates(product: JsonRecord) {
  if (!product.offers || typeof product.offers !== 'object') return [] as JsonRecord[]
  const records = walkJson(product.offers)
  const typed = records.filter((record) =>
    typeNames(record['@type']).some((item) => ['offer', 'aggregateoffer'].includes(item.toLowerCase())),
  )
  if (typed.length) return typed
  return records.filter((record) => record.price !== undefined || record.lowPrice !== undefined || record.highPrice !== undefined)
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

function directQuantity(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10_000) return value
  if (typeof value === 'string' && /^\d{1,5}$/.test(value.trim())) {
    const numeric = Number(value.trim())
    return numeric > 0 && numeric <= 10_000 ? numeric : null
  }
  if (value && typeof value === 'object') {
    const record = value as JsonRecord
    return directQuantity(record.value ?? record.amount ?? record.quantity)
  }
  return null
}

function packagingQuantity(...values: unknown[]) {
  for (const value of values) {
    const direct = directQuantity(value)
    if (direct) return direct
    if (typeof value !== 'string') continue
    const compact = value.replace(/\s+/g, ' ').trim()
    const patterns = [
      /\b(?:pack|package|doos|box|case|set|verpakking|bundle|tray)\b\s*(?:van|of|x|:)?\s*(\d{1,4})\b/i,
      /\b(\d{1,4})\s*(?:stuks?|pcs?|pieces?|units?)\b/i,
      /(?:per|à)\s*(\d{1,4})\s*(?:stuks?|pcs?|pieces?|units?)?/i,
    ]
    for (const pattern of patterns) {
      const match = compact.match(pattern)
      const numeric = Number(match?.[1])
      if (Number.isInteger(numeric) && numeric > 0 && numeric <= 10_000) return numeric
    }
  }
  return null
}

function extractJsonLd(html: string, target?: PriceExtractionTarget): ExtractedOffer | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const candidates: Array<{ product: JsonRecord; offer: JsonRecord; score: number; order: number }> = []
  let order = 0

  for (const script of scripts) {
    const raw = script[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw.replace(/<!--|-->/g, ''))
      const records = walkJson(parsed)
      const products = records.filter((record) => typeNames(record['@type']).some((item) => item.toLowerCase() === 'product'))

      for (const product of products) {
        for (const offer of nestedOfferCandidates(product)) {
          candidates.push({ product, offer, score: productIdentityScore(product, target), order: order++ })
        }
      }
    } catch {
      continue
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order)
  for (const { product, offer } of candidates) {
    const price = parseLocalizedPrice(offer.price ?? offer.lowPrice ?? offer.highPrice)
    if (!price) continue
    return {
      price,
      currency: text(offer.priceCurrency),
      stockStatus: availabilityLabel(offer.availability),
      productTitle: text(product.name),
      sku: text(product.sku ?? product.mpn ?? offer.sku),
      ean: text(product.gtin13 ?? product.gtin14 ?? product.gtin ?? product.ean),
      packagingQty: packagingQuantity(
        offer.eligibleQuantity,
        offer.quantity,
        product.size,
        product.description,
        product.name,
      ),
      method: 'JSON_LD',
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
  const title = values.get('og:title') ?? null
  return {
    price,
    currency: ['product:price:currency', 'og:price:currency', 'pricecurrency'].map((key) => values.get(key)).find(Boolean) ?? null,
    stockStatus: availabilityLabel(values.get('product:availability') ?? values.get('availability')),
    productTitle: title,
    sku: values.get('sku') ?? null,
    ean: values.get('gtin13') ?? values.get('gtin') ?? null,
    packagingQty: packagingQuantity(values.get('quantity'), values.get('product:quantity'), values.get('packaging'), title),
    method: 'META',
  }
}

function extractMagento(html: string): ExtractedOffer | null {
  const compact = html.replace(/\s+/g, ' ')
  const candidates = [
    compact.match(/data-price-amount=["']([0-9][0-9.,]*)["']/i)?.[1],
    compact.match(/"finalPrice"\s*:\s*\{[^{}]{0,320}?"amount"\s*:\s*"?([0-9][0-9.,]*)"?/i)?.[1],
    compact.match(/"basePrice"\s*:\s*\{[^{}]{0,320}?"amount"\s*:\s*"?([0-9][0-9.,]*)"?/i)?.[1],
    compact.match(/"priceAmount"\s*:\s*"?([0-9][0-9.,]*)"?/i)?.[1],
  ]
  const price = candidates.map((value) => parseLocalizedPrice(value)).find((value) => value !== null) ?? null
  if (!price) return null

  const title = compact.match(/<title[^>]*>([^<]{2,180})<\/title>/i)?.[1]?.trim() ?? null
  const currency = compact.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/i)?.[1]
    ?? compact.match(/data-price-currency=["']([A-Z]{3})["']/i)?.[1]
    ?? (/€/.test(compact) ? 'EUR' : /£/.test(compact) ? 'GBP' : null)
  const stockStatus = /niet op voorraad|out of stock|sold out/i.test(compact)
    ? 'Niet op voorraad'
    : /op voorraad|in stock|available/i.test(compact)
      ? 'Op voorraad'
      : null

  return {
    price,
    currency,
    stockStatus,
    productTitle: title,
    sku: compact.match(/"sku"\s*:\s*"([^"\\]{1,120})"/i)?.[1] ?? null,
    ean: compact.match(/"(?:gtin13|gtin|ean)"\s*:\s*"([0-9]{8,14})"/i)?.[1] ?? null,
    packagingQty: packagingQuantity(title, compact.slice(0, 7000)),
    method: 'MAGENTO',
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
    return { price, currency: pattern.currency, stockStatus, productTitle: title, sku: null, ean: null, packagingQty: packagingQuantity(title, compact.slice(0, 5000)), method: 'HTML_REGEX' }
  }
  return null
}

export function extractOfferSnapshot(html: string, target?: PriceExtractionTarget): ExtractedOffer {
  const offer = extractJsonLd(html, target) ?? extractMeta(html) ?? extractMagento(html) ?? extractHtmlFallback(html) ?? {
    price: null,
    currency: null,
    stockStatus: null,
    productTitle: null,
    sku: null,
    ean: null,
    packagingQty: null,
    method: null,
  }
  const shipping = extractShippingSnapshot(html, {
    ean: target?.ean,
    productName: target?.productName,
    countryCode: target?.countryCode,
  })
  return {
    ...offer,
    shippingCost: shipping.cost,
    shippingCurrency: shipping.currency,
    shippingLabel: shipping.label,
    shippingMethod: shipping.method,
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
      headers: { 'User-Agent': 'PrysightPriceMonitor/2.0' },
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
        applies = agent === '*' || agent.includes('prysightpricemonitor')
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

async function fetchHtmlOnce(targetUrl: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await safeRemoteFetch(targetUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'PrysightPriceMonitor/2.0 (+pricing intelligence)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.7',
      },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (response.ok) {
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new Error(`Onverwacht contenttype: ${contentType || 'onbekend'}.`)
      }
      const html = await response.text()
      if (!html.trim()) throw new Error('Bron gaf een lege productpagina terug.')
      return { html, statusCode: response.status }
    }
    const error = new Error(`Bron gaf HTTP ${response.status}.`)
    return { error, retryable: response.status === 429 || response.status >= 500, statusCode: response.status }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOfferPage(targetUrl: string) {
  if (!(await isAllowedByRobots(targetUrl))) throw new Error('Controle overgeslagen omdat robots.txt deze URL uitsluit.')
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const result = await fetchHtmlOnce(targetUrl)
      if ('html' in result) return result
      lastError = result.error
      if (!result.retryable) throw result.error
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Bron kon niet worden opgehaald.')
    }
    if (attempt < MAX_FETCH_ATTEMPTS) await wait(attempt * 500)
  }
  throw lastError ?? new Error('Bron kon na meerdere pogingen niet worden opgehaald.')
}

function browserRendererConfigured() {
  return Boolean(process.env.BROWSER_RENDERER_URL?.trim())
}

function renderedHtmlFromPayload(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return value.trim() ? value : null
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return null
  const record = value as Record<string, unknown>
  for (const key of ['html', 'content', 'body', 'result', 'data']) {
    const html = renderedHtmlFromPayload(record[key], depth + 1)
    if (html) return html
  }
  return null
}

export function publicPriceCheckErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const normalized = raw.toLowerCase()
  if (/empty response|no result returned|geen html|lege productpagina/.test(normalized)) return 'Bron leverde geen leesbare productpagina terug.'
  if (/\b429\b|too many requests|rate limit/.test(normalized)) return 'Bron beperkt het aantal prijscontroles. Probeer later opnieuw.'
  if (/\b403\b|forbidden|access denied|captcha|robots\.txt|robot check|bot protection/.test(normalized)) return 'Bron blokkeert automatische prijscontrole.'
  if (/timeout|timed out|aborterror|aborted/.test(normalized)) return 'Bron reageerde niet op tijd.'
  if (/prijsvalidatie afgekeurd/.test(normalized)) {
    if (/plausibiliteitsbandbreedte/.test(normalized)) return 'Prijs gevonden, maar de genormaliseerde prijs wijkt onwaarschijnlijk af van de eigen prijs.'
    if (/productidentiteit onvoldoende bevestigd/.test(normalized)) return 'Prijs gevonden, maar het gekoppelde product kon niet betrouwbaar genoeg worden bevestigd.'
    if (/ean|gtin/.test(normalized)) return 'Prijs gevonden, maar EAN of GTIN wijkt af van het gekoppelde product.'
    if (/sku|artikelnummer/.test(normalized)) return 'Prijs gevonden, maar SKU of artikelnummer wijkt af van het gekoppelde product.'
    return 'Prijs gevonden, maar de kwaliteitscontrole heeft deze meting afgewezen.'
  }
  if (/geen betrouwbare prijs|prijs niet gevonden|price not found/.test(normalized)) return 'Geen betrouwbare prijs gevonden op deze productpagina.'
  if (/browser renderer|scraping service|renderer/.test(normalized)) return 'Dynamische productpagina kon niet worden uitgelezen.'
  return 'Prijscontrole kon niet worden afgerond.'
}

async function fetchRenderedOfferPage(targetUrl: string) {
  const rendererUrl = process.env.BROWSER_RENDERER_URL?.trim()
  if (!rendererUrl) throw new Error('Browser rendering is niet geconfigureerd.')
  const token = process.env.BROWSER_RENDERER_TOKEN?.trim()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await safeRemoteFetch(rendererUrl, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json,text/html',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url: targetUrl }),
    })
    if (!response.ok) throw new Error(`Browser renderer gaf HTTP ${response.status}.`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = await response.json() as Record<string, unknown>
      const html = renderedHtmlFromPayload(body)
      if (!html) throw new Error('Browser renderer gaf geen HTML terug.')
      const statusCode = typeof body.statusCode === 'number'
        ? body.statusCode
        : typeof body.status === 'number'
          ? body.status
          : 200
      return { html, statusCode }
    }
    const html = await response.text()
    if (!html.trim()) throw new Error('Browser renderer gaf geen HTML terug.')
    return { html, statusCode: 200 }
  } finally {
    clearTimeout(timer)
  }
}

function methodLabel(method: ExtractionMethod | null, fetchMode: FetchMode, fxSource: string | null, fxAsOf: string | null) {
  const base = `${fetchMode}_${method ?? 'UNKNOWN'}`
  return fxSource && fxAsOf ? `${base}|FX:${fxSource}:${fxAsOf}` : base
}

function isManuallyConfirmedMatch(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return String((value as Record<string, unknown>).source ?? '').trim().toLowerCase() === 'manual'
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
  const product = offer.productMatch?.product
  const trustedProductMapping = offer.productMatch?.matchStatus === MatchStatus.CERTAIN && isManuallyConfirmedMatch(offer.productMatch?.matchEvidence)
  const extractionTarget: PriceExtractionTarget = {
    ean: trustedProductMapping ? null : product?.ean ?? product?.gtin,
    sku: trustedProductMapping ? null : product?.articleNumber,
    productName: product?.name,
    countryCode: offer.competitor.country.code,
  }
  let diagnosticSnapshot: {
    foundPrice: number | null
    currency: string
    stockStatus: string | null
    productTitle: string | null
    shippingCost: number | null
    shippingCurrency: string | null
    shippingLabel: string | null
    checkMethod: string
    statusCode: number | null
  } | null = null

  try {
    let fetchMode: FetchMode = 'HTTP'
    let page = await fetchOfferPage(offer.url)
    let extracted = extractOfferSnapshot(page.html, extractionTarget)

    if (!extracted.price && browserRendererConfigured()) {
      try {
        const renderedPage = await fetchRenderedOfferPage(offer.url)
        const renderedExtraction = extractOfferSnapshot(renderedPage.html, extractionTarget)
        if (renderedExtraction.price) {
          page = renderedPage
          extracted = renderedExtraction
          fetchMode = 'BROWSER'
        }
      } catch (rendererError) {
        console.warn('Browser renderer fallback failed', {
          companyId: offer.companyId,
          competitorOfferId: offer.id,
          error: rendererError instanceof Error ? rendererError.message : String(rendererError),
        })
      }
    }

    if (!extracted.price) throw new Error('Geen betrouwbare prijs gevonden op de productpagina.')
    const currency = (extracted.currency ?? offer.currency ?? offer.competitor.country.currency).toUpperCase()
    const packagingQty = extracted.packagingQty ?? offer.packagingQty ?? 1
    const detectedVat = detectVatInclusion(page.html, extracted.price)
    const sourceVatIncluded = detectedVat.vatIncluded ?? offer.vatIncluded

    const shippingCurrency = (extracted.shippingCurrency ?? currency).toUpperCase()
    let priceForNormalization = extracted.price
    let shippingForNormalization = extracted.shippingCost
    let fxSource: string | null = null
    let fxAsOf: string | null = null
    if (currency !== 'EUR' || (shippingForNormalization !== null && shippingCurrency !== 'EUR')) {
      const fxSnapshot = await getFxSnapshot()
      if (currency !== 'EUR') priceForNormalization = convertWithFxSnapshot(extracted.price, currency, 'EUR', fxSnapshot)
      if (shippingForNormalization !== null && shippingCurrency !== 'EUR') {
        shippingForNormalization = convertWithFxSnapshot(shippingForNormalization, shippingCurrency, 'EUR', fxSnapshot)
      }
      fxSource = fxSnapshot.source
      fxAsOf = fxSnapshot.asOf
    }

    const normalized = normalizePrice(
      new Prisma.Decimal(priceForNormalization),
      sourceVatIncluded,
      offer.competitor.country.vatRate,
      'EUR',
      offer.packagingUnit,
      packagingQty,
      true,
      'EUR',
    ).amount
    const normalizedShipping = shippingForNormalization === null
      ? null
      : normalizePrice(
          new Prisma.Decimal(shippingForNormalization),
          sourceVatIncluded,
          offer.competitor.country.vatRate,
          'EUR',
          offer.packagingUnit,
          packagingQty,
          true,
          'EUR',
        ).amount
    const deliveredPrice = normalizedShipping === null ? null : normalized.add(normalizedShipping)
    const shippingLabel = extracted.shippingLabel ?? (extracted.shippingCost === 0 ? 'Gratis verzending' : null)

    const checkMethod = methodLabel(extracted.method, fetchMode, fxSource, fxAsOf)
    diagnosticSnapshot = {
      foundPrice: extracted.price,
      currency,
      stockStatus: extracted.stockStatus ?? offer.stockStatus,
      productTitle: extracted.productTitle ?? product?.name ?? null,
      shippingCost: extracted.shippingCost,
      shippingCurrency,
      shippingLabel,
      checkMethod,
      statusCode: page.statusCode,
    }

    const quality = assessPriceQuality({
      extractedPrice: extracted.price,
      normalizedPrice: normalized.toNumber(),
      method: extracted.method,
      extractedEan: extracted.ean,
      extractedSku: extracted.sku,
      extractedTitle: extracted.productTitle,
      productEan: product?.ean,
      articleNumber: product?.articleNumber,
      productName: product?.name,
      ownPrice: product?.ownPrice === null || product?.ownPrice === undefined ? null : Number(product.ownPrice),
      trustedProductMapping,
    })

    if (!quality.accepted) {
      throw new Error(`Prijsvalidatie afgekeurd: ${quality.reasons.join(' ')}`)
    }

    await prisma.$transaction([
      prisma.priceCheck.create({
        data: {
          companyId: offer.companyId,
          competitorOfferId: offer.id,
          checkedAt,
          foundPrice: new Prisma.Decimal(extracted.price),
          shippingCost: extracted.shippingCost === null ? null : new Prisma.Decimal(extracted.shippingCost),
          normalizedShippingCost: normalizedShipping,
          deliveredPrice,
          shippingCurrency: extracted.shippingCost === null ? null : shippingCurrency,
          shippingLabel,
          currency,
          stockStatus: extracted.stockStatus ?? offer.stockStatus,
          productTitle: extracted.productTitle ?? offer.productMatch?.product.name ?? null,
          packagingUnit: offer.packagingUnit,
          checkMethod,
          statusCode: page.statusCode,
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
          shippingCost: extracted.shippingCost === null ? null : new Prisma.Decimal(extracted.shippingCost),
          normalizedShippingCost: normalizedShipping,
          deliveredPrice,
          shippingCurrency: extracted.shippingCost === null ? null : shippingCurrency,
          shippingLabel,
          currency,
          stockStatus: extracted.stockStatus ?? offer.stockStatus,
          source: checkMethod,
        },
      }),
      prisma.competitorOffer.update({
        where: { id: offer.id },
        data: {
          rawPrice: new Prisma.Decimal(extracted.price),
          normalizedPrice: normalized,
          shippingCost: extracted.shippingCost === null ? null : new Prisma.Decimal(extracted.shippingCost),
          normalizedShippingCost: normalizedShipping,
          deliveredPrice,
          shippingCurrency: extracted.shippingCost === null ? null : shippingCurrency,
          shippingLabel,
          currency,
          packagingQty,
          vatIncluded: sourceVatIncluded,
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
      method: checkMethod,
      confidence: quality.confidence,
      packagingQty,
      shippingCost: extracted.shippingCost,
      normalizedShippingCost: normalizedShipping?.toNumber() ?? null,
      deliveredPrice: deliveredPrice?.toNumber() ?? null,
      shippingCurrency: extracted.shippingCost === null ? null : shippingCurrency,
      shippingLabel,
      fxSource,
      fxAsOf,
      stockStatus: extracted.stockStatus ?? offer.stockStatus,
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Onbekende fout tijdens prijscontrole.'
    const message = publicPriceCheckErrorMessage(error)
    console.warn('Price check failed', {
      companyId: offer.companyId,
      competitorOfferId: offer.id,
      error: rawMessage,
    })
    await prisma.$transaction([
      prisma.priceCheck.create({
        data: {
          companyId: offer.companyId,
          competitorOfferId: offer.id,
          checkedAt,
          foundPrice: diagnosticSnapshot?.foundPrice ? new Prisma.Decimal(diagnosticSnapshot.foundPrice) : null,
          shippingCost: diagnosticSnapshot?.shippingCost === null || diagnosticSnapshot?.shippingCost === undefined ? null : new Prisma.Decimal(diagnosticSnapshot.shippingCost),
          shippingCurrency: diagnosticSnapshot?.shippingCurrency ?? null,
          shippingLabel: diagnosticSnapshot?.shippingLabel ?? null,
          currency: diagnosticSnapshot?.currency ?? offer.currency,
          stockStatus: diagnosticSnapshot?.stockStatus ?? offer.stockStatus,
          productTitle: diagnosticSnapshot?.productTitle ?? offer.productMatch?.product.name ?? null,
          packagingUnit: offer.packagingUnit,
          checkMethod: diagnosticSnapshot ? `${diagnosticSnapshot.checkMethod}|REJECTED` : 'HTTP_FAILED',
          statusCode: diagnosticSnapshot?.statusCode ?? null,
          errorMessage: message,
          sourceUrl: offer.url,
          isSuccess: false,
        },
      }),
      prisma.competitorOffer.update({ where: { id: offer.id }, data: { lastCheckedAt: checkedAt } }),
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
  const concurrency = Math.min(4, due.length)
  for (let index = 0; index < due.length; index += concurrency) {
    const batch = due.slice(index, index + concurrency)
    results.push(...await Promise.all(batch.map((offer) => runPriceCheck(offer.id, companyId, true))))
  }

  return {
    requested: cappedLimit,
    due: due.length,
    successful: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  }
}
