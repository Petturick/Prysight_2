import { safeRemoteFetch } from '@/lib/safe-remote-url'
import { scrapeSerperProductPage } from '@/lib/serper-scrape'
import { normalizeGtin } from '@/lib/gtin'
import { detectVatInclusion } from '@/lib/vat-detection'

type Item = Record<string, unknown>
export type OnlineProduct = {
  name: string | null; articleNumber: string | null; ean: string; brand: string | null
  model: string | null; mpn: string | null; productGroup: string | null
  packagingQty: number | null; stockStatus: string | null; ownPrice: number | null
  currency: string | null; vatIncluded: boolean | null; ownUrl: string | null
  image: string | null; description: string | null; sourceUrl: string
  sourceType: 'OWN_SHOP' | 'ONLINE'
}
function record(value: unknown): Item | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Item : null
}
function txt(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().slice(0, 500) || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
function findProducts(value: unknown, depth = 0): Item[] {
  if (!value || typeof value !== 'object' || depth > 5) return []
  if (Array.isArray(value)) return value.flatMap((part) => findProducts(part, depth + 1))
  const item = value as Item
  const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
  const found = types.some((type) => typeof type === 'string' && /(?:^|\/)Product$/i.test(type)) ? [item] : []
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'product']) {
    if (item[key]) found.push(...findProducts(item[key], depth + 1))
  }
  return found
}
function gtins(item: Item): string[] {
  return ['gtin', 'gtin13', 'gtin14', 'gtin12', 'gtin8', 'ean']
    .map((key) => normalizeGtin(txt(item[key]))).filter(Boolean)
}
function cleanTitle(value: string | null): string | null {
  const name = value?.replace(/\s+[|–—]\s+.*$/, '').replace(/\s+/g, ' ').trim() ?? ''
  return name.length >= 7 && /[a-zà-ÿ]{3,}/i.test(name) ? name.slice(0, 240) : null
}
function field(value: string, keys: string): string | null {
  const match = value.match(new RegExp('(?:^|[\\n\\r|;])\\s*(?:' + keys + ')\\s*[:#=]\\s*([^\\n\\r|;]{1,100})', 'im'))
  return txt(match?.[1])
}
function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const s = String(value).trim().replace(/[^0-9.,]/g, '')
  const n = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s)
  return Number.isFinite(n) && n > 0 && n < 10000000 ? n : null
}
function availability(value: unknown): string | null {
  const s = txt(value)?.toLowerCase() ?? ''
  if (s.includes('outofstock') || s.includes('out_of_stock')) return 'Niet op voorraad'
  if (s.includes('instock') || s.includes('in_stock')) return 'Op voorraad'
  return s.includes('preorder') ? 'Pre-order' : null
}
function qty(item: Item): number | null {
  const offer = record(item.offers) ?? (Array.isArray(item.offers) ? record(item.offers[0]) : null)
  const size = record(offer?.eligibleQuantity)?.value
  if (typeof size === 'number' && Number.isInteger(size) && size > 0 && size < 10000) return size
  const match = [txt(item.name), txt(item.description)].join(' ')
    .match(/(?:verpakking\s+van|pack\s+of|per)\s+(\d{1,4})\s*(?:stuks?|pcs?|pieces?|units?)\b/i)
  return match ? Number(match[1]) : null
}
function image(value: unknown): string | null {
  const candidate = txt(typeof value === 'string' ? value : Array.isArray(value) ? value[0] : record(value)?.url)
  return candidate?.startsWith('https://') ? candidate : null
}
function matchesLabel(body: string, ean: string): boolean {
  return new RegExp('(?:ean|gtin(?:8|12|13|14)?|barcode|streepjescode)\\s*[:#=\\-]?\\s*' + ean + '(?!\\d)', 'i')
    .test(body.slice(0, 80000))
}

