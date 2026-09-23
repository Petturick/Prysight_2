import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'
import { validGtin } from '@/lib/gtin'

export type IndexedProduct = {
  name: string | null
  articleNumber: string | null
  ean: string | null
  source: 'SEARCH_INDEX'
}

type OrganicResult = { title?: string; link?: string; snippet?: string }

function normalizedProductPath(value: string) {
  try {
    const url = new URL(value)
    return {
      host: url.hostname.toLowerCase().replace(/^www\./, ''),
      path: decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase() || '/',
    }
  } catch {
    return null
  }
}

/** Never substitute a similar search result for the product URL the user actually supplied. */
export function indexedProductForExactUrl(url: string, results: OrganicResult[]): IndexedProduct | null {
  const target = normalizedProductPath(url)
  if (!target) return null
  const exact = results.find((result) => {
    if (!result.link) return false
    const candidate = normalizedProductPath(result.link)
    return candidate?.host === target.host && candidate.path === target.path
  })
  if (!exact) return null
  const rawTitle = (exact.title ?? '').replace(/\s+/g, ' ').trim()
  const hostname = target.host.split('.')[0].replace(/[-_]/g, ' ')
  const name = rawTitle
    .split(/\s+[|–—]\s+/)[0]
    .replace(/\s+[-|–—]\s+(?:Engels(?:\s+Logistiek)?|Webshop|Online shop)\s*$/i, '')
    .trim()
  const cleanName = name.length >= 5 && name.toLowerCase() !== hostname ? name : null
  const snippet = exact.snippet ?? ''
  const skuMatch = snippet.match(/\b(?:artikelnummer|artikel\s*nr\.?|art\.?\s*nr\.?|sku|productcode)\s*[:#]?\s*([a-z0-9][a-z0-9._-]{3,60})\b/i)
  const gtinMatch = snippet.match(/\b(?:ean(?:-13)?|gtin(?:-13)?)\s*[:#]?\s*(\d{8}|\d{12}|\d{13}|\d{14})\b/i)
  return {
    name: cleanName,
    articleNumber: skuMatch?.[1] ?? null,
    ean: gtinMatch && validGtin(gtinMatch[1]) ? gtinMatch[1] : null,
    source: 'SEARCH_INDEX',
  }
}

/** Read only an existing, publicly indexed result. Does not re-request a page that blocked access. */
export async function findIndexedProduct(rawUrl: string): Promise<IndexedProduct | null> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key) return null
  const safeUrl = await assertSafeRemoteHttpUrl(rawUrl)
  const slug = decodeURIComponent(safeUrl.pathname.split('/').filter(Boolean).pop() ?? '')
    .replace(/\.[a-z\d]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 120)
  if (!slug) return null
  const host = safeUrl.hostname.replace(/^www\./, '')
  const queries = [
    `site:${host} "${safeUrl.pathname}"`,
    `site:${host} ${slug}`,
  ]
  for (const q of queries) {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q, num: 10 }),
        signal: AbortSignal.timeout(6500),
        cache: 'no-store',
      })
      if (!response.ok) continue
      const payload = await response.json() as { organic?: OrganicResult[] }
      const product = indexedProductForExactUrl(safeUrl.toString(), payload.organic ?? [])
      if (product && (product.name || product.articleNumber || product.ean)) return product
    } catch {
      // Indexed results are a best-effort fallback and must not break product creation.
    }
  }
  return null
}
