export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FeedSourceType } from '@/generated/prisma/client'
import { verifyBearerSecret } from '@/lib/api-auth'
import { ingestCanonicalProducts, type CanonicalFeedProduct } from '@/lib/feed-ingestion'

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/integraties/product-feed',
    method: 'POST',
    authentication: 'Bearer DATA_FEED_API_KEY',
    body: { sourceKey: 'erp:engels', sourceName: 'ERP Engels', products: [] },
    requiredProductFields: ['articleNumber', 'name'],
    optionalProductFields: ['productGroup', 'ean', 'gtin', 'ownPrice', 'currency', 'stockStatus', 'packagingUnit', 'packagingQty', 'isActive'],
  })
}

export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'DATA_FEED_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const body = await request.json().catch(() => null) as { sourceKey?: string; sourceName?: string; countryCode?: string; products?: CanonicalFeedProduct[] } | null
  if (!body?.products || !Array.isArray(body.products)) return NextResponse.json({ error: 'Body moet een products array bevatten.' }, { status: 400 })
  if (body.products.length > 5000) return NextResponse.json({ error: 'Maximaal 5000 producten per request.' }, { status: 413 })

  try {
    const result = await ingestCanonicalProducts({
      sourceKey: body.sourceKey?.trim() || 'api:product-feed',
      sourceName: body.sourceName?.trim() || 'API productfeed',
      sourceType: FeedSourceType.API,
      countryCode: body.countryCode?.trim().toUpperCase() || 'GLOBAL',
      products: body.products,
    })
    return NextResponse.json(result, { status: result.errors > 0 ? 207 : 200 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Productfeed synchroniseren mislukt.' }, { status: 422 })
  }
}
