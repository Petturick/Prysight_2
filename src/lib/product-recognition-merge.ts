import type { OnlineProduct } from '@/lib/online-ean-product'

type Key = 'name' | 'brand' | 'model' | 'mpn' | 'productGroup' | 'packagingQty' | 'image' | 'description'
const descriptive: Key[] = ['name', 'brand', 'model', 'mpn', 'productGroup', 'packagingQty', 'image', 'description']
const hasValue = (value: unknown) => value !== null && value !== undefined && value !== ''
export type VerifiedSource = { product: OnlineProduct; origin: 'OWN_FEED' | 'OWN_SHOP' | 'ONLINE' }

/** One field resolution policy for EAN and URL discovery.
 * The exact matching own feed takes precedence, then verified own-shop content,
 * then verified external pages. Own identity and sale prices never come from competitors.
 */
export function mergeVerifiedProductSources(sources: VerifiedSource[], ean: string) {
  const ranked = [...sources].sort((a, b) =>
    ['OWN_FEED', 'OWN_SHOP', 'ONLINE'].indexOf(a.origin) - ['OWN_FEED', 'OWN_SHOP', 'ONLINE'].indexOf(b.origin),
  )
  const own = ranked.find((entry) => entry.origin === 'OWN_FEED' || entry.origin === 'OWN_SHOP')
  const first = <K extends Key>(key: K): OnlineProduct[K] | null => {
    for (const entry of ranked) if (hasValue(entry.product[key])) return entry.product[key]
    return null
  }
  const fieldSources: Record<string, string> = {}
  const conflicts: string[] = []
  for (const key of descriptive) {
    const populated = ranked.filter((entry) => hasValue(entry.product[key]))
    if (populated.length) fieldSources[key] = populated[0].origin
    const unique = new Set(populated.map((entry) => String(entry.product[key]).trim().toLocaleLowerCase()))
    if (unique.size > 1 && key !== 'description' && key !== 'image') conflicts.push(key)
  }
  const ownPriceSource = ranked.find((entry) =>
    (entry.origin === 'OWN_FEED' || entry.origin === 'OWN_SHOP') && entry.product.ownPrice !== null)
  const ownPrice = ownPriceSource?.product.ownPrice ?? null
  if (ownPriceSource) {
    fieldSources.ownPrice = ownPriceSource.origin
    fieldSources.currency = ownPriceSource.origin
    fieldSources.vatIncluded = ownPriceSource.origin
  }
  if (own) {
    fieldSources.articleNumber = own.origin
    fieldSources.ownUrl = own.origin
  }
  return {
    found: ranked.length > 0,
    ean, name: first('name'),
    articleNumber: own?.product.articleNumber ?? null,
    brand: first('brand'), model: first('model'), mpn: first('mpn'),
    productGroup: first('productGroup'), packagingQty: first('packagingQty'),
    image: first('image'), description: first('description'),
    ownPrice, currency: ownPriceSource?.product.currency ?? null,
    vatIncluded: ownPriceSource?.product.vatIncluded ?? null,
    stockStatus: own?.product.stockStatus ?? null,
    ownUrl: own?.product.ownUrl ?? null,
    source: ranked[0]?.origin ?? null,
    feedMatched: ranked.some((entry) => entry.origin === 'OWN_FEED'),
    sources: ranked.filter((entry) => entry.product.sourceUrl).map((entry) => ({
      url: entry.product.sourceUrl, type: entry.product.sourceType, origin: entry.origin,
    })),
    fieldSources, conflicts,
  }
}
