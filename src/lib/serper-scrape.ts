import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'
import { normalizeGtin, validGtin } from '@/lib/gtin'

export type SerperScrapePage = { text: string; title: string | null }
export type SerperVerifiedOffer = { price: number; currency: 'EUR' | 'GBP'; ean: string; productTitle: string; vatIncluded: boolean }

/** Serper scrape is a paid fallback, never a substitute for checking robots.txt. */
export async function scrapeSerperProductPage(targetUrl: string): Promise<SerperScrapePage | null> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key || process.env.SERPER_SCRAPE_ENABLED !== 'true') return null
  const safeUrl = (await assertSafeRemoteHttpUrl(targetUrl)).toString()
  try {
    const response = await fetch('https://scrape.serper.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ url: safeUrl }),
      signal: AbortSignal.timeout(9000),
      cache: 'no-store',
    })
    if (!response.ok) {
      console.warn('Serper page extraction unavailable', { status: response.status })
      return null
    }
    const data = await response.json() as { text?: unknown; metadata?: { title?: unknown } }
    const content = typeof data.text === 'string' ? data.text.slice(0, 80_000) : ''
    if (!content.trim()) return null
    return { text: content, title: typeof data.metadata?.title === 'string' ? data.metadata.title.slice(0, 240) : null }
  } catch {
    return null
  }
}

function productTitleMatches(title: string, name: string): boolean {
  const words = name.toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ').split(' ').filter((word) => word.length >= 4)
  if (!words.length) return false
  const headline = title.toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ')
  const hits = words.filter((word) => headline.includes(word)).length
  return hits >= Math.min(2, words.length) && hits / words.length >= 0.5
}

function parseMoney(raw: string): number | null {
  const trimmed = raw.replace(/\s/g, '')
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  const price = Number(normalized)
  return Number.isFinite(price) && price > 0 && price <= 100_000 ? price : null
}

/** Never turn a generic scraped currency amount into a price. Require exact GTIN, matching page title, one distinct prominent amount and explicit VAT. */
export function verifiedSerperOffer(page: SerperScrapePage, expectedGtin: string, productName: string): SerperVerifiedOffer | null {
  const ean = normalizeGtin(expectedGtin)
  if (!validGtin(ean) || !page.title || !productTitleMatches(page.title, productName)) return null
  const index = page.text.indexOf(ean)
  if (index < 0 || index > 6_000 || (index > 0 && /\d/.test(page.text[index - 1])) || /\d/.test(page.text[index + ean.length] ?? '')) return null
  const leading = page.text.slice(0, 1_800)
  const eur = [...leading.matchAll(/(?:€\s*(\d{1,5}(?:[. ]\d{3})*(?:[.,]\d{2})?)|(\d{1,5}(?:[. ]\d{3})*(?:[.,]\d{2})?)\s*€)/g)]
  const gbp = [...leading.matchAll(/(?:£\s*(\d{1,5}(?:[,.]\d{2})?)|(\d{1,5}(?:[,.]\d{2})?)\s*£)/g)]
  if (eur.length && gbp.length) return null
  const currency = eur.length ? 'EUR' : gbp.length ? 'GBP' : null
  const matches = currency === 'EUR' ? eur : gbp
  const amounts = [...new Set(matches.map((match) => parseMoney(match[1] || match[2])).filter((value): value is number => value !== null))]
  if (!currency || amounts.length !== 1) return null
  const vatText = leading.toLowerCase()
  const inclusive = /(?:incl\.?|inclusief|including|inc\.?)\s*(?:de\s*)?(?:btw|vat|tax)/i.test(vatText)
  const exclusive = /(?:excl\.?|exclusief|excluding|ex\.?)\s*(?:de\s*)?(?:btw|vat|tax)/i.test(vatText)
  if (inclusive === exclusive) return null
  return { price: amounts[0], currency, ean, productTitle: page.title, vatIncluded: inclusive }
}
