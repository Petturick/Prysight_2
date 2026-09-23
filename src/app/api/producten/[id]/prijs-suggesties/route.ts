import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { webSearch } from '@/lib/ean-competitor-discovery'
import { getMagentoPricingConfig, readMagentoBasePrice } from '@/lib/magento-pricing'
import { extractOfferSnapshot, fetchCommerceApiSnapshot } from '@/lib/price-monitoring'
import { assessPriceQuality } from '@/lib/price-quality'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl, safeRemoteFetch } from '@/lib/safe-remote-url'
import { detectVatInclusion } from '@/lib/vat-detection'
import { priceSuggestionAmounts } from '@/lib/ean-price-suggestion-amounts'
import { validGtin } from '@/lib/gtin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Source = {
  id: string
  matchId: string | null
  kind: 'OWN' | 'COMPETITOR'
  name: string
  url: string
  trusted: boolean
  vatIncluded: boolean | null
}

type Suggestion = {
  id: string
  matchId: string | null
  kind: Source['kind']
  name: string
  url: string
  observedPrice: number | null
  priceInclVat: number | null
  priceExclVat: number | null
  shippingCost: number | null
  shippingCurrency: string | null
  deliveredPriceInclVat: number | null
  shippingLabel: string | null
  vatIncluded: boolean | null
  vatRate: number
  currency: string
  confidence: 'HIGH' | 'REVIEW' | 'UNAVAILABLE'
  method: string | null
  reason: string
  checkedAt: string
}

function hostnameLabel(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '')
    const base = host.split('.')[0] || host
    return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  } catch {
    return 'Concurrent'
  }
}

function parseMoneyValues(value: string) {
  const values: number[] = []
  const patterns = [
    /€\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/g,
    /([0-9]{1,6}(?:[.,][0-9]{1,2})?)\s*€/g,
  ]
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const normalized = match[1].includes(',') ? match[1].replace(/\./g, '').replace(',', '.') : match[1]
      const amount = Number(normalized)
      if (Number.isFinite(amount) && amount > 0 && !values.some((candidate) => Math.abs(candidate - amount) < 0.005)) values.push(amount)
    }
  }
  return values
}

function pricePairForVat(values: number[], vatRate: number) {
  const factor = 1 + vatRate / 100
  for (const first of values) {
    for (const second of values) {
      if (first === second) continue
      const excl = Math.min(first, second)
      const incl = Math.max(first, second)
      if (excl <= 0) continue
      if (Math.abs(incl / excl - factor) <= 0.035) return { incl, excl }
    }
  }
  return null
}

async function indexedOwnPriceSuggestion(
  ownUrl: string,
  articleNumber: string,
  vatRate: number,
  currency: string,
): Promise<Suggestion | null> {
  try {
    const host = new URL(ownUrl).hostname.replace(/^www\./, '')
    const search = await webSearch(`"${articleNumber}" site:${host}`)
    for (const candidate of search.candidates) {
      let candidateHost = ''
      try { candidateHost = new URL(candidate.url).hostname.replace(/^www\./, '') } catch { continue }
      if (candidateHost !== host && !candidateHost.endsWith(`.${host}`)) continue

      const pair = pricePairForVat(parseMoneyValues(`${candidate.title} ${candidate.snippet ?? ''}`), vatRate)
      if (!pair) continue

      return {
        id: 'own-search-index',
        matchId: null,
        kind: 'OWN',
        name: 'Eigen webshop',
        url: candidate.url,
        observedPrice: pair.incl,
        priceInclVat: Math.round(pair.incl * 100) / 100,
        priceExclVat: Math.round(pair.excl * 100) / 100,
        shippingCost: null,
        shippingCurrency: null,
        deliveredPriceInclVat: null,
        shippingLabel: null,
        vatIncluded: true,
        vatRate,
        currency,
        confidence: 'REVIEW',
        method: 'SEARCH_INDEX',
        reason: 'De productpagina blokkeert directe uitlezing. De prijs is uit een actuele zoekindexvermelding van de eigen webshop gehaald en op het btw verschil gevalideerd.',
        checkedAt: new Date().toISOString(),
      }
    }
  } catch {}
  return null
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
  } finally {
    reader.releaseLock()
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
  if (!html.trim()) throw new Error('Lege productpagina.')
  return html
}

