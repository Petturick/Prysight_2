export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { extractOfferSnapshot } from '@/lib/price-monitoring'
import { safeRemoteFetch } from '@/lib/safe-remote-url'
import { detectVatInclusion } from '@/lib/vat-detection'
import { findExistingProduct } from '@/lib/product-duplicate'

const MAX_HTML_BYTES = 4 * 1024 * 1024

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
      }
    } catch {
      continue
    }
  }
  return { brand: null, category: null, image: null, model: null, mpn: null }
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
    const body = await request.json() as { url?: unknown }
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
    if (!rawUrl) return NextResponse.json({ error: 'Vul eerst een product URL in.' }, { status: 400 })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    try {
      const response = await safeRemoteFetch(rawUrl, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'User-Agent': 'PrysightProductOnboarding/1.0 (+product import)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.7',
        },
      })

      if (!response.ok) return NextResponse.json({ error: `De productpagina gaf HTTP ${response.status} terug.` }, { status: 422 })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        return NextResponse.json({ error: 'Deze URL is geen leesbare productpagina.' }, { status: 422 })
      }

      const html = await readLimitedHtml(response)
      if (!html.trim()) return NextResponse.json({ error: 'De productpagina bevat geen leesbare inhoud.' }, { status: 422 })

      const offer = extractOfferSnapshot(html)
      const details = structuredProductDetails(html)
      const vat = detectVatInclusion(html, offer.price)
      const resolvedUrl = response.url || rawUrl
      const existingProduct = await findExistingProduct({
        companyId: actor.companyId,
        articleNumber: offer.sku,
        ean: offer.ean,
        gtin: offer.ean,
        ownUrl: resolvedUrl,
      })
      if (!offer.productTitle && !offer.sku && !offer.ean && !offer.price) {
        return NextResponse.json({
          error: 'Prysight kon nog geen productgegevens herkennen. Vul de ontbrekende velden handmatig in.',
          partial: true,
          url: resolvedUrl,
        }, { status: 422 })
      }

      return NextResponse.json({
        url: response.url || rawUrl,
        name: offer.productTitle,
        articleNumber: offer.sku,
        ean: offer.ean,
        ownPrice: offer.price,
        currency: offer.currency?.toUpperCase() ?? null,
        stockStatus: offer.stockStatus,
        packagingQty: offer.packagingQty,
        extractionMethod: offer.method,
        vatIncluded: vat.vatIncluded,
        vatConfidence: vat.confidence,
        vatEvidence: vat.evidence,
        brand: details.brand,
        productGroup: details.category,
        model: details.model,
        mpn: details.mpn,
        image: details.image,
        existingProduct,
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
