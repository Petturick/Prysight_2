import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { webSearch } from '@/lib/ean-competitor-discovery'
import { extractOfferSnapshot } from '@/lib/price-monitoring'
import { assessPriceQuality } from '@/lib/price-quality'
import { prisma } from '@/lib/prisma'
import { safeRemoteFetch } from '@/lib/safe-remote-url'
import { detectVatInclusion } from '@/lib/vat-detection'
import { priceSuggestionAmounts } from '@/lib/ean-price-suggestion-amounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Source = { id: string; matchId: string | null; kind: 'OWN' | 'COMPETITOR'; name: string; url: string; trusted: boolean }
type Suggestion = {
  id: string; matchId: string | null; kind: Source['kind']; name: string; url: string
  observedPrice: number | null; priceInclVat: number | null; priceExclVat: number | null
  shippingCost: number | null; shippingCurrency: string | null; deliveredPriceInclVat: number | null; shippingLabel: string | null
  vatIncluded: boolean | null; vatRate: number; currency: string; confidence: 'HIGH' | 'REVIEW' | 'UNAVAILABLE'
  method: string | null; reason: string; checkedAt: string
}

async function limitedHtml(response: Response) {
  const maxBytes = 1_200_000
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Geen leesbare productpagina.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new Error('Productpagina te groot om veilig te controleren.')
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const html = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
  if (!html.trim()) throw new Error('Lege productpagina.')
  return html
}

async function allowedByRobots(targetUrl: string, signal: AbortSignal) {
  const target = new URL(targetUrl)
  // Do not perform a price preview on a page that disallows the monitor.
  const robots = await safeRemoteFetch(new URL('/robots.txt', target.origin).toString(), {
    signal, cache: 'no-store', headers: { 'User-Agent': 'PrysightPriceMonitor/2.0' },
  })
  if (!robots.ok) return true
  const rules = (await robots.text()).split(/\r?\n/)
  let applies = false
  for (const raw of rules) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const index = line.indexOf(':')
    if (index < 0) continue
    const key = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    if (key === 'user-agent') applies = value === '*' || value.toLowerCase().includes('prysightpricemonitor')
    if (key === 'disallow' && applies && value && (value === '/' || target.pathname.startsWith(value))) return false
  }
  return true
}