/** Only use a matching identifier from the actual source page, never an unverified search snippet. */
export function extractOnlineProduct(body: string, ean: string, url: string, ownShop: boolean, searchTitle?: string | null): OnlineProduct | null {
  const scripts = [...body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const products = scripts.flatMap((script) => {
    try { return findProducts(JSON.parse(script[1].replace(/<!--|-->/g, ''))) } catch { return [] }
  })
  const product = products.find((item) => gtins(item).includes(ean))
  const conflicting = products.some((item) => gtins(item).length && !gtins(item).includes(ean))
  if (product) {
    const offer = record(product.offers) ?? (Array.isArray(product.offers) ? record(product.offers[0]) : null)
    const price = ownShop ? amount(offer?.price) : null
    const brandValue = product.brand
    return {
      name: cleanTitle(txt(product.name)) ?? cleanTitle(searchTitle ?? null),
      articleNumber: ownShop ? txt(product.sku) : null, ean,
      brand: txt(brandValue) ?? txt(record(brandValue)?.name),
      model: txt(product.model), mpn: txt(product.mpn), productGroup: txt(product.category),
      packagingQty: qty(product), stockStatus: ownShop ? availability(offer?.availability) : null,
      ownPrice: price, currency: ownShop && price ? txt(offer?.priceCurrency)?.toUpperCase() ?? null : null,
      vatIncluded: ownShop && price ? detectVatInclusion(body, price).vatIncluded : null,
      ownUrl: ownShop ? url : null, image: image(product.image),
      description: txt(product.description), sourceUrl: url, sourceType: ownShop ? 'OWN_SHOP' : 'ONLINE',
    }
  }
  // A page listing multiple products cannot provide reliable fallback identity.
  if (conflicting || products.length > 1 || !matchesLabel(body, ean)) return null
  const text = body.replace(/<[^>]*>/g, '\n').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  const title = cleanTitle(searchTitle ?? null)
    ?? cleanTitle(field(text, 'productnaam|product name|naam|name'))
    ?? cleanTitle(body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null)
  const brand = field(text, 'merk|brand|manufacturer|fabrikant')
  const mpn = field(text, 'mpn|manufacturer part number|fabrikantnummer')
  const model = field(text, 'model|modelnummer|model number')
  if (!title && !brand && !mpn && !model) return null
  return {
    name: title, articleNumber: ownShop ? field(text, 'artikelnummer|artikel nr\\.?|sku|productcode') : null,
    ean, brand, mpn, model, productGroup: field(text, 'categorie|category|productgroep'),
    packagingQty: null, stockStatus: null, ownPrice: null, currency: null, vatIncluded: null,
    ownUrl: ownShop ? url : null, image: null, description: null,
    sourceUrl: url, sourceType: ownShop ? 'OWN_SHOP' : 'ONLINE',
  }
}

async function limitedHtml(response: Response): Promise<string | null> {
  if (Number(response.headers.get('content-length') ?? 0) > 1048576) return null
  if (!response.body) return (await response.text()).slice(0, 1048576)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  let bytes = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    bytes += next.value.byteLength
    if (bytes > 1048576) { await reader.cancel(); return null }
    html += decoder.decode(next.value, { stream: true })
  }
  return html + decoder.decode()
}

export async function lookupOnlineProduct(url: string, ean: string, ownShop: boolean): Promise<OnlineProduct | null> {
  try {
    const response = await safeRemoteFetch(url, {
      cache: 'no-store', signal: AbortSignal.timeout(5500),
      headers: { 'User-Agent': 'PrysightProductDiscovery/1.0', Accept: 'text/html,application/xhtml+xml' },
    })
    if (response.ok && /text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) {
      const html = await limitedHtml(response)
      if (html) {
        const found = extractOnlineProduct(html, ean, response.url || url, ownShop)
        if (found) return found
      }
    }
  } catch {}
  const scraped = await scrapeSerperProductPage(url)
  return scraped ? extractOnlineProduct(scraped.text, ean, url, ownShop, scraped.title) : null
}
