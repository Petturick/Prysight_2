import { NextResponse } from 'next/server'
import { requireWritableUser } from '@/lib/authz'
import { discoverCompetitorUrlsByEan } from '@/lib/ean-competitor-discovery'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWritableUser()
    const { id } = await params
    const product = await prisma.product.findFirst({
      where: { id, companyId: user.companyId, isActive: true },
      include: {
        productMarkets: {
          where: { isActive: true },
          include: { country: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })

    if (!product) return NextResponse.json({ error: 'Product niet gevonden.' }, { status: 404 })
    if (!product.ean) return NextResponse.json({ skipped: true, reason: 'EAN ontbreekt' })

    const marketCountry = product.productMarkets[0]?.country
    const fallbackCompanyCountry = marketCountry ? null : await prisma.companyCountry.findFirst({
      where: { companyId: user.companyId, isActive: true, country: { isActive: true } },
      include: { country: true },
      orderBy: { createdAt: 'asc' },
    })
    const country = marketCountry ?? fallbackCompanyCountry?.country
    if (!country) return NextResponse.json({ skipped: true, reason: 'Geen actieve markt beschikbaar' })

    const result = await discoverCompetitorUrlsByEan({ companyId: user.companyId, productId: product.id, countryId: country.id })
    const provider = process.env.SERPER_API_KEY ? 'Serper' : process.env.BRAVE_SEARCH_API_KEY ? 'Brave Search' : 'web fallback'

    return NextResponse.json({ ...result, provider, country: country.code })
  } catch (error) {
    console.error('Automatic EAN discovery endpoint failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'EAN discovery mislukt.' }, { status: 500 })
  }
}
