import { FeedSourceType, FeedSyncStatus, Prisma } from '@/generated/prisma/client'
import { extractOfferSnapshot } from '@/lib/price-monitoring'
import { safeRemoteFetch } from '@/lib/safe-remote-url'
import { detectVatInclusion } from '@/lib/vat-detection'
import { prisma } from '@/lib/prisma'

export const ownProductSourceKey = (productId: string, countryId: string) => `own-url:${productId}:${countryId}`

export function ownProductSyncConfig(value: unknown): { productId: string; countryId: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.kind !== 'OWN_PRODUCT_URL' || typeof input.productId !== 'string' || typeof input.countryId !== 'string') return null
  return { productId: input.productId, countryId: input.countryId }
}

const normalizeSku = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase()
const normalizeGtin = (value: string) => value.replace(/\D/g, '')

async function readHtml(response: Response) {
  if (!response.ok) throw new Error(`Productpagina reageerde met HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('De URL verwijst niet naar een HTML productpagina.')
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > 4 * 1024 * 1024) throw new Error('De productpagina is te groot om veilig te analyseren.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('De productpagina is leeg.')
  let bytes = 0
  let html = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 4 * 1024 * 1024) throw new Error('De productpagina is te groot om veilig te analyseren.')
      html += decoder.decode(value, { stream: true })
    }
    return html + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

// Safe opt-in syncing of the company's own product page. Unlike a tabular feed,
// it only updates a market price after the product identity, VAT and currency agree.
export async function syncOwnProductUrlSource(feedSourceId: string) {
  const source = await prisma.feedSource.findUnique({
    where: { id: feedSourceId },
    select: { id: true, companyId: true, url: true, sourceKey: true, sourceType: true,
      countryCode: true, config: true, isActive: true, lastRunStatus: true },
  })
  if (!source || source.sourceType !== FeedSourceType.API || !source.sourceKey.startsWith('own-url:') ||
      !source.isActive || source.lastRunStatus !== FeedSyncStatus.RUNNING) throw new Error('Eigen productbron is niet actief of niet geclaimd.')
  try {
    const config = ownProductSyncConfig(source.config)
    if (!config || source.sourceKey !== ownProductSourceKey(config.productId, config.countryId) || !source.url) {
      throw new Error('Deze productbron heeft geen geldige koppeling.')
    }
    const market = await prisma.productMarket.findFirst({
      where: { companyId: source.companyId, productId: config.productId, countryId: config.countryId,
        isActive: true, country: { isActive: true }, product: { isActive: true },
        company: { status: 'ACTIVE' } },
      include: { product: { select: { articleNumber: true, ean: true, gtin: true, name: true } },
        country: { select: { code: true } } },
    })
    const licensed = await prisma.companyCountry.findFirst({
      where: { companyId: source.companyId, countryId: config.countryId, isActive: true },
      select: { countryId: true },
    })
    if (!market || !licensed || !market.ownUrl || market.ownUrl.trim() !== source.url.trim() ||
        market.country.code !== source.countryCode) {
      throw new Error('De product URL of markt is gewijzigd. Open het product om de bron opnieuw te koppelen.')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    let html: string
    try {
      const response = await safeRemoteFetch(source.url, {
        signal: controller.signal, cache: 'no-store',
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'PrysightOwnProductSync/1.0' },
      })
      html = await readHtml(response)
    } finally {
      clearTimeout(timer)
    }
    const offer = extractOfferSnapshot(html, { sku: market.product.articleNumber,
      ean: market.product.ean ?? market.product.gtin, productName: market.product.name,
      countryCode: market.country.code })
    const ownSku = normalizeSku(market.product.articleNumber)
    const ownEan = normalizeGtin(market.product.ean ?? market.product.gtin ?? '')
    const detectedSku = offer.sku ? normalizeSku(offer.sku) : ''
    const detectedEan = offer.ean ? normalizeGtin(offer.ean) : ''
    const skuMatch = Boolean(ownSku && detectedSku && ownSku === detectedSku)
    const eanMatch = Boolean(ownEan && detectedEan && ownEan === detectedEan)
    if ((!skuMatch && !eanMatch) || (detectedSku && !skuMatch) || (detectedEan && ownEan && !eanMatch)) {
      throw new Error('Productidentiteit komt niet betrouwbaar overeen met de bron. De eigen prijs is niet aangepast.')
    }
    if (!offer.price || !Number.isFinite(offer.price) || offer.price <= 0) throw new Error('Geen betrouwbare verkoopprijs gevonden.')
    const currency = offer.currency?.toUpperCase()
    if (!currency || currency !== market.currency.toUpperCase()) throw new Error('Valuta ontbreekt of wijkt af. De eigen prijs is niet aangepast.')
    const vat = detectVatInclusion(html, offer.price)
    if (vat.vatIncluded === null || vat.confidence !== 'HIGH') {
      throw new Error('Btw status kon niet met voldoende zekerheid worden vastgesteld. De eigen prijs is niet aangepast.')
    }
    const now = new Date()
    await prisma.$transaction(async tx => {
      const updated = await tx.productMarket.updateMany({
        where: { id: market.id, companyId: source.companyId, updatedAt: market.updatedAt, ownUrl: source.url },
        data: { ownPrice: new Prisma.Decimal(offer.price!), vatIncluded: vat.vatIncluded,
          stockStatus: offer.stockStatus ?? market.stockStatus },
      })
      if (updated.count !== 1) throw new Error('De productgegevens zijn tussentijds gewijzigd. Synchroniseer opnieuw.')
      if (market.ownPrice === null || Math.abs(Number(market.ownPrice) - offer.price!) > 0.005) {
        await tx.ownPriceHistory.create({ data: {
          companyId: source.companyId, productId: market.productId, countryId: market.countryId,
          recordedAt: now, price: new Prisma.Decimal(offer.price!), currency: market.currency,
        } })
      }
      await tx.feedSource.updateMany({
        where: { id: source.id, companyId: source.companyId, lastRunStatus: FeedSyncStatus.RUNNING },
        data: { lastRunAt: now, lastRunStatus: FeedSyncStatus.COMPLETED,
          lastItemCount: 1, lastErrorCount: 0, syncError: null },
      })
    })
    return { feedSourceId: source.id, productId: market.productId, price: offer.price }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Productgegevens konden niet worden opgehaald.'
    await prisma.feedSource.updateMany({
      where: { id: source.id, companyId: source.companyId, lastRunStatus: FeedSyncStatus.RUNNING },
      data: { lastRunAt: new Date(), lastRunStatus: FeedSyncStatus.FAILED,
        lastErrorCount: 1, syncError: message },
    })
    throw error
  }
}
