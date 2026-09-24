export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { findExistingProduct } from '@/lib/product-duplicate'
import { normalizeGtin, validGtin } from '@/lib/gtin'
import { prisma } from '@/lib/prisma'
import { webSearch } from '@/lib/ean-competitor-discovery'
import { lookupOnlineProduct, type OnlineProduct } from '@/lib/online-ean-product'
import { lookupOwnFeedByEan } from '@/lib/feed-ean-lookup'
import { mergeVerifiedProductSources, type VerifiedSource } from '@/lib/product-recognition-merge'

type Candidate = { title: string; url: string; snippet?: string }

function hasExactEan(value: string, ean: string) {
  return value.replace(/\D/g, ' ').split(/\s+/).includes(ean)
}
function sourceHost(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}
function isOwnHost(url: string, ownHosts: Set<string>) {
  const host = sourceHost(url)
  return !!host && [...ownHosts].some((own) => host === own || host.endsWith('.' + own))
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('products.write')
    const body = await request.json().catch(() => null) as { ean?: unknown; countryCode?: unknown } | null
    const ean = normalizeGtin(typeof body?.ean === 'string' ? body.ean : '')
    if (!validGtin(ean)) return NextResponse.json({ error: 'Controleer het EAN of GTIN.' }, { status: 400 })
    const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : 'NL'
    const existingProduct = await findExistingProduct({
      companyId: actor.companyId, ean, gtin: ean,
    })

    const [shops, search, feedResult] = await Promise.all([
      prisma.webshop.findMany({
        where: { companyId: actor.companyId, competitorId: null, isActive: true },
        select: { url: true }, take: 30,
      }),
      webSearch('"' + ean + '"', countryCode === 'UK' ? 'GB' : countryCode).catch((error) => {
        console.error('Online EAN search unavailable; continuing with own feed', error)
        return { candidates: [], provider: 'Online bron tijdelijk niet beschikbaar' }
      }),
      lookupOwnFeedByEan(actor.companyId, ean, countryCode).catch((error) => {
        console.error('EAN lookup in product feed failed', error)
        return null
      }),
    ])
    const ownHosts = new Set(shops.map((shop) => sourceHost(shop.url)).filter((host): host is string => !!host))
    const unique = new Set<string>()
    const ranked = search.candidates
      .filter((candidate) => sourceHost(candidate.url))
      .filter((candidate) => {
        try {
          const u = new URL(candidate.url)
          return u.protocol === 'https:' || u.protocol === 'http:'
        } catch { return false }
      })
      .filter((candidate) => {
        const key = candidate.url.split('#')[0].replace(/\/$/, '')
        if (unique.has(key)) return false
        unique.add(key)
        return true
      })
      .sort((a, b) =>
        Number(isOwnHost(b.url, ownHosts)) - Number(isOwnHost(a.url, ownHosts))
        || Number(hasExactEan(b.title + ' ' + (b.snippet ?? ''), ean))
           - Number(hasExactEan(a.title + ' ' + (a.snippet ?? ''), ean)),
      )
      .slice(0, 8) as Candidate[]

    // Search results are discovery hints only; actual product details require
    // an exact EAN/GTIN match on a source page.
    const selected = [
      ...ranked.filter((candidate) => isOwnHost(candidate.url, ownHosts)).slice(0, 2),
      ...ranked.filter((candidate) => !isOwnHost(candidate.url, ownHosts)).slice(0, 4),
    ]
    const outcomes = await Promise.allSettled(selected.map((candidate) =>
      lookupOnlineProduct(candidate.url, ean, isOwnHost(candidate.url, ownHosts)),
    ))
    const verified = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : [],
    )
    const sourceRecords: VerifiedSource[] = [
      ...(feedResult ? [{ product: feedResult, origin: 'OWN_FEED' as const }] : []),
      ...verified.map((product) => ({ product, origin: product.sourceType === 'OWN_SHOP' ? 'OWN_SHOP' as const : 'ONLINE' as const })),
    ]
    if (sourceRecords.length) return NextResponse.json({
      ...mergeVerifiedProductSources(sourceRecords, ean), existingProduct,
    })
    return NextResponse.json({ ean, existingProduct, found: false, source: search.provider, sources: [] })
  } catch (error) {
    console.error('Online EAN product recognition failed', error)
    return NextResponse.json({ error: 'Productgegevens konden tijdelijk niet worden opgehaald.' }, { status: 503 })
  }
}
