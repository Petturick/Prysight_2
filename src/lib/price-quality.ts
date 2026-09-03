export type PriceExtractionMethod = 'JSON_LD' | 'META' | 'HTML_REGEX' | null

export type PriceQualityInput = {
  extractedPrice: number | null
  normalizedPrice: number | null
  method: PriceExtractionMethod
  extractedEan?: string | null
  extractedSku?: string | null
  extractedTitle?: string | null
  productEan?: string | null
  articleNumber?: string | null
  productName?: string | null
  ownPrice?: number | null
}

export type PriceQualityResult = {
  accepted: boolean
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'REJECTED'
  reasons: string[]
}

function normalizeIdentifier(value: string | null | undefined) {
  return String(value ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase()
}

function normalizeWords(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^0-9a-zà-ÿ]+/gi, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
}

function titleSimilarity(productName: string | null | undefined, extractedTitle: string | null | undefined) {
  const productWords = normalizeWords(productName)
  const titleWords = new Set(normalizeWords(extractedTitle))
  if (!productWords.length || !titleWords.size) return null
  const matched = productWords.filter((word) => titleWords.has(word)).length
  return matched / productWords.length
}

export function isPlausibleMarketPrice(ownPrice: number | null | undefined, competitorPrice: number | null | undefined) {
  if (competitorPrice === null || competitorPrice === undefined || !Number.isFinite(competitorPrice) || competitorPrice <= 0) return false
  if (ownPrice === null || ownPrice === undefined || !Number.isFinite(ownPrice) || ownPrice <= 0) return true
  const ratio = competitorPrice / ownPrice
  return ratio >= 0.15 && ratio <= 6
}

export function assessPriceQuality(input: PriceQualityInput): PriceQualityResult {
  const reasons: string[] = []
  if (input.extractedPrice === null || input.normalizedPrice === null || !Number.isFinite(input.normalizedPrice) || input.normalizedPrice <= 0) {
    return { accepted: false, confidence: 'REJECTED', reasons: ['Geen geldige positieve prijs gevonden.'] }
  }

  const productEan = normalizeIdentifier(input.productEan)
  const extractedEan = normalizeIdentifier(input.extractedEan)
  const articleNumber = normalizeIdentifier(input.articleNumber)
  const extractedSku = normalizeIdentifier(input.extractedSku)

  const eanComparable = Boolean(productEan && extractedEan)
  const eanMatch = eanComparable && productEan === extractedEan
  if (eanComparable && !eanMatch) {
    return { accepted: false, confidence: 'REJECTED', reasons: ['EAN of GTIN van de concurrentpagina wijkt af van het gekoppelde product.'] }
  }

  const skuComparable = Boolean(articleNumber && extractedSku)
  const skuMatch = skuComparable && articleNumber === extractedSku
  if (skuComparable && !skuMatch) {
    return { accepted: false, confidence: 'REJECTED', reasons: ['SKU of artikelnummer van de concurrentpagina wijkt af van het gekoppelde product.'] }
  }

  const similarity = titleSimilarity(input.productName, input.extractedTitle)
  const plausible = isPlausibleMarketPrice(input.ownPrice, input.normalizedPrice)
  if (!plausible) reasons.push('Prijs ligt buiten de professionele plausibiliteitsbandbreedte ten opzichte van de eigen prijs.')

  if (eanMatch) {
    if (!plausible) return { accepted: false, confidence: 'REJECTED', reasons }
    return { accepted: true, confidence: 'HIGH', reasons: ['EAN of GTIN komt exact overeen.'] }
  }

  if (skuMatch && plausible && input.method !== 'HTML_REGEX') {
    return { accepted: true, confidence: 'HIGH', reasons: ['Artikelnummer of SKU komt exact overeen.'] }
  }

  if (input.method === 'JSON_LD' || input.method === 'META') {
    if (!plausible) return { accepted: false, confidence: 'REJECTED', reasons }
    if (similarity !== null && similarity >= 0.5) {
      return { accepted: true, confidence: 'MEDIUM', reasons: ['Producttitel komt voldoende overeen met het gekoppelde product.'] }
    }
    return { accepted: false, confidence: 'LOW', reasons: ['Prijsbron is gestructureerd, maar productidentiteit is onvoldoende bevestigd.'] }
  }

  if (input.method === 'HTML_REGEX') {
    if (!plausible) return { accepted: false, confidence: 'REJECTED', reasons }
    if (similarity !== null && similarity >= 0.75) {
      return { accepted: false, confidence: 'LOW', reasons: ['Los HTML bedrag gevonden, aanvullende validatie vereist voordat dit als marktprijs mag meetellen.'] }
    }
    return { accepted: false, confidence: 'REJECTED', reasons: ['Los bedrag uit HTML is onvoldoende betrouwbaar als productprijs.'] }
  }

  return { accepted: false, confidence: 'REJECTED', reasons: ['Geen betrouwbare extractiemethode beschikbaar.'] }
}
