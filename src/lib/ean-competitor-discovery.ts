import { MatchStatus } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

type SearchCandidate = { title: string; url: string; snippet?: string }
type SearchResult = { candidates: SearchCandidate[]; provider: string }

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

function scoreCandidate(candidate: SearchCandidate, ean: string, productName: string, countryCode: string) {
  const haystack = `${candidate.title} ${candidate.url} ${candidate.snippet ?? ''}`.toLowerCase()
  const productTokens = productName
    .toLowerCase()
    .replace(/[^0-9a-zà-ÿ]+/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 10)

  let score = haystack.includes(ean.toLowerCase()) ? 76 : 44
  score += Math.min(24, productTokens.filter((token) => haystack.includes(token)).length * 4)
  if (/product|artikel|item|shop|catalog|assortiment|p\//i.test(candidate.url)) score += 6
  const suffix = marketDomainSuffix(countryCode)
  if (suffix && new URL(candidate.url).hostname.toLowerCase().endsWith(suffix)) score += 6
  return Math.min(98, score)
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
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PrysightBot/2.0)' },
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
      if (candidates.length >= 10) break
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
        'user-agent': 'Mozilla/5.0 (compatible; PrysightBot/2.0)',
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
      if (candidates.length >= 10) break
    }
    return candidates
  } catch {
    return []
  }
}

export async function webSearch(query: string): Promise<SearchResult> {
  const serper = await searchWithSerper(query)
  if (serper.length) return { candidates: serper, provider: 'Serper' }
  const brave = await searchWithBrave(query)
  if (brave.length) return { candidates: brave, provider: 'Brave Search' }
  const duck = await searchDuckDuckGo(query)
  if (duck.length) return { candidates: duck, provider: 'DuckDuckGo' }
  const bing = await searchBing(query)
  if (bing.length) return { candidates: bing, provider: 'Bing' }
  return { candidates: [], provider: 'Geen zoekprovider met resultaten' }
}

function rankCandidates(results: SearchCandidate[], product: { ean: string; name: string }, countryCode: string) {
  const unique = new Map<string, SearchCandidate>()
  for (const result of results) {
    try {
      const canonical = canonicalProductUrl(result.url)
      if (!unique.has(canonical)) unique.set(canonical, { ...result, url: canonical })
    } catch {}
  }
  return [...unique.values()]
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, product.ean, product.name, countryCode) }))
    .filter((candidate) => candidate.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

export async function discoverCompetitorUrlsByEan({ companyId, productId, countryId }: { companyId: string; productId: string; countryId: string }) {
  const [product, country, companyWebshops] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, companyId, isActive: true } }),
    prisma.country.findUnique({ where: { id: countryId } }),
    prisma.webshop.findMany({ where: { companyId, isActive: true, competitorId: null }, select: { url: true } }),
  ])
  if (!product) return { found: 0, created: 0, alreadyLinked: 0, reason: 'Product ontbreekt', provider: null, queryMode: null }
  const ean = product.ean?.trim() || product.gtin?.trim()
  if (!ean) return { found: 0, created: 0, alreadyLinked: 0, reason: 'EAN of GTIN ontbreekt', provider: null, queryMode: null }
  if (!country) return { found: 0, created: 0, alreadyLinked: 0, reason: 'Markt ontbreekt', provider: null, queryMode: null }

  const ownHosts = new Set(companyWebshops.flatMap((shop) => {
    try { return [new URL(shop.url).hostname.replace(/^www\./, '')] } catch { return [] }
  }))

  // A strict search combining EAN, product name and market often returns zero results;
  // the exact identifier is the primary signal and the market is used for ranking.
  const exactSearch = await webSearch(`"${ean}"`)
  let ranked = rankCandidates(exactSearch.candidates, { ean: ean, name: product.name }, country.code)
  let provider = exactSearch.provider
  let queryMode: 'EAN' | 'PRODUCT' = 'EAN'

  if (ranked.length === 0) {
    const cleanName = product.name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    const fallbackSearch = await webSearch(`${cleanName} ${country.name} ${country.code}`)
    ranked = rankCandidates(fallbackSearch.candidates, { ean: ean, name: product.name }, country.code)
    provider = fallbackSearch.provider
    queryMode = 'PRODUCT'
  }

  const safeRanked = []
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
        currency: product.currency,
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
          ean: ean,
          market: country.code,
          title: candidate.title,
          snippet: candidate.snippet ?? null,
          searchMode: queryMode,
          reason: queryMode === 'EAN'
            ? 'Slimme marktsuggestie op basis van EAN, productcontext en gekozen markt'
            : 'EAN leverde geen bruikbare resultaten op, kandidaat gevonden op productnaam, kenmerken en gekozen markt',
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

  return { found, created, alreadyLinked, reason, provider, queryMode }
}
