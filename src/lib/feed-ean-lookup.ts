import { normalizeGtin } from '@/lib/gtin'
import { prisma } from '@/lib/prisma'
import type { OnlineProduct } from '@/lib/online-ean-product'

type Row = Record<string, unknown>
const asRow = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const str = (value: unknown): string | null =>
  (typeof value === 'string' || typeof value === 'number') && String(value).trim()
    ? String(value).trim().slice(0, 1000) : null
const price = (value: unknown): number | null => {
  const raw = str(value)?.replace(/[^0-9,.-]/g, '') ?? ''
  if (!raw) return null
  const comma = raw.lastIndexOf(',')
  const dot = raw.lastIndexOf('.')
  const normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null
}
const vat = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'ja', 'incl', 'incl. btw', 'incl btw'].includes(normalized)) return true
  if (['false', '0', 'no', 'nee', 'excl', 'excl. btw', 'excl btw'].includes(normalized)) return false
  return null
}
const validUrl = (value: unknown) => {
  try {
    const url = new URL(str(value) ?? '')
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch { return null }
}

/**
 * Only tenant-owned, active main product feeds and exact GTIN matches are eligible.
 * Never assume a feed price includes VAT when the feed did not specify its tax basis.
 */
export async function lookupOwnFeedByEan(companyId: string, ean: string, countryCode: string): Promise<OnlineProduct | null> {
  const normalized = normalizeGtin(ean)
  if (!normalized) return null
  const market = countryCode.toUpperCase() === 'UK' ? 'GB' : countryCode.toUpperCase()
  const items = await prisma.feedItem.findMany({
    where: {
      companyId,
      status: 'IMPORTED',
      feedSource: {
        companyId, isActive: true, isMainFeed: true,
        sourceKey: { not: 'manual:prysight' },
        countryCode: { in: ['GLOBAL', market, ...(market === 'GB' ? ['UK'] : [])] },
      },
      OR: [
        { mappedData: { path: ['ean'], equals: normalized } },
        { mappedData: { path: ['gtin'], equals: normalized } },
      ],
    },
    include: { feedSource: { select: { name: true, url: true, countryCode: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 12,
  })
  const matching = items.filter((item) => {
    const data = asRow(item.mappedData)
    const itemCountry = str(data.countryCode)?.toUpperCase()
    return (!itemCountry || itemCountry === market || itemCountry === 'GLOBAL')
      && [data.ean, data.gtin].some((value) => normalizeGtin(str(value)) === normalized)
  })
  const item = matching.find((entry) => entry.feedSource.countryCode.toUpperCase() === market) ?? matching[0]
  if (!item) return null
  const data = asRow(item.mappedData)
  const ownPrice = price(data.ownPrice)
  const ownUrl = validUrl(data.ownUrl)
  return {
    ean: normalized,
    name: str(data.name),
    articleNumber: str(data.articleNumber),
    brand: str(data.brand),
    model: str(data.model),
    mpn: str(data.mpn),
    productGroup: str(data.productGroup),
    packagingQty: Number.isInteger(Number(data.packagingQty)) && Number(data.packagingQty) > 0
      ? Number(data.packagingQty) : null,
    stockStatus: str(data.stockStatus),
    ownPrice,
    currency: ownPrice === null ? null : str(data.currency)?.toUpperCase() ?? null,
    vatIncluded: ownPrice === null ? null : vat(data.vatIncluded),
    ownUrl,
    image: validUrl(data.image) ?? validUrl(data.imageUrl),
    description: str(data.description),
    sourceUrl: ownUrl ?? validUrl(item.feedSource.url) ?? '',
    sourceType: 'OWN_SHOP',
  }
}
