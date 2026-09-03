import { MatchStatus } from '@/generated/prisma/client'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'

type SearchCandidate = { title: string; url: string; snippet?: string }

function hostnameLabel(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, '')
  const base = host.split('.')[0] || host
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function scoreCandidate(candidate: SearchCandidate, ean: string, productName: string) {
  const haystack = `${candidate.title} ${candidate.url} ${candidate.snippet ?? ''}`.toLowerCase()
  const productTokens = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 4).slice(0, 6)
  let score = haystack.includes(ean.toLowerCase()) ? 72 : 48
  score += Math.min(18, productTokens.filter((token) => haystack.includes(token)).length * 4)
  if (/product|artikel|item|shop|catalog|p\//i.test(candidate.url)) score += 6
  return Math.min(96, score)
}

async function searchWithSerper(query: string): Promise<SearchCandidate[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: 10 }),
    cache: 'no-store',
  })
  if (!response.ok) return []
  const data = await response.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string }> }
  return (data.organic ?? []).flatMap((item) => item.link ? [{ title: item.title ?? item.link, url: item.link, snippet: item.snippet }] : [])
}

async function searchWithBrave(query: string): Promise<SearchCandidate[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) return []
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    cache: 'no-store',
  })
  if (!response.ok) return []
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
  return (data.web?.results ?? []).flatMap((item) => item.url ? [{ title: item.title ?? item.url, url: item.url, snippet: item.description }] : [])
}

async function searchFallback(query: string): Promise<SearchCandidate[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PrysightBot/1.0)' },
    cache: 'no-store',
  })
  if (!response.ok) return []
  const html = await response.text()
  const candidates: SearchCandidate[] = []
  const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const rawUrl = match[1]
    const title = match[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
    try {
      const parsed = new URL(rawUrl, 'https://duckduckgo.com')
      const redirected = parsed.searchParams.get('uddg')
      const url = redirected ? decodeURIComponent(redirected) : rawUrl
      candidates.push({ title, url })
    } catch {}
    if (candidates.length >= 10) break
  }
  return candidates
}

async function webSearch(query: string) {
  const serper = await searchWithSerper(query)
  if (serper.length) return serper
  const brave = await searchWithBrave(query)
  if (brave.length) return brave
  return searchFallback(query)
}

export async function discoverCompetitorUrlsByEan({ companyId, productId, countryId }: { companyId: string; productId: string; countryId: string }) {
  const product = await prisma.product.findFirst({ where: { id: productId, companyId, isActive: true } })
  if (!product?.ean) return { found: 0, created: 0, reason: 'EAN ontbreekt' }

  const companyWebshops = await prisma.webshop.findMany({ where: { companyId, isActive: true }, select: { url: true } })
  const ownHosts = new Set(companyWebshops.flatMap((shop) => { try { return [new URL(shop.url).hostname.replace(/^www\./, '')] } catch { return [] } }))
  const results = await webSearch(`"${product.ean}" ${product.name}`)
  const unique = new Map<string, SearchCandidate>()

  for (const result of results) {
    try {
      const safe = (await assertSafeRemoteHttpUrl(result.url)).toString()
      const parsed = new URL(safe)
      const host = parsed.hostname.replace(/^www\./, '')
      if (ownHosts.has(host)) continue
      if (/google\.|bing\.|duckduckgo\.|youtube\.|facebook\.|instagram\.|amazon\./i.test(host)) continue
      const normalized = `${parsed.origin}${parsed.pathname}`
      if (!unique.has(normalized)) unique.set(normalized, { ...result, url: safe })
    } catch {}
  }

  const ranked = [...unique.values()]
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, product.ean!, product.name) }))
    .filter((candidate) => candidate.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  let created = 0
  for (const candidate of ranked) {
    const website = new URL(candidate.url).origin
    const competitorName = hostnameLabel(candidate.url)
    const where = { companyId_name_countryId: { companyId, name: competitorName, countryId } }
    let competitor = await prisma.competitor.findUnique({ where })
    if (!competitor) {
      await assertCompanyCapacity(companyId, 'competitors')
      competitor = await prisma.competitor.create({ data: { companyId, name: competitorName, website, countryId, isActive: true, checkFrequencyHours: 24 } })
    }

    const existingOffer = await prisma.competitorOffer.findUnique({ where: { companyId_competitorId_url: { companyId, competitorId: competitor.id, url: candidate.url } }, include: { productMatch: true } })
    if (existingOffer?.productMatch) continue
    const offer = existingOffer ?? await prisma.competitorOffer.create({ data: { companyId, competitorId: competitor.id, url: candidate.url, currency: product.currency, vatIncluded: true, packagingUnit: product.packagingUnit, packagingQty: product.packagingQty, isActive: true } })
    await prisma.productMatch.create({
      data: {
        companyId,
        productId,
        competitorOfferId: offer.id,
        confidenceScore: candidate.score,
        matchStatus: MatchStatus.REVIEW,
        matchEvidence: { source: 'ean-web-discovery', ean: product.ean, title: candidate.title, snippet: candidate.snippet ?? null, reason: 'Webresultaat gevonden op exacte EAN en gerangschikt als concurrentsuggestie' },
      },
    })
    created += 1
  }

  return { found: ranked.length, created, reason: ranked.length ? null : 'Geen betrouwbare URL suggesties gevonden' }
}
