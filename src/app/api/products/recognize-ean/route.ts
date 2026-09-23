export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { findExistingProduct } from '@/lib/product-duplicate'
import { normalizeGtin, validGtin } from '@/lib/gtin'
import { prisma } from '@/lib/prisma'
import { webSearch } from '@/lib/ean-competitor-discovery'
import { POST as previewProductUrl } from '@/app/api/products/preview-url/route'

type Candidate = { title: string; url: string; snippet?: string }

function hasExactEan(value: string, ean: string) {
  return value.replace(/\D/g, ' ').split(/\s+/).includes(ean)
}

function cleanTitle(value: string, ean: string) {
  return value
    .replace(/\s+[|–—]\s+.*$/, '')
    .replace(new RegExp('(?:^|\\s)' + ean + '(?:\\s|$)', 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function sourceHost(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

function isOwnHost(url: string, ownHosts: Set<string>) {
  const host = sourceHost(url)
  return !!host && [...ownHosts].some((own) => host === own || host.endsWith('.' + own))
}

function isUsableProductTitle(value: string) {
  return value.length >= 7 && /[a-zà-ÿ]{3,}/i.test(value) && !/^(?:product|ean|gtin|zoekresultaten|search results)$/i.test(value)
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('products.write')
    const body = await request.json().catch(() => null) as { ean?: unknown; countryCode?: unknown } | null
    const ean = normalizeGtin(typeof body?.ean === 'string' ? body.ean : '')
    if (!validGtin(ean)) return NextResponse.json({ error: 'Controleer het EAN of GTIN.' }, { status: 400 })
    const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : 'NL'

    const existingProduct = await findExistingProduct({
      companyId: actor.companyId,
      ean,
      gtin: ean,
    })
    if (existingProduct) {
      return NextResponse.json({ existingProduct, ean, found: true, source: 'EXISTING' })
    }

    const [shops, search] = await Promise.all([
      prisma.webshop.findMany({
        where: { companyId: actor.companyId, competitorId: null, isActive: true },
        select: { url: true },
        take: 30,
      }),
      webSearch('"' + ean + '"', countryCode === 'UK' ? 'GB' : countryCode),
    ])
    const ownHosts = new Set(shops.map((shop) => sourceHost(shop.url)).filter((host): host is string => !!host))
    const candidates = search.candidates
      .filter((candidate) => hasExactEan(candidate.title + ' ' + (candidate.snippet ?? ''), ean))
      .filter((candidate) => sourceHost(candidate.url))
      .slice(0, 10) as Candidate[]

    // A search result is not proof of an own selling price. Only an identified
    // company webshop may supply ownPrice or ownUrl to the product form.
    for (const candidate of candidates.filter((candidate) => isOwnHost(candidate.url, ownHosts)).slice(0, 3)) {
      try {
        const preview = await previewProductUrl(new Request('https://prysight.local/api/products/preview-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: candidate.url }),
        }))
        if (!preview.ok) continue
        const payload = await preview.json() as Record<string, unknown>
        const recognizedEan = normalizeGtin(typeof payload.ean === 'string' ? payload.ean : '')
        // Do not copy a different product's identifiers or price into this EAN.
        if (recognizedEan && recognizedEan !== ean) continue
        const name = typeof payload.name === 'string' ? payload.name.trim() : ''
        const searchTitle = cleanTitle(candidate.title, ean)
        if (!isUsableProductTitle(name) && !isUsableProductTitle(searchTitle)) continue
        return NextResponse.json({
          ...payload,
          ean,
          name: isUsableProductTitle(name) ? name : searchTitle,
          // A price may only be prefilled when the source explicitly confirms this EAN.
          ownPrice: recognizedEan === ean ? payload.ownPrice ?? null : null,
          articleNumber: recognizedEan === ean ? payload.articleNumber ?? null : null,
          ownUrl: candidate.url,
          found: true,
          source: 'OWN_SHOP',
        })
      } catch (error) {
        console.warn('Own-shop EAN product preview unavailable', {
          companyId: actor.companyId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const named = candidates.map((candidate) => ({
      name: cleanTitle(candidate.title, ean),
      url: candidate.url,
    })).find((candidate) => isUsableProductTitle(candidate.name))
    if (named) {
      return NextResponse.json({
        ean,
        name: named.name,
        articleNumber: null,
        ownPrice: null,
        ownUrl: null,
        found: true,
        source: 'EAN_SEARCH',
      })
    }
    return NextResponse.json({ ean, found: false, source: search.provider })
  } catch (error) {
    console.error('EAN product recognition failed', error)
    return NextResponse.json({ error: 'Automatische productherkenning is tijdelijk niet beschikbaar.' }, { status: 503 })
  }
}
