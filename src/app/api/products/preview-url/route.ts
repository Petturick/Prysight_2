export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { extractOfferSnapshot } from '@/lib/price-monitoring'
import { safeRemoteFetch } from '@/lib/safe-remote-url'
import { scrapeSerperProductPage } from '@/lib/serper-scrape'
import { detectVatInclusion } from '@/lib/vat-detection'
import { findExistingProduct } from '@/lib/product-duplicate'
import { validGtin } from '@/lib/gtin'
import { lookupOwnFeedByEan } from '@/lib/feed-ean-lookup'
import { mergeVerifiedProductSources, type VerifiedSource } from '@/lib/product-recognition-merge'
import { prisma } from '@/lib/prisma'

const MAX_HTML_BYTES = 4 * 1024 * 1024
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'

type JsonRecord = Record<string, unknown>

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

function structuredProductDetails(html: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const script of scripts) {
    const raw = script[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw.replace(/<!--|-->/g, ''))
      const product = walkJson(parsed).find((record) =>
        typeNames(record['@type']).some((item) => item.toLowerCase() === 'product'),
      )
      if (!product) continue
      const brandValue = product.brand
      const brand = typeof brandValue === 'string'
        ? brandValue.trim()
        : brandValue && typeof brandValue === 'object'
          ? text((brandValue as JsonRecord).name)
          : null
      const imageValue = product.image
      const image = typeof imageValue === 'string'
        ? imageValue
        : Array.isArray(imageValue)
          ? text(imageValue[0])
          : imageValue && typeof imageValue === 'object'
            ? text((imageValue as JsonRecord).url)
            : null
      return {
        brand,
        category: text(product.category),
        image,
        model: text(product.model),
        mpn: text(product.mpn),
        name: text(product.name),
        sku: text(product.sku),
        ean: text(product.gtin13) ?? text(product.gtin14) ?? text(product.gtin) ?? text(product.ean),
        description: text(product.description),
      }
    } catch {
      continue
    }
  }
  return { brand: null, category: null, image: null, model: null, mpn: null,
    name: null, sku: null, ean: null, description: null }
}

function parseLocalizedPrice(value: string | null | undefined) {
  if (!value) return null
  const cleaned = value.replace(/\u00a0/g, ' ').replace(/[^0-9,.-]/g, '').trim()
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '')
  else normalized = cleaned.replace(',', '.')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 10_000_000 ? numeric : null
}

function cleanSerperTitle(value: string | null) {
  if (!value) return null
  return value
    .replace(/\s+[|–—-]\s+(?:Engels(?:\s+Logistiek)?|Prysight).*$/i, '')
    .trim()
    .slice(0, 240) || null
}

