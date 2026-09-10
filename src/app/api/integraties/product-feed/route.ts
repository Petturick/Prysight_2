export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FeedSourceType } from '@/generated/prisma/client'
import { verifyBearerSecret } from '@/lib/api-auth'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { ingestCanonicalProducts, type CanonicalFeedProduct } from '@/lib/feed-ingestion'
import { hasLicenseAccess } from '@/lib/licensing'
import { prisma } from '@/lib/prisma'

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/integraties/product-feed',
    method: 'POST',
    authentication: 'Bearer DATA_FEED_API_KEY',
    body: { companyId: 'jouw-company-id', sourceKey: 'erp:bron', sourceName: 'ERP productfeed', products: [] },
    requiredProductFields: ['articleNumber', 'name'],
    optionalProductFields: ['productGroup', 'ean', 'gtin', 'ownPrice', 'currency', 'stockStatus', 'packagingUnit', 'packagingQty', 'isActive'],
    compatibility: 'Zonder companyId blijft de bestaande standaardorganisatie actief voor bestaande integraties.',
  })
}

export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'DATA_FEED_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })

  const body = await request.json().catch(() => null) as { companyId?: string; sourceKey?: string; sourceName?: string; countryCode?: string; products?: CanonicalFeedProduct[] } | null
  if (!body?.products || !Array.isArray(body.products)) return NextResponse.json({ error: 'Body moet een products array bevatten.' }, { status: 400 })
  if (body.products.length > 5000) return NextResponse.json({ error: 'Maximaal 5000 producten per request.' }, { status: 413 })

  const companyId = body.companyId?.trim() || request.headers.get('x-prysight-company-id')?.trim() || DEFAULT_COMPANY_ID
  const company = await prisma.company.findFirst({
    where: { id: companyId, status: 'ACTIVE' },
    include: { license: true },
  })
  if (!company?.license) return NextResponse.json({ error: 'Organisatie niet gevonden of zonder licentie.' }, { status: 404 })
  if (!hasLicenseAccess(company.license)) return NextResponse.json({ error: 'De licentie van deze organisatie staat synchronisatie niet toe.' }, { status: 403 })

  try {
    const result = await ingestCanonicalProducts({
      companyId: company.id,
      sourceKey: body.sourceKey?.trim() || 'api:product-feed',
      sourceName: body.sourceName?.trim() || 'API productfeed',
      sourceType: FeedSourceType.API,
      countryCode: body.countryCode?.trim().toUpperCase() || 'GLOBAL',
      products: body.products,
      config: { authenticatedAs: 'DATA_FEED_API_KEY', companyId: company.id },
    })
    return NextResponse.json({ companyId: company.id, ...result }, { status: result.errors > 0 ? 207 : 200 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Productfeed synchroniseren mislukt.' }, { status: 422 })
  }
}
