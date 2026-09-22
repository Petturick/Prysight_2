import { MatchStatus } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

type SearchCandidate = { title: string; url: string; snippet?: string }
type SearchResult = { candidates: SearchCandidate[]; provider: string }

const SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'

function hostnameLabel(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, '')
  const base = host.split('.')[0] || host
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function marketDomainSuffix(code: string) {
  const normalized = code.trim().toUpperCase()
  if (normalized === 'GB' || normalized === 'UK') return '.uk'
  return normalized ? `.${normalized.toLowerCase()}` : ''
}

function canonicalProductUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  const trackingPrefixes = ['utm_', 'gad_', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'channable']
  for (const key of [...url.searchParams.keys()]) {
    if (trackingPrefixes.some((prefix) => key.toLowerCase().startsWith(prefix))) url.searchParams.delete(key)
  }
  const query = url.searchParams.toString()
  return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}${query ? `?${query}` : ''}`
}

function readableUrlContext(value: string | null | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return decodeURIComponent(url.pathname)
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[\/_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

function meaningfulText(value: string | null | undefined) {
  const cleaned = String(value ?? '').replace(/[^0-9a-zà-ÿ]+/gi, ' ').replace(/\s+/g, ' ').trim()
  return /[a-zà-ÿ]{2,}/i.test(cleaned) ? cleaned : ''
}

function jsonRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function feedSearchContext(value: unknown) {
  const record = jsonRecord(value)
  if (!record) return { name: '', description: '' }

  const nameKeys = ['Nieuwe Titel', 'Oude titel', 'Product naam', 'Product Name', 'Title', 'catalog_product_attribute.meta_title NEW', 'catalog_product_attribute.meta_title']
  const descriptionKeys = ['catalog_product_attribute.meta_description NEW', 'Engels Nieuwe omschrijving', 'description', 'Omschrijving']

  let name = ''
  let description = ''
  for (const key of nameKeys) {
    name = meaningfulText(String(record[key] ?? ''))
    if (name) break
  }
  for (const key of descriptionKeys) {
    description = meaningfulText(String(record[key] ?? ''))
    if (description) break
  }

  return { name, description }
}

function compactSearchContext(value: string) {
  const stop = new Set(['voor', 'van', 'met', 'een', 'het', 'de', 'en', 'aan', 'this', 'that', 'with', 'the', 'and'])
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stop.has(token.toLowerCase()))
    .slice(0, 14)
    .join(' ')
}

function productContext(input: { name: string; articleNumber: string; ownUrl?: string | null }) {
  const name = meaningfulText(input.name)
  const urlContext = meaningfulText(readableUrlContext(input.ownUrl))
  const article = input.articleNumber.replace(/\s+/g, ' ').trim()
  return [name, urlContext, article].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

function scoreCandidate(
  candidate: SearchCandidate,
  product: { ean: string; articleNumber: string; context: string },
  countryCode: string,
) {
  const haystack = `${candidate.title} ${candidate.url} ${candidate.snippet ?? ''}`.toLowerCase()
  const contextTokens = product.context
    .toLowerCase()
    .replace(/[^0-9a-zà-ÿ]+/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 14)

  const compactArticle = product.articleNumber.replace(/[^0-9a-z]/gi, '').toLowerCase()
  const compactHaystack = haystack.replace(/[^0-9a-z]/gi, '')

  let score = haystack.includes(product.ean.toLowerCase()) ? 78 : 42
  if (compactArticle.length >= 4 && compactHaystack.includes(compactArticle)) score += 18
  score += Math.min(28, contextTokens.filter((token) => haystack.includes(token)).length * 4)
  if (/product|artikel|item|shop|catalog|assortiment|productdetail|\/p\//i.test(candidate.url)) score += 6
  const suffix = marketDomainSuffix(countryCode)
  if (suffix && new URL(candidate.url).hostname.toLowerCase().endsWith(suffix)) score += 6
  return Math.min(99, score)
}

async function searchWithSerper(query: string): Promise<SearchCandidate[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, num: 10 }),
      cache: 'no-store',
    })
    if (!response.ok) return []
    const data = await response.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string }> }
    return (data.organic ?? []).flatMap((item) => item.link ? [{ title: item.title ?? item.link, url: item.link, snippet: item.snippet }] : [])
  } catch {
    return []
  }
}

async function searchWithBrave(query: string): Promise<SearchCandidate[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) return []
  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      cache: 'no-store',
    })
    if (!response.ok) return []
    const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
    return (data.web?.results ?? []).flatMap((item) => item.url ? [{ title: item.title ?? item.url, url: item.url, snippet: item.description }] : [])
  } catch {
    return []
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function searchDuckDuckGo(query: string): Promise<SearchCandidate[]> {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'user-agent': SEARCH_UA, 'accept-language': 'nl-NL,nl;q=0.9,en;q=0.7' },
      cache: 'no-store',
    })
    if (!response.ok) return []
    const html = await response.text()
    const candidates: SearchCandidate[] = []
    const pattern = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    for (const match of html.matchAll(pattern)) {
      const rawUrl = decodeHtml(match[1])
      const title = decodeHtml(match[2].replace(/<[^>]+>/g, '')).trim()
      try {
        const parsed = new URL(rawUrl, 'https://duckduckgo.com')
        const redirected = parsed.searchParams.get('uddg')
        const url = redirected ? decodeURIComponent(redirected) : rawUrl
        candidates.push({ title, url })
      } catch {}
      if (candidates.length >= 12) break
    }
    return candidates
  } catch {
    return []
  }
}

async function searchBing(query: string): Promise<SearchCandidate[]> {
  try {
    const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`, {
      headers: {
        'user-agent': SEARCH_UA,
        'accept-language': 'nl-NL,nl;q=0.9,en;q=0.7',
      },
      cache: 'no-store',
    })
    if (!response.ok) return []
    const html = await response.text()
    const candidates: SearchCandidate[] = []
    const pattern = /<li class=["'][^"']*b_algo[^"']*["'][\s\S]*?<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi
    for (const match of html.matchAll(pattern)) {
      candidates.push({ url: decodeHtml(match[1]), title: decodeHtml(match[2].replace(/<[^>]+>/g, '')).trim() })
      if (candidates.length >= 12) break
    }
    return candidates
  } catch {
    return []
  }
}