async function allowedByRobots(targetUrl: string, signal: AbortSignal) {
  const target = new URL(targetUrl)
  const robots = await safeRemoteFetch(new URL('/robots.txt', target.origin).toString(), {
    signal,
    cache: 'no-store',
    headers: { 'User-Agent': 'PrysightPriceMonitor/2.0' },
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

function renderedHtmlFromPayload(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return value.trim() ? value : null
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return null
  const record = value as Record<string, unknown>
  for (const key of ['html', 'content', 'body', 'result', 'data']) {
    const html = renderedHtmlFromPayload(record[key], depth + 1)
    if (html) return html
  }
  return null
}

async function fetchRenderedHtml(targetUrl: string, signal: AbortSignal) {
  const rendererUrl = process.env.BROWSER_RENDERER_URL?.trim()
  if (!rendererUrl) return null
  const token = process.env.BROWSER_RENDERER_TOKEN?.trim()
  const response = await safeRemoteFetch(rendererUrl, {
    method: 'POST',
    signal,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json,text/html',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url: targetUrl }),
  })
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return renderedHtmlFromPayload(await response.json())
  const html = await response.text()
  return html.trim() ? html : null
}

function emptySuggestion(source: Source, vatRate: number, currency: string): Suggestion {
  return {
    id: source.id,
    matchId: source.matchId,
    kind: source.kind,
    name: source.name,
    url: source.url,
    observedPrice: null,
    priceInclVat: null,
    priceExclVat: null,
    shippingCost: null,
    shippingCurrency: null,
    deliveredPriceInclVat: null,
    shippingLabel: null,
    vatIncluded: null,
    vatRate,
    currency,
    confidence: 'UNAVAILABLE',
    method: null,
    reason: '',
    checkedAt: new Date().toISOString(),
  }
}


function buildSuggestionFromApi(
  source: Source,
  base: Suggestion,
  snapshot: Awaited<ReturnType<typeof fetchCommerceApiSnapshot>>,
  product: { ean: string; articleNumber: string; name: string; ownPrice: number | null },
  vatRate: number,
  defaultCurrency: string,
) {
  if (!snapshot?.price || snapshot.price <= 0) return null
  const quality = assessPriceQuality({
    extractedPrice: snapshot.price,
    normalizedPrice: snapshot.price,
    method: snapshot.method === 'MAGENTO' || snapshot.method === 'META' ? snapshot.method : 'HTML_REGEX',
    extractedEan: snapshot.ean,
    extractedSku: snapshot.sku,
    extractedTitle: snapshot.productTitle,
    productEan: product.ean,
    articleNumber: source.kind === 'OWN' ? product.articleNumber : undefined,
    productName: product.name,
    ownPrice: product.ownPrice,
    trustedProductMapping: source.trusted,
  })
  if (!quality.accepted) return { ...base, reason: quality.reasons.join(' ') }

  const resolvedCurrency = snapshot.currency?.toUpperCase() || defaultCurrency
  const amounts = priceSuggestionAmounts(snapshot.price, source.vatIncluded, vatRate)
  return {
    ...base,
    observedPrice: snapshot.price,
    priceInclVat: amounts.incl,
    priceExclVat: amounts.excl,
    shippingCost: snapshot.shippingCost,
    shippingCurrency: snapshot.shippingCurrency,
    deliveredPriceInclVat: null,
    shippingLabel: snapshot.shippingLabel,
    vatIncluded: source.vatIncluded,
    currency: resolvedCurrency,
    confidence: quality.confidence === 'HIGH' ? 'HIGH' as const : 'REVIEW' as const,
    method: `COMMERCE_API_${snapshot.method ?? 'UNKNOWN'}`,
    reason: source.vatIncluded === null
      ? 'Prijs rechtstreeks via de webshop API gevonden. Btw status kon niet betrouwbaar worden vastgesteld.'
      : 'Prijs rechtstreeks via de webshop API gevonden en met de ingestelde btw status omgerekend.',
  }
}

function buildSuggestionFromExtraction(
  source: Source,
  base: Suggestion,
  html: string,
  fetchMode: 'HTTP' | 'BROWSER',
  product: { ean: string; articleNumber: string; name: string; ownPrice: number | null },
  vatRate: number,
  defaultCurrency: string,
  countryCode: string,
) {
  const extracted = extractOfferSnapshot(html, { ean: product.ean, productName: product.name, countryCode })
  if (extracted.price === null || extracted.price <= 0) return null
  if (extracted.ean && extracted.ean.replace(/\D/g, '') !== product.ean.replace(/\D/g, '')) {
    return { ...base, reason: 'EAN op de bronpagina verschilt van dit product.' }
  }
  const quality = assessPriceQuality({
    extractedPrice: extracted.price,
    normalizedPrice: extracted.price,
    method: extracted.method === 'JSON_LD' || extracted.method === 'META' ? extracted.method : 'HTML_REGEX',
    extractedEan: extracted.ean,
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
    ...base,
    observedPrice: extracted.price,
    priceInclVat: amounts.incl,
    priceExclVat: amounts.excl,
    shippingCost: extracted.shippingCost,
    shippingCurrency,
    deliveredPriceInclVat,
    shippingLabel: extracted.shippingLabel,
    vatIncluded: vat.vatIncluded,
    currency: resolvedCurrency,
    confidence: extracted.ean && quality.confidence === 'HIGH' && vat.confidence === 'HIGH' ? 'HIGH' as const : 'REVIEW' as const,
    method: `${fetchMode}_${extracted.method ?? 'UNKNOWN'}`,
    reason: vat.vatIncluded === null
      ? `Productprijs gevonden, maar de btw status is niet zeker. ${shippingReason}`
      : quality.confidence === 'HIGH' && vat.confidence === 'HIGH'
        ? `EAN en btw herkend. ${shippingReason}`
        : `Productprijs gevonden. Controleer alleen variant, verpakking en btw als de bron geen volledige productdata publiceert. ${shippingReason}`,
  }
}

async function previewSource(
  source: Source,
  product: { ean: string; articleNumber: string; name: string; ownPrice: number | null },
  vatRate: number,
  defaultCurrency: string,
  countryCode: string,
): Promise<Suggestion> {
  const base = emptySuggestion(source, vatRate, defaultCurrency)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 14_000)
  try {
    if (!(await allowedByRobots(source.url, controller.signal))) return { ...base, reason: 'Deze bron staat automatische prijscontrole niet toe via robots.txt.' }

    let primaryReason = 'Prijs kon niet worden uitgelezen.'
    try {
      const response = await safeRemoteFetch(source.url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.7',
        },
      })
      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? ''
        if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
          const html = await limitedHtml(response)
          const suggestion = buildSuggestionFromExtraction(source, base, html, 'HTTP', product, vatRate, defaultCurrency, countryCode)
          if (suggestion && (suggestion.observedPrice !== null || suggestion.reason.includes('verschilt'))) return suggestion
          primaryReason = suggestion?.reason || 'Geen betrouwbare prijs gevonden in de HTML.'
        } else {
          primaryReason = 'Geen leesbare productpagina.'
        }
      } else {
        primaryReason = `Bron gaf HTTP ${response.status}.`
      }
    } catch (error) {
      primaryReason = error instanceof Error && error.name === 'AbortError' ? 'Bron reageerde niet op tijd.' : 'Directe prijscontrole is mislukt.'
    }

    const commerceApi = await fetchCommerceApiSnapshot(source.url, {
      ean: product.ean,
      sku: source.kind === 'OWN' ? product.articleNumber : null,
      productName: product.name,
      countryCode,
    }).catch(() => null)
    if (commerceApi?.price) {
      const suggestion = buildSuggestionFromApi(source, base, commerceApi, product, vatRate, defaultCurrency)
      if (suggestion) return suggestion
    }

    const renderedHtml = await fetchRenderedHtml(source.url, controller.signal).catch(() => null)
    if (renderedHtml) {
      const suggestion = buildSuggestionFromExtraction(source, base, renderedHtml, 'BROWSER', product, vatRate, defaultCurrency, countryCode)
      if (suggestion) return suggestion
    }

    return { ...base, reason: primaryReason }
  } catch (error) {
    return { ...base, reason: error instanceof Error && error.name === 'AbortError' ? 'Bron reageerde niet op tijd.' : 'Prijs kon niet veilig worden uitgelezen.' }
  } finally {
    clearTimeout(timer)
  }
}

