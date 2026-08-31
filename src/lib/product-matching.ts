type ProductInput = { articleNumber?: string | null; ean?: string | null; gtin?: string | null; name: string; packagingUnit?: string | null; packagingQty?: number | null }
type OfferInput = { sku?: string | null; ean?: string | null; gtin?: string | null; productTitle?: string | null; packagingUnit?: string | null; packagingQty?: number | null; url?: string | null }

const ignoredTokens = new Set(['de', 'het', 'een', 'en', 'of', 'voor', 'met', 'the', 'and', 'with', 'pcs', 'stuks', 'stuk'])

function normalizeText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[×]/g, 'x').replace(/[^a-z0-9x\s.-]/g, ' ').replace(/\s+/g, ' ').trim()
}
function compactIdentifier(value: string | null | undefined) { return normalizeText(value).replace(/[^a-z0-9]/g, '') }
function tokenize(value: string | null | undefined) { return new Set(normalizeText(value).split(' ').map((token) => token.trim()).filter((token) => token.length > 1 && !ignoredTokens.has(token))) }
function dimensionsFromText(value: string | null | undefined): string[] { return normalizeText(value).replace(/\s*x\s*/g, 'x').match(/\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)?/g) ?? [] }
function numberTokens(value: string | null | undefined) { return new Set(normalizeText(value).match(/\b\d+(?:[.,]\d+)?\b/g) ?? []) }
function modelTokens(value: string | null | undefined) { return new Set(normalizeText(value).split(' ').map((token) => token.replace(/[^a-z0-9-]/g, '')).filter((token) => token.length >= 4 && /[a-z]/.test(token) && /\d/.test(token))) }
function overlapScore(left: Set<string>, right: Set<string>, maxScore: number) {
  if (left.size === 0 || right.size === 0) return { shared: [] as string[], score: 0 }
  const shared = [...left].filter((token) => right.has(token))
  const precision = shared.length / right.size
  const recall = shared.length / left.size
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { shared, score: Math.round(f1 * maxScore) }
}

export function matchProducts(product: ProductInput, offer: OfferInput) {
  let score = 0
  const evidence: Record<string, unknown> = {}
  const productEan = compactIdentifier(product.ean ?? product.gtin)
  const offerEan = compactIdentifier(offer.ean ?? offer.gtin)
  if (productEan && offerEan && productEan === offerEan) return { score: 100, evidence: { ean: { product: productEan, offer: offerEan, match: true } }, status: 'CERTAIN' as const }

  const productSku = compactIdentifier(product.articleNumber)
  const offerSku = compactIdentifier(offer.sku)
  if (productSku && offerSku && productSku === offerSku) return { score: 95, evidence: { sku: { product: product.articleNumber, offer: offer.sku, match: true } }, status: 'CERTAIN' as const }

  const nameMatch = overlapScore(tokenize(product.name), tokenize(offer.productTitle), 55)
  score += nameMatch.score
  evidence.name = { sharedWords: nameMatch.shared, nameScore: nameMatch.score }

  const productDimensions = dimensionsFromText(product.name)
  const offerDimensions = dimensionsFromText(offer.productTitle)
  const dimensionMatch = productDimensions.find((dimension) => offerDimensions.includes(dimension))
  if (dimensionMatch) { score += 20; evidence.dimensions = { value: dimensionMatch, match: true } }
  else if (productDimensions.length > 0 && offerDimensions.length > 0) { score -= 20; evidence.dimensions = { product: productDimensions, offer: offerDimensions, conflict: true } }

  const productModels = modelTokens(product.name)
  const offerModels = modelTokens(offer.productTitle)
  const modelMatch = [...productModels].find((model) => offerModels.has(model))
  if (modelMatch) { score += 15; evidence.model = { value: modelMatch, match: true } }

  const productUnit = normalizeText(product.packagingUnit)
  const offerUnit = normalizeText(offer.packagingUnit)
  if (productUnit && offerUnit) {
    if (productUnit === offerUnit) { score += 5; evidence.packagingUnit = { value: product.packagingUnit, match: true } }
    else { score -= 8; evidence.packagingUnit = { product: product.packagingUnit, offer: offer.packagingUnit, conflict: true } }
  }
  if (product.packagingQty && offer.packagingQty) {
    if (product.packagingQty === offer.packagingQty) { score += 5; evidence.packagingQty = { value: product.packagingQty, match: true } }
    else { score -= 10; evidence.packagingQty = { product: product.packagingQty, offer: offer.packagingQty, conflict: true } }
  }

  const productNumbers = numberTokens(product.name)
  const offerNumbers = numberTokens(offer.productTitle)
  const productOnlyNumbers = [...productNumbers].filter((number) => !offerNumbers.has(number))
  const offerOnlyNumbers = [...offerNumbers].filter((number) => !productNumbers.has(number))
  if (!dimensionMatch && productOnlyNumbers.length > 0 && offerOnlyNumbers.length > 0) {
    const penalty = Math.min(15, Math.min(productOnlyNumbers.length, offerOnlyNumbers.length) * 5)
    score -= penalty
    evidence.numericConflict = { productOnlyNumbers, offerOnlyNumbers, penalty }
  }

  score = Math.max(0, Math.min(score, 100))
  const status = score >= 95 ? 'CERTAIN' : score >= 80 ? 'REVIEW' : 'UNRELIABLE'
  return { score, evidence, status }
}