function dedupeCandidates(groups: SearchCandidate[][]) {
  const unique = new Map<string, SearchCandidate>()
  for (const group of groups) {
    for (const candidate of group) {
      try {
        const canonical = canonicalProductUrl(candidate.url)
        if (!unique.has(canonical)) unique.set(canonical, { ...candidate, url: canonical })
      } catch {}
    }
  }
  return [...unique.values()].slice(0, 30)
}

export async function webSearch(query: string): Promise<SearchResult> {
  const [serper, brave] = await Promise.all([searchWithSerper(query), searchWithBrave(query)])
  if (serper.length || brave.length) {
    const candidates = dedupeCandidates([serper, brave])
    const providers = [serper.length ? 'Serper' : '', brave.length ? 'Brave Search' : ''].filter(Boolean)
    return { candidates, provider: providers.join(' + ') }
  }

  const [duck, bing] = await Promise.all([searchDuckDuckGo(query), searchBing(query)])
  const candidates = dedupeCandidates([duck, bing])
  const providers = [duck.length ? 'DuckDuckGo' : '', bing.length ? 'Bing' : ''].filter(Boolean)
  return { candidates, provider: providers.length ? providers.join(' + ') : 'Geen zoekprovider met resultaten' }
}

function rankCandidates(
  results: SearchCandidate[],
  product: { ean: string; articleNumber: string; context: string },
  countryCode: string,
) {
  return dedupeCandidates([results])
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, product, countryCode) }))
    .filter((candidate) => candidate.score >= 54)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

