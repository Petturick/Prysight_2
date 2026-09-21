type JsonRecord = Record<string, unknown>

export type ShippingExtractionTarget = {
  ean?: string | null
  productName?: string | null
  countryCode?: string | null
}

export type ShippingSnapshot = {
  cost: number | null
  currency: string | null
  label: string | null
  method: 'JSON_LD' | 'META' | 'HTML' | null
}

function normalizedIdentifier(value: unknown) {
  return String(value ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase()
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/ /g, ' ').replace(/[^0-9,.-]/g, '').trim()
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (lastComma > lastDot) normalized = cleaned.replace(/./g, '').replace(',', '.')
  else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '')
  else normalized = cleaned.replace(',', '.')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100_000 ? numeric : null
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

function productScore(product: JsonRecord, target?: ShippingExtractionTarget) {
  if (!target) return 0
  const expectedEan = normalizedIdentifier(target.ean)
  const actualEan = normalizedIdentifier(product.gtin13 ?? product.gtin14 ?? product.gtin ?? product.ean)
  let score = expectedEan && actualEan ? (expectedEan === actualEan ? 100 : -50) : 0

  const expectedWords = new Set(String(target.productName ?? '').toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ').split(/s+/).filter((word) => word.length >= 4))
  const actualWords = new Set(String(product.name ?? '').toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ').split(/s+/).filter((word) => word.length >= 4))
  if (expectedWords.size && actualWords.size) {
    const overlap = [...expectedWords].filter((word) => actualWords.has(word)).length / expectedWords.size
    score += Math.round(overlap * 30)
  }
  return score
}

function countryCodeFromDetail(detail: JsonRecord) {
  const destination = detail.shippingDestination
  const values = Array.isArray(destination) ? destination : destination ? [destination] : []
  for (const value of values) {
    if (!value || typeof value !== 'object') continue
    const record = value as JsonRecord
    const code = text(record.addressCountry ?? record.countryCode ?? record.name)
    if (code && /^[A-Za-z]{2}$/.test(code)) return code.toUpperCase()
    if (record.addressCountry && typeof record.addressCountry === 'object') {
      const nested = record.addressCountry as JsonRecord
      const nestedCode = text(nested.name ?? nested.identifier)
      if (nestedCode && /^[A-Za-z]{2}$/.test(nestedCode)) return nestedCode.toUpperCase()
    }
  }
  return null
}

function shippingRate(detail: JsonRecord, fallbackCurrency: string | null) {
  const rawRate = detail.shippingRate ?? detail.deliveryCharge ?? detail.shippingCost
  if (rawRate === null || rawRate === undefined) return null
  if (typeof rawRate === 'number' || typeof rawRate === 'string') {
    const cost = parseAmount(rawRate)
    return cost === null ? null : { cost, currency: fallbackCurrency }
  }
  if (typeof rawRate !== 'object' || Array.isArray(rawRate)) return null
  const rate = rawRate as JsonRecord
  const cost = parseAmount(rate.value ?? rate.price ?? rate.amount)
  if (cost === null) return null
  return { cost, currency: text(rate.currency ?? rate.priceCurrency) ?? fallbackCurrency }
}

function shippingDetailsFromOffer(offer: JsonRecord, target?: ShippingExtractionTarget): ShippingSnapshot | null {
  const raw = offer.shippingDetails ?? offer.shippingDetail
  const details = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  for (const value of details) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const detail = value as JsonRecord
    const destination = countryCodeFromDetail(detail)
    const requestedCountry = target?.countryCode?.trim().toUpperCase() || null
    if (requestedCountry && destination && destination !== requestedCountry) continue
    const rate = shippingRate(detail, text(offer.priceCurrency))
    if (!rate) continue
    return {
      cost: rate.cost,
      currency: rate.currency,
      label: rate.cost === 0 ? 'Gratis verzending' : 'Verzendkosten op productpagina',
      method: 'JSON_LD',
    }
  }
  return null
}

function extractJsonLd(html: string, target?: ShippingExtractionTarget): ShippingSnapshot | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const candidates: Array<{ product: JsonRecord; score: number }> = []
  for (const script of scripts) {
    const raw = script[1]?.trim()
    if (!raw) continue
    try {
      const records = walkJson(JSON.parse(raw.replace(/<!--|-->/g, '')))
      for (const product of records.filter((record) => typeNames(record['@type']).some((item) => item.toLowerCase() === 'product'))) {
        candidates.push({ product, score: productScore(product, target) })
      }
    } catch {
      continue
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  for (const { product } of candidates) {
    const rawOffers = product.offers
    const offers = Array.isArray(rawOffers) ? rawOffers : rawOffers && typeof rawOffers === 'object' ? walkJson(rawOffers).filter((record) => typeNames(record['@type']).some((item) => item.toLowerCase().includes('offer')) || record.shippingDetails !== undefined) : []
    for (const offer of offers) {
      const result = shippingDetailsFromOffer(offer, target)
      if (result) return result
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

function extractMeta(html: string): ShippingSnapshot | null {
  const values = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name') ?? attribute(tag, 'itemprop'))?.toLowerCase()
    const content = attribute(tag, 'content')
    if (key && content) values.set(key, content)
  }
  const amount = [
    'product:shipping_cost:amount', 'og:shipping_cost:amount', 'shipping_cost',
    'shippingcost', 'shipping_rate', 'shippingrate',
  ].map((key) => parseAmount(values.get(key))).find((value) => value !== null) ?? null
  if (amount === null) return null
  const currency = [
    'product:shipping_cost:currency', 'og:shipping_cost:currency',
    'shipping_currency', 'shippingcurrency',
  ].map((key) => values.get(key)).find(Boolean) ?? null
  return {
    cost: amount,
    currency,
    label: amount === 0 ? 'Gratis verzending' : 'Verzendkosten op productpagina',
    method: 'META',
  }
}

function currencyFromContext(value: string) {
  if (/£|\bGBP\b/i.test(value)) return 'GBP'
  if (/\bDKK\b|\bkr\.?\b/i.test(value)) return 'DKK'
  return 'EUR'
}

function extractHtml(html: string): ShippingSnapshot | null {
  const compact = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&euro;|&#8364;/gi, '€')
    .replace(/&pound;|&#163;/gi, '£')
    .replace(/\s+/g, ' ')
    .trim()

  const freeTerms = /(gratis verzending|gratis bezorging|free shipping|free delivery|versandkostenfrei|kostenloser versand|livraison gratuite)/gi
  for (const match of compact.matchAll(freeTerms)) {
    const after = compact.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 70)
    if (!/\b(vanaf|from|over|above|orders? over|bij bestellingen|ab|dès|à partir)\b/i.test(after)) {
      return { cost: 0, currency: currencyFromContext(compact), label: 'Gratis verzending', method: 'HTML' }
    }
  }

  const patterns = [
    /(?:verzendkosten|bezorgkosten)\s*(?!vanaf\b)(?:bedragen\s*)?(?:[:\-]\s*)?(€|EUR|£|GBP|DKK|kr\.?)?\s*([0-9][0-9.,]{0,10})/i,
    /(?:shipping\s*(?:cost|fee)|delivery\s*(?:cost|fee))\s*(?!from\b|over\b|above\b)(?:[:\-]\s*)?(€|EUR|£|GBP|DKK|kr\.?)?\s*([0-9][0-9.,]{0,10})/i,
    /(?:versandkosten|frais de livraison)\s*(?!ab\b|dès\b)(?:[:\-]\s*)?(€|EUR|£|GBP|DKK|kr\.?)?\s*([0-9][0-9.,]{0,10})/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const cost = parseAmount(match[2])
    if (cost === null) continue
    const context = compact.slice(Math.max(0, (match.index ?? 0) - 25), (match.index ?? 0) + match[0].length + 25)
    if (/\b(vanaf|from|over|above|ab|dès|à partir)\b/i.test(context)) continue
    return {
      cost,
      currency: currencyFromContext(match[1] || context),
      label: cost === 0 ? 'Gratis verzending' : 'Verzendkosten op productpagina',
      method: 'HTML',
    }
  }
  return null
}

export function extractShippingSnapshot(html: string, target?: ShippingExtractionTarget): ShippingSnapshot {
  return extractJsonLd(html, target) ?? extractMeta(html) ?? extractHtml(html) ?? {
    cost: null,
    currency: null,
    label: null,
    method: null,
  }
}