function recognizeFromSerper(page: { text: string; title: string | null }) {
  const compact = page.text.replace(/\s+/g, ' ').slice(0, 80_000)
  const title = cleanSerperTitle(page.title)
  const sku = compact.match(/(?:artikelnummer|artikel nr\.?|art\.?\s*nr\.?|sku|productcode)\s*[:#]?\s*([A-Z0-9][A-Z0-9._\/-]{2,50})/i)?.[1] ?? null
  const ean = compact.match(/(?:ean|gtin(?:13|14)?)\s*[:#]?\s*([0-9]{8,14})/i)?.[1] ?? null
  const labelledPrice = compact.match(/(?:prijs|vanaf|nu)\s*[:]?\s*(?:€|EUR)\s*([0-9][0-9.,\s]{0,14})/i)?.[1]
    ?? compact.match(/(?:€|EUR)\s*([0-9][0-9.,\s]{0,14})\s*(?:incl\.?|excl\.?|per\b|$)/i)?.[1]
  const price = parseLocalizedPrice(labelledPrice)
  const currency = price ? 'EUR' : /£/.test(compact) ? 'GBP' : null
  const stockStatus = /niet op voorraad|out of stock|sold out/i.test(compact)
    ? 'Niet op voorraad'
    : /op voorraad|in stock|available/i.test(compact)
      ? 'Op voorraad'
      : null
  const vat = detectVatInclusion(compact, price)
  return {
    url: null as string | null,
    name: title,
    articleNumber: sku,
    ean,
    ownPrice: price,
    currency,
    stockStatus,
    packagingQty: null as number | null,
    extractionMethod: 'SERPER',
    vatIncluded: vat.vatIncluded,
    vatConfidence: vat.confidence,
    vatEvidence: vat.evidence,
    brand: null as string | null,
    productGroup: null as string | null,
    model: null as string | null,
    mpn: null as string | null,
  }
}

async function readLimitedHtml(response: Response) {
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_HTML_BYTES) throw new Error('De productpagina is te groot om veilig te analyseren.')

  if (!response.body) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_HTML_BYTES) throw new Error('De productpagina is te groot om veilig te analyseren.')
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let html = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_HTML_BYTES) {
      await reader.cancel()
      throw new Error('De productpagina is te groot om veilig te analyseren.')
    }
    html += decoder.decode(value, { stream: true })
  }
  html += decoder.decode()
  return html
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('products.write')
    const body = await request.json() as { url?: unknown; countryCode?: unknown }
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
    if (!rawUrl) return NextResponse.json({ error: 'Vul eerst een product URL in.' }, { status: 400 })

    const shops = await prisma.webshop.findMany({
      where: { companyId: actor.companyId, competitorId: null, isActive: true },
      select: { url: true }, take: 40,
    })
    const ownHosts = shops.flatMap((shop) => {
      try { return [new URL(shop.url).hostname.toLowerCase().replace(/^www\./, '')] } catch { return [] }
    })
    const trustedOwnUrl = (value: string) => {
      try {
        const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
        return ownHosts.some((own) => host === own || host.endsWith('.' + own))
      } catch { return false }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    try {
      let response: Response | null = null
      let directError: unknown = null
      try {
        response = await safeRemoteFetch(rawUrl, {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.7',
          },
        })
      } catch (error) {
        directError = error
      }

      if (response?.ok) {
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
          let html = ''
          try { html = await readLimitedHtml(response) }
          catch (error) { console.warn('Direct URL extraction unavailable, trying fallback', error) }
          if (html.trim()) {
            const offer = extractOfferSnapshot(html)
            const details = structuredProductDetails(html)
            const vat = detectVatInclusion(html, offer.price)
            const resolvedUrl = response.url || rawUrl
            if (offer.productTitle || offer.sku || offer.ean || offer.price || details.name || details.sku || details.ean) {
              const extractedEan = offer.ean ?? details.ean
              const owned = trustedOwnUrl(resolvedUrl)
              const verifiedEan = extractedEan && validGtin(extractedEan) ? extractedEan : null
              const ownFeed = verifiedEan
                ? await lookupOwnFeedByEan(actor.companyId, verifiedEan, typeof body.countryCode === 'string' ? body.countryCode : 'GLOBAL').catch((error) => {
                    console.warn('Optional feed enrichment of product URL unavailable', error)
                    return null
                  })
                : null
              const pageProduct: VerifiedSource = {
                origin: owned ? 'OWN_SHOP' : 'ONLINE',
                product: {
                  name: offer.productTitle ?? details.name,
                  articleNumber: owned ? offer.sku ?? details.sku : null,
                  ean: extractedEan ?? '', brand: details.brand, model: details.model,
                  mpn: details.mpn, productGroup: details.category, packagingQty: offer.packagingQty,
                  stockStatus: owned ? offer.stockStatus : null,
                  ownPrice: owned ? offer.price : null,
                  currency: owned ? offer.currency?.toUpperCase() ?? null : null,
                  vatIncluded: owned ? vat.vatIncluded : null,
                  ownUrl: owned ? resolvedUrl : null, image: details.image,
                  description: details.description, sourceUrl: resolvedUrl,
                  sourceType: owned ? 'OWN_SHOP' : 'ONLINE',
                },
              }
              const sources: VerifiedSource[] = [
                ...(ownFeed ? [{ product: ownFeed, origin: 'OWN_FEED' as const }] : []),
                pageProduct,
              ]
              const merged = mergeVerifiedProductSources(sources, extractedEan ?? '')
              const existingProduct = await findExistingProduct({
                companyId: actor.companyId, articleNumber: merged.articleNumber,
                ean: verifiedEan, gtin: verifiedEan, ownUrl: owned ? resolvedUrl : null,
              })
              return NextResponse.json({
                ...merged, url: resolvedUrl,
                priceTrusted: owned || !!ownFeed,
                vatConfidence: owned ? vat.confidence : 'UNKNOWN',
                vatEvidence: owned ? vat.evidence : null,
                shippingCost: owned ? offer.shippingCost : null,
                shippingCurrency: owned ? offer.shippingCurrency : null,
                shippingLabel: owned ? offer.shippingLabel : null,
                shippingNeedsConfirmation: offer.shippingCost !== null,
                extractionMethod: offer.method, existingProduct,
                warnings: [
                  ...(!owned && !ownFeed ? ['Deze URL hoort niet bij een ingestelde eigen webshop. De gevonden prijs is niet als jouw verkoopprijs gebruikt.'] : []),
                  ...(merged.conflicts.length ? ['Bronnen spreken elkaar tegen over: ' + merged.conflicts.join(', ') + '.'] : []),
                ],
              })
            }
          }
        }
      }

      const scraped = await scrapeSerperProductPage(rawUrl)
      if (scraped) {
        const recognized = recognizeFromSerper(scraped)
        const resolvedUrl = response?.url || rawUrl
        const existingProduct = await findExistingProduct({
          companyId: actor.companyId,
          articleNumber: recognized.articleNumber,
          ean: recognized.ean,
          gtin: recognized.ean,
          ownUrl: trustedOwnUrl(resolvedUrl) ? resolvedUrl : null,
        })
        if (recognized.name || recognized.articleNumber || recognized.ean || recognized.ownPrice) {
          return NextResponse.json({
            ...recognized,
            articleNumber: trustedOwnUrl(resolvedUrl) ? recognized.articleNumber : null,
            ownPrice: trustedOwnUrl(resolvedUrl) ? recognized.ownPrice : null,
            currency: trustedOwnUrl(resolvedUrl) ? recognized.currency : null,
            vatIncluded: trustedOwnUrl(resolvedUrl) ? recognized.vatIncluded : null,
            priceTrusted: trustedOwnUrl(resolvedUrl),
            warnings: trustedOwnUrl(resolvedUrl) ? [] : ['Deze URL hoort niet bij een ingestelde eigen webshop. De prijs wordt niet overgenomen.'],
            url: resolvedUrl,
            image: null,
            description: null,
            shippingCost: null,
            shippingCurrency: null,
            shippingLabel: null,
            existingProduct,
          })
        }
      }

      console.warn('Product URL recognition returned no usable data', {
        url: rawUrl,
        status: response?.status ?? null,
        error: directError instanceof Error ? directError.message : null,
      })
      return NextResponse.json({
        url: response?.url || rawUrl,
        name: null,
        articleNumber: null,
        ean: null,
        ownPrice: null,
        currency: null,
        stockStatus: null,
        packagingQty: null,
        extractionMethod: null,
        vatIncluded: null,
        vatConfidence: 'UNKNOWN',
        vatEvidence: null,
        brand: null,
        productGroup: null,
        model: null,
        mpn: null,
        image: null,
        description: null,
        shippingCost: null,
        shippingCurrency: null,
        shippingLabel: null,
        existingProduct: null,
        partial: true,
        reason: response?.status === 403 || response?.status === 429
          ? 'Deze webshop beperkt automatisch uitlezen. Gebruik de productfeed of zoek op EAN.'
          : 'Er zijn geen betrouwbare productgegevens uit deze URL opgehaald. Controleer de URL of gebruik de productfeed of EAN.',
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'De productpagina kon niet worden geanalyseerd.'
    const normalized = message.toLowerCase()
    if (normalized.includes('abort')) return NextResponse.json({ error: 'De productpagina reageerde niet op tijd.' }, { status: 408 })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