async function previewSource(source: Source, product: { ean: string; articleNumber: string; name: string; ownPrice: number | null }, vatRate: number, defaultCurrency: string, countryCode: string): Promise<Suggestion> {
  const base = { id: source.id, matchId: source.matchId, kind: source.kind, name: source.name, url: source.url, observedPrice: null, priceInclVat: null, priceExclVat: null, shippingCost: null, shippingCurrency: null, deliveredPriceInclVat: null, shippingLabel: null, vatIncluded: null, vatRate, currency: defaultCurrency, confidence: 'UNAVAILABLE' as const, method: null, reason: '', checkedAt: new Date().toISOString() }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9_000)
  try {
    if (!(await allowedByRobots(source.url, controller.signal))) return { ...base, reason: 'Deze bron staat automatische prijscontrole niet toe.' }
    const response = await safeRemoteFetch(source.url, {
      signal: controller.signal, cache: 'no-store',
      headers: { 'User-Agent': 'PrysightPriceMonitor/2.0 (+price suggestions)', Accept: 'text/html,application/xhtml+xml' },
    })
    if (!response.ok) return { ...base, reason: `Bron gaf HTTP ${response.status}.` }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return { ...base, reason: 'Geen leesbare productpagina.' }
    const html = await limitedHtml(response)
    const extracted = extractOfferSnapshot(html, { ean: product.ean, productName: product.name, countryCode })
    if (extracted.price === null || extracted.price <= 0) return { ...base, reason: 'Geen betrouwbare prijs gevonden.' }
    // Exact contradictory EAN is a hard rejection even for manually linked sources.
    if (extracted.ean && extracted.ean.replace(/\D/g, '') !== product.ean.replace(/\D/g, '')) {
      return { ...base, reason: 'EAN op de bronpagina verschilt van dit product.' }
    }
    const quality = assessPriceQuality({
      extractedPrice: extracted.price,
      normalizedPrice: extracted.price,
      method: extracted.method === 'JSON_LD' || extracted.method === 'META' ? extracted.method : 'HTML_REGEX',
      extractedEan: extracted.ean,
      // Competitor SKUs differ from the Engels article number and are not used as an identity gate.
      extractedTitle: extracted.productTitle,
      productEan: product.ean,
      productName: product.name,
      ownPrice: product.ownPrice,
      trustedProductMapping: source.trusted,
    })
    if (!quality.accepted) return { ...base, reason: quality.reasons.join(' ') }
    const vat = detectVatInclusion(html, extracted.price)
    const amounts = priceSuggestionAmounts(extracted.price, vat.vatIncluded, vatRate)
    const resolvedCurrency = extracted.currency?.toUpperCase() || defaultCurrency
    const shippingCurrency = extracted.shippingCost === null ? null : (extracted.shippingCurrency?.toUpperCase() || resolvedCurrency)
    const deliveredPriceInclVat = extracted.shippingCost !== null && shippingCurrency === resolvedCurrency
      ? priceSuggestionAmounts(extracted.price + extracted.shippingCost, vat.vatIncluded, vatRate).incl
      : null
    const shippingReason = extracted.shippingCost === null
      ? 'Verzendkosten niet betrouwbaar zichtbaar op de productpagina.'
      : extracted.shippingCost === 0
        ? 'Gratis verzending herkend.'
        : 'Verzendkosten op de productpagina herkend.'
    return {
      ...base, observedPrice: extracted.price, priceInclVat: amounts.incl, priceExclVat: amounts.excl,
      shippingCost: extracted.shippingCost, shippingCurrency, deliveredPriceInclVat,
      shippingLabel: extracted.shippingLabel, vatIncluded: vat.vatIncluded, currency: resolvedCurrency,
      confidence: extracted.ean && quality.confidence === 'HIGH' && vat.confidence === 'HIGH' ? 'HIGH' : 'REVIEW',
      method: extracted.method, reason: vat.vatIncluded === null
        ? `Productprijs gevonden, maar de btw status is niet zeker. ${shippingReason}`
        : quality.confidence === 'HIGH' && vat.confidence === 'HIGH' ? `EAN en btw herkend. ${shippingReason}` : `Controleer productvariant, verpakking en btw bij de bron. ${shippingReason}`,
    }
  } catch (error) {
    return { ...base, reason: error instanceof Error && error.name === 'AbortError' ? 'Bron reageerde niet op tijd.' : 'Prijs kon niet veilig worden uitgelezen.' }
  } finally { clearTimeout(timer) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('products.read')
    const { id } = await params
    const body = await request.json() as { countryId?: unknown }
    if (typeof body.countryId !== 'string' || !body.countryId) return NextResponse.json({ error: 'Selecteer een markt.' }, { status: 400 })
    const country = await requireLicensedCountry(actor.companyId, body.countryId)
    const product = await prisma.product.findFirst({
      where: { id, companyId: actor.companyId, isActive: true },
      select: {
        id: true, ean: true, gtin: true, articleNumber: true, name: true, ownPrice: true, currency: true, vatIncluded: true,
        productMarkets: { where: { companyId: actor.companyId, countryId: country.id, isActive: true }, select: { ownUrl: true, ownPrice: true } },
        matches: {
          where: { companyId: actor.companyId, matchStatus: { in: ['REVIEW', 'CERTAIN'] } },
          select: { id: true, matchStatus: true, confidenceScore: true, competitorOffer: { select: { id: true, url: true, isActive: true, competitor: { select: { name: true, countryId: true, isActive: true } } } } },
          orderBy: { confidenceScore: 'desc' }, take: 30,
        },
      },
    })
    if (!product) return NextResponse.json({ error: 'Product niet gevonden.' }, { status: 404 })
    const identifier = product.ean?.trim() || product.gtin?.trim()
    if (!identifier || !/^\d{8}(?:\d{4,6})?$/.test(identifier)) return NextResponse.json({ error: 'Een geldige EAN of GTIN is vereist.' }, { status: 422 })
    let ownUrl = product.productMarkets[0]?.ownUrl ?? null
    let ownUrlDiscovered = false
    if (!ownUrl) {
      // Search only the company's configured OWN webshop for this licensed market.
      // A search hit is never treated as an identity match by itself.
      const shops = await prisma.webshop.findMany({
        where: { companyId: actor.companyId, countryId: country.id, competitorId: null, isActive: true },
        select: { url: true }, take: 2,
      })
      for (const shop of shops) {
        try {
          const host = new URL(shop.url).hostname.toLowerCase().replace(/^www\./, '')
          const search = await webSearch(`"${identifier}" site:${host}`)
          const hit = search.candidates.find((candidate) => {
            try {
              const candidateHost = new URL(candidate.url).hostname.toLowerCase().replace(/^www\./, '')
              return candidateHost === host || candidateHost.endsWith(`.${host}`)
            } catch { return false }
          })
          if (hit) {
            ownUrl = hit.url
            ownUrlDiscovered = true
            break
          }
        } catch { /* An invalid shop URL must not interrupt competitor suggestions. */ }
      }
    }
    const sources: Source[] = []
    if (ownUrl) sources.push({ id: 'own', matchId: null, kind: 'OWN', name: 'Eigen webshop', url: ownUrl, trusted: !ownUrlDiscovered })
    const competitors = product.matches.filter((match) => match.competitorOffer.isActive && match.competitorOffer.competitor.isActive && match.competitorOffer.competitor.countryId === country.id).slice(0, 4)
    for (const match of competitors) sources.push({ id: match.competitorOffer.id, matchId: match.id, kind: 'COMPETITOR', name: match.competitorOffer.competitor.name, url: match.competitorOffer.url, trusted: match.matchStatus === 'CERTAIN' })
    const ownPrice = product.productMarkets[0]?.ownPrice ?? product.ownPrice
    const info = { ean: identifier, articleNumber: product.articleNumber, name: product.name, ownPrice: ownPrice === null ? null : Number(ownPrice) }
    const results = await Promise.all(sources.map((source) => previewSource(source, info, Number(country.vatRate), country.currency, country.code)))
    return NextResponse.json({ ean: identifier, market: country.code, countryId: country.id, suggestions: results, hasOwnUrl: Boolean(ownUrl), hasCompetitors: competitors.length > 0 })
  } catch (error) {
    console.error('EAN price suggestion preview failed', error)
    return NextResponse.json({ error: 'Prijssuggesties konden niet worden opgehaald.' }, { status: 500 })
  }
}