export async function discoverCompetitorUrlsByEan({ companyId, productId, countryId }: { companyId: string; productId: string; countryId: string }) {
  const [product, country, companyWebshops, feedItem] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, companyId, isActive: true },
      include: { productMarkets: { where: { companyId, countryId, isActive: true }, select: { ownUrl: true } } },
    }),
    prisma.country.findUnique({ where: { id: countryId } }),
    prisma.webshop.findMany({ where: { companyId, isActive: true, competitorId: null }, select: { url: true } }),
    prisma.feedItem.findFirst({
      where: { companyId, importedProductId: productId },
      orderBy: { updatedAt: 'desc' },
      select: { rawData: true, mappedData: true },
    }),
  ])

  if (!product) return { found: 0, created: 0, alreadyLinked: 0, reason: 'Product ontbreekt', provider: null, queryMode: null }
  const ean = product.ean?.trim() || product.gtin?.trim()
  if (!ean) return { found: 0, created: 0, alreadyLinked: 0, reason: 'EAN of GTIN ontbreekt', provider: null, queryMode: null }
  if (!country) return { found: 0, created: 0, alreadyLinked: 0, reason: 'Markt ontbreekt', provider: null, queryMode: null }

  const ownHosts = new Set(companyWebshops.flatMap((shop) => {
    try { return [new URL(shop.url).hostname.replace(/^www\./, '')] } catch { return [] }
  }))
  for (const market of product.productMarkets) {
    try {
      if (market.ownUrl) ownHosts.add(new URL(market.ownUrl).hostname.replace(/^www\./, ''))
    } catch {}
  }

  const feedRaw = feedSearchContext(feedItem?.rawData)
  const feedMapped = feedSearchContext(feedItem?.mappedData)
  const preferredName = feedRaw.name || feedMapped.name || product.name
  const feedDescription = feedRaw.description || feedMapped.description
  const context = productContext({
    name: preferredName,
    articleNumber: product.articleNumber,
    ownUrl: product.productMarkets[0]?.ownUrl,
  })
  const genericContext = compactSearchContext([preferredName, feedDescription, readableUrlContext(product.productMarkets[0]?.ownUrl)].filter(Boolean).join(' '))
  const identity = { ean, articleNumber: product.articleNumber, context: [context, genericContext].filter(Boolean).join(' ') }

  const queryVariants = [
    `"${ean}"`,
    `"${ean}" prijs`,
    `"${ean}" ${country.name}`,
    product.articleNumber ? `"${product.articleNumber}" ${preferredName}` : '',
    genericContext ? `${genericContext} ${country.name}` : '',
  ].filter(Boolean)

  const searchResults: SearchCandidate[][] = []
  const providerNames = new Set<string>()
  let queryMode: 'EAN' | 'PRODUCT' = 'EAN'

  for (const query of queryVariants.slice(0, 5)) {
    const search = await webSearch(query)
    if (search.candidates.length) searchResults.push(search.candidates)
    if (search.provider && search.provider !== 'Geen zoekprovider met resultaten') {
      search.provider.split(' + ').forEach((provider) => providerNames.add(provider))
    }
    const rankedNow = rankCandidates(dedupeCandidates(searchResults), identity, country.code)
    if (rankedNow.length >= 6) break
  }

  let ranked = rankCandidates(dedupeCandidates(searchResults), identity, country.code)
  if (ranked.length === 0 && genericContext) {
    queryMode = 'PRODUCT'
    const fallbackQueries = [
      genericContext,
      `${genericContext} prijs`,
      `${genericContext} webshop`,
    ]

    const fallbackGroups: SearchCandidate[][] = []
    for (const query of fallbackQueries) {
      const fallback = await webSearch(query)
      if (fallback.candidates.length) fallbackGroups.push(fallback.candidates)
      fallback.provider.split(' + ').forEach((provider) => {
        if (provider && provider !== 'Geen zoekprovider met resultaten') providerNames.add(provider)
      })
      const provisional = rankCandidates(dedupeCandidates(fallbackGroups), identity, country.code)
      if (provisional.length >= 5) break
    }
    ranked = rankCandidates(dedupeCandidates(fallbackGroups), identity, country.code)
  }

  const safeRanked: Array<SearchCandidate & { score: number }> = []
  for (const candidate of ranked) {
    try {
      const safe = (await assertSafeRemoteHttpUrl(candidate.url)).toString()
      const parsed = new URL(safe)
      const host = parsed.hostname.replace(/^www\./, '')
      if (ownHosts.has(host)) continue
      if (/engels(logistiek|group)?\.|google\.|bing\.|duckduckgo\.|youtube\.|facebook\.|instagram\.|amazon\./i.test(host)) continue
      safeRanked.push({ ...candidate, url: canonicalProductUrl(safe) })
    } catch {}
  }

  let created = 0
  let alreadyLinked = 0

  for (const candidate of safeRanked) {
    const baseUrl = candidate.url.split('?')[0]
    const companyExistingOffers = await prisma.competitorOffer.findMany({
      where: { companyId, url: { startsWith: baseUrl } },
      include: { productMatch: true },
      take: 25,
    })
    const alreadyMapped = companyExistingOffers.find((offer) => {
      try {
        return canonicalProductUrl(offer.url).split('?')[0] === baseUrl && offer.productMatch?.productId === productId
      } catch {
        return false
      }
    })
    if (alreadyMapped) {
      alreadyLinked += 1
      continue
    }

    const website = new URL(candidate.url).origin
    const competitorName = hostnameLabel(candidate.url)
    const where = { companyId_name_countryId: { companyId, name: competitorName, countryId } }
    let competitor = await prisma.competitor.findUnique({ where })

    if (!competitor) {
      await assertCompanyCapacity(companyId, 'competitors')
      competitor = await prisma.competitor.create({
        data: { companyId, name: competitorName, website, countryId, isActive: true, checkFrequencyHours: 24 },
      })
    }

    const existingOffers = await prisma.competitorOffer.findMany({
      where: { companyId, competitorId: competitor.id },
      include: { productMatch: true },
      take: 50,
    })
    const existingOffer = existingOffers.find((offer) => {
      try { return canonicalProductUrl(offer.url) === candidate.url } catch { return false }
    })

    if (existingOffer?.productMatch) {
      alreadyLinked += 1
      continue
    }

    const offer = existingOffer ?? await prisma.competitorOffer.create({
      data: {
        companyId,
        competitorId: competitor.id,
        url: candidate.url,
        currency: country.currency || product.currency,
        vatIncluded: true,
        packagingUnit: product.packagingUnit,
        packagingQty: product.packagingQty,
        isActive: true,
      },
    })

    await prisma.productMatch.create({
      data: {
        companyId,
        productId,
        competitorOfferId: offer.id,
        confidenceScore: queryMode === 'EAN' ? candidate.score : Math.min(candidate.score, 82),
        matchStatus: MatchStatus.REVIEW,
        matchEvidence: {
          source: 'ai-market-discovery',
          ean,
          market: country.code,
          title: candidate.title,
          snippet: candidate.snippet ?? null,
          searchMode: queryMode,
          searchContext: genericContext || context,
          reason: queryMode === 'EAN'
            ? 'Concurrentkandidaat gevonden op EAN, artikelnummer en productcontext'
            : 'Vergelijkbare marktbron gevonden op producttitel, kenmerken en markt, controleer de match voor commercieel gebruik',
        },
      },
    })
    created += 1
  }

  const found = safeRanked.length
  const reason = found
    ? created
      ? null
      : alreadyLinked
        ? 'De gevonden kandidaten waren al gekoppeld.'
        : 'Er zijn kandidaten gevonden, maar geen nieuwe koppelingen aangemaakt.'
    : 'Geen betrouwbare concurrentkandidaten gevonden.'

  return {
    found,
    created,
    alreadyLinked,
    reason,
    provider: providerNames.size ? [...providerNames].join(' + ') : 'Geen zoekprovider met resultaten',
    queryMode,
  }
}
