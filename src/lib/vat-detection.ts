export type VatDetection = {
  vatIncluded: boolean | null
  confidence: 'HIGH' | 'MEDIUM' | 'UNKNOWN'
  evidence: string | null
}

const INCLUDED_PATTERNS = [
  /\bincl\.?\s*(?:btw|vat)\b/i,
  /\binclusief\s+btw\b/i,
  /\bincluding\s+vat\b/i,
  /\bvat\s+included\b/i,
  /\binclusive\s+of\s+vat\b/i,
  /\binkl\.?\s*mwst\b/i,
  /\binklusive\s+mehrwertsteuer\b/i,
  /\bttc\b/i,
  /\btva\s+comprise\b/i,
]

const EXCLUDED_PATTERNS = [
  /\bexcl\.?\s*(?:btw|vat)\b/i,
  /\bexclusief\s+btw\b/i,
  /\bexcluding\s+vat\b/i,
  /\bvat\s+excluded\b/i,
  /\bexclusive\s+of\s+vat\b/i,
  /\bex\.?\s*vat\b/i,
  /\bex\.?\s*btw\b/i,
  /\bzzgl\.?\s*mwst\b/i,
  /\bht\b/i,
  /\bhors\s+taxe\b/i,
  /\bhors\s+tva\b/i,
]

function plainText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstEvidence(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[0]) return match[0]
  }
  return null
}

function priceVariants(price: number | null | undefined) {
  if (!price || !Number.isFinite(price)) return []
  const fixed = price.toFixed(2)
  const trimmed = String(price)
  return [...new Set([
    fixed,
    fixed.replace('.', ','),
    trimmed,
    trimmed.replace('.', ','),
  ])].filter((value) => value.length >= 2)
}

function contextsAroundPrice(text: string, price: number | null | undefined) {
  const contexts: string[] = []
  for (const variant of priceVariants(price)) {
    let startAt = 0
    while (true) {
      const index = text.indexOf(variant, startAt)
      if (index < 0) break
      contexts.push(text.slice(Math.max(0, index - 140), Math.min(text.length, index + variant.length + 140)))
      startAt = index + variant.length
      if (contexts.length >= 12) return contexts
    }
  }
  return contexts
}

export function detectVatInclusion(html: string, extractedPrice?: number | null): VatDetection {
  const text = plainText(html)
  const priceContexts = contextsAroundPrice(text, extractedPrice)

  for (const context of priceContexts) {
    const excluded = firstEvidence(context, EXCLUDED_PATTERNS)
    const included = firstEvidence(context, INCLUDED_PATTERNS)
    if (excluded && !included) return { vatIncluded: false, confidence: 'HIGH', evidence: excluded }
    if (included && !excluded) return { vatIncluded: true, confidence: 'HIGH', evidence: included }
  }

  const excluded = firstEvidence(text, EXCLUDED_PATTERNS)
  const included = firstEvidence(text, INCLUDED_PATTERNS)
  if (excluded && !included) return { vatIncluded: false, confidence: 'MEDIUM', evidence: excluded }
  if (included && !excluded) return { vatIncluded: true, confidence: 'MEDIUM', evidence: included }

  return { vatIncluded: null, confidence: 'UNKNOWN', evidence: null }
}
