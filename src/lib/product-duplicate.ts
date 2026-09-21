import { prisma } from '@/lib/prisma'

export type ExistingProductMatch = {
  id: string
  articleNumber: string
  name: string
  ean: string | null
  gtin: string | null
  reason: 'ARTICLE_NUMBER' | 'EAN' | 'GTIN' | 'URL'
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

function canonicalUrl(value: string | null | undefined) {
  const raw = clean(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    url.hash = ''
    const trackingPrefixes = ['utm_', 'gad_', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid']
    for (const key of [...url.searchParams.keys()]) {
      if (trackingPrefixes.some((prefix) => key.toLowerCase().startsWith(prefix))) url.searchParams.delete(key)
    }
    const query = url.searchParams.toString()
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}${query ? `?${query}` : ''}`
  } catch {
    return raw
  }
}

function asMatch(product: { id: string; articleNumber: string; name: string; ean: string | null; gtin: string | null }, reason: ExistingProductMatch['reason']): ExistingProductMatch {
  return { ...product, reason }
}

export async function findExistingProduct(input: {
  companyId: string
  articleNumber?: string | null
  ean?: string | null
  gtin?: string | null
  ownUrl?: string | null
  excludeProductId?: string | null
}) {
  const select = { id: true, articleNumber: true, name: true, ean: true, gtin: true } as const
  const articleNumber = clean(input.articleNumber)
  const ean = clean(input.ean)
  const gtin = clean(input.gtin)
  const ownUrl = canonicalUrl(input.ownUrl)
  const exclude = input.excludeProductId ? { NOT: { id: input.excludeProductId } } : {}

  if (articleNumber) {
    const product = await prisma.product.findFirst({
      where: { companyId: input.companyId, articleNumber, isActive: true, ...exclude },
      select,
    })
    if (product) return asMatch(product, 'ARTICLE_NUMBER')
  }

  if (ean) {
    const product = await prisma.product.findFirst({
      where: { companyId: input.companyId, ean, isActive: true, ...exclude },
      select,
    })
    if (product) return asMatch(product, 'EAN')
  }

  if (gtin) {
    const product = await prisma.product.findFirst({
      where: { companyId: input.companyId, gtin, isActive: true, ...exclude },
      select,
    })
    if (product) return asMatch(product, 'GTIN')
  }

  if (ownUrl) {
    const candidates = await prisma.productMarket.findMany({
      where: {
        companyId: input.companyId,
        isActive: true,
        ownUrl: { not: null },
        product: { isActive: true, ...exclude },
      },
      select: { ownUrl: true, product: { select } },
      take: 100,
    })
    const product = candidates.find((candidate) => canonicalUrl(candidate.ownUrl) === ownUrl)?.product
    if (product) return asMatch(product, 'URL')
  }

  return null
}