async function magentoOwnSuggestion(
  companyId: string,
  articleNumber: string,
  vatRate: number,
): Promise<Suggestion | null> {
  try {
    const config = await getMagentoPricingConfig(companyId)
    if (!config) return null
    const price = await readMagentoBasePrice(articleNumber, companyId)
    const amounts = priceSuggestionAmounts(price.price, price.pricesIncludeTax, vatRate)
    return {
      id: 'own-magento',
      matchId: null,
      kind: 'OWN',
      name: 'Eigen webshop via Magento 2',
      url: config.baseUrl,
      observedPrice: price.price,
      priceInclVat: amounts.incl,
      priceExclVat: amounts.excl,
      shippingCost: null,
      shippingCurrency: null,
      deliveredPriceInclVat: null,
      shippingLabel: null,
      vatIncluded: price.pricesIncludeTax,
      vatRate,
      currency: price.currency,
      confidence: 'HIGH',
      method: 'MAGENTO_API',
      reason: 'Eigen prijs rechtstreeks via de gekoppelde Magento 2 integratie gelezen.',
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.warn('Magento own price preview failed', { companyId, articleNumber, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

function storedOwnPriceSuggestion(
  source: Source,
  price: number,
  vatIncluded: boolean,
  vatRate: number,
  currency: string,
  reason: string,
): Suggestion {
  const amounts = priceSuggestionAmounts(price, vatIncluded, vatRate)
  return {
    ...emptySuggestion(source, vatRate, currency),
    observedPrice: price,
    priceInclVat: amounts.incl,
    priceExclVat: amounts.excl,
    vatIncluded,
    confidence: 'REVIEW',
    method: 'PRYSIGHT_DATA',
    reason,
  }
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
        id: true,
        ean: true,
        gtin: true,
        articleNumber: true,
        name: true,
        ownPrice: true,
        currency: true,
        vatIncluded: true,
        productMarkets: {
          where: { companyId: actor.companyId, countryId: country.id, isActive: true },
          select: { ownUrl: true, ownPrice: true, vatIncluded: true, currency: true },
        },
        matches: {
          where: { companyId: actor.companyId, matchStatus: { in: ['REVIEW', 'CERTAIN'] } },
          select: {
            id: true,
            matchStatus: true,
            confidenceScore: true,
            competitorOffer: {
              select: {
                id: true,
                url: true,
                isActive: true,
                vatIncluded: true,
                competitor: { select: { name: true, countryId: true, isActive: true } },
              },
            },
          },
          orderBy: { confidenceScore: 'desc' },
          take: 30,
        },
      },
    })

    if (!product) return NextResponse.json({ error: 'Product niet gevonden.' }, { status: 404 })
    const identifier = product.ean?.trim() || product.gtin?.trim()
    if (!validGtin(identifier)) return NextResponse.json({ error: 'Een geldige EAN of GTIN met correcte controlecode is vereist.' }, { status: 422 })

    const shops = await prisma.webshop.findMany({
      where: { companyId: actor.companyId, countryId: country.id, competitorId: null, isActive: true },
      select: { url: true },
      take: 4,
    })
    const ownHosts = new Set(shops.flatMap((shop) => {
      try { return [new URL(shop.url).hostname.toLowerCase().replace(/^www\./, '')] } catch { return [] }
    }))

    let ownUrl = product.productMarkets[0]?.ownUrl ?? null
    let ownUrlDiscovered = false
    if (!ownUrl) {
      for (const shop of shops) {
        try {
          const host = new URL(shop.url).hostname.toLowerCase().replace(/^www\./, '')
          const search = await webSearch(`"${identifier}" site:${host}`)
          const hit = search.candidates.find((candidate) => {
            try {
              const candidateHost = new URL(candidate.url).hostname.toLowerCase().replace(/^www\./, '')
              return candidateHost === host || candidateHost.endsWith(`.${host}`)
            } catch {
              return false
            }
          })
          if (hit) {
            ownUrl = hit.url
            ownUrlDiscovered = true
            break
          }
        } catch {}
      }
    }

    const sources: Source[] = []
    const existingCompetitors = product.matches
      .filter((match) => match.competitorOffer.isActive && match.competitorOffer.competitor.isActive && match.competitorOffer.competitor.countryId === country.id)
      .slice(0, 4)
    for (const match of existingCompetitors) {
      sources.push({
        id: match.competitorOffer.id,
        matchId: match.id,
        kind: 'COMPETITOR',
        name: match.competitorOffer.competitor.name,
        url: match.competitorOffer.url,
        trusted: match.matchStatus === 'CERTAIN',
        vatIncluded: match.competitorOffer.vatIncluded,
      })
    }

    let searchProvider: string | null = null
    let autoDiscoveredCount = 0
    if (sources.filter((source) => source.kind === 'COMPETITOR').length < 4) {
      const search = await webSearch(`"${identifier}" ${country.name}`, country.code)
      searchProvider = search.provider
      const knownUrls = new Set(sources.map((source) => source.url))
      for (const candidate of search.candidates) {
        if (sources.filter((source) => source.kind === 'COMPETITOR').length >= 4) break
        try {
          const safe = (await assertSafeRemoteHttpUrl(candidate.url)).toString()
          if (knownUrls.has(safe)) continue
          const host = new URL(safe).hostname.toLowerCase().replace(/^www\./, '')
          if (ownHosts.has(host)) continue
          if (/google\.|bing\.|duckduckgo\.|youtube\.|facebook\.|instagram\.|amazon\./i.test(host)) continue
          knownUrls.add(safe)
          sources.push({ id: `ean-search-${autoDiscoveredCount + 1}`, matchId: null, kind: 'COMPETITOR', name: hostnameLabel(safe), url: safe, trusted: false, vatIncluded: null })
          autoDiscoveredCount += 1
        } catch {}
      }
    }

    const ownVatIncluded = product.productMarkets[0]?.vatIncluded ?? product.vatIncluded
    const ownPriceRaw = product.productMarkets[0]?.ownPrice ?? product.ownPrice
    const ownPrice = ownPriceRaw === null ? null : Number(ownPriceRaw)
    const marketCurrency = product.productMarkets[0]?.currency ?? country.currency ?? product.currency
    const info = { ean: identifier, articleNumber: product.articleNumber, name: product.name, ownPrice }
    const vatRate = Number(country.vatRate)

    const results: Suggestion[] = []
    const magento = await magentoOwnSuggestion(actor.companyId, product.articleNumber, vatRate)
    if (magento) {
      results.push(magento)
    } else if (ownUrl) {
      const ownSource: Source = { id: 'own', matchId: null, kind: 'OWN', name: 'Eigen webshop', url: ownUrl, trusted: !ownUrlDiscovered, vatIncluded: ownVatIncluded }
      const preview = await previewSource(ownSource, info, vatRate, marketCurrency, country.code)
      if (preview.observedPrice === null) {
        const indexed = await indexedOwnPriceSuggestion(ownUrl, product.articleNumber, vatRate, marketCurrency)
        if (indexed) {
          results.push(indexed)
        } else if (ownPrice !== null) {
          results.push(storedOwnPriceSuggestion(
            ownSource,
            ownPrice,
            ownVatIncluded,
            vatRate,
            marketCurrency,
            `De productbron kon niet worden uitgelezen. De huidige Prysight verkoopprijs is gebruikt. ${preview.reason}`,
          ))
        } else {
          results.push(preview)
        }
      } else {
        results.push(preview)
      }
    } else if (ownPrice !== null) {
      results.push(storedOwnPriceSuggestion(
        { id: 'own-data', matchId: null, kind: 'OWN', name: 'Eigen verkoopprijs', url: '/producten/' + product.id, trusted: true, vatIncluded: ownVatIncluded },
        ownPrice,
        ownVatIncluded,
        vatRate,
        marketCurrency,
        'Huidige verkoopprijs uit Prysight gebruikt omdat nog geen eigen product URL is gekoppeld.',
      ))
    }

    const competitorSources = sources.filter((source) => source.kind === 'COMPETITOR')
    const competitorResults = await Promise.all(
      competitorSources.map((source) => previewSource(source, info, vatRate, country.currency, country.code)),
    )
    results.push(...competitorResults)

    return NextResponse.json({
      ean: identifier,
      market: country.code,
      countryId: country.id,
      suggestions: results,
      hasOwnUrl: Boolean(ownUrl || magento),
      hasCompetitors: competitorSources.length > 0,
      autoDiscoveredCount,
      searchProvider,
    })
  } catch (error) {
    console.error('EAN price suggestion preview failed', error)
    return NextResponse.json({ error: 'Prijssuggesties konden niet worden opgehaald.' }, { status: 500 })
  }
}