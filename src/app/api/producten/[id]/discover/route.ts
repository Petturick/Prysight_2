import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { discoverCompetitorUrlsByEan } from '@/lib/ean-competitor-discovery'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('competitors.write')
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
    if (!product.ean?.trim() && !product.gtin?.trim()) return NextResponse.json({ skipped: true, reason: 'EAN of GTIN ontbreekt' })

    const body = await request.json().catch(() => ({})) as { countryId?: unknown }
    const countryOverride = typeof body.countryId === 'string' && body.countryId.trim()
      ? await requireLicensedCountry(user.companyId, body.countryId.trim())
      : null

    const marketCountry = countryOverride ?? product.productMarkets[0]?.country
    const fallbackCompanyCountry = marketCountry ? null : await prisma.companyCountry.findFirst({
      where: { companyId: user.companyId, isActive: true, country: { isActive: true } },
      include: { country: true },
      orderBy: { createdAt: 'asc' },
    })
    const country = marketCountry ?? fallbackCompanyCountry?.country
    if (!country) return NextResponse.json({ skipped: true, reason: 'Geen actieve markt beschikbaar' })

    const result = await discoverCompetitorUrlsByEan({ companyId: user.companyId, productId: product.id, countryId: country.id })
    return NextResponse.json({ ...result, country: country.code })
  } catch (error) {
    console.error('Automatic EAN discovery endpoint failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'EAN discovery mislukt.' }, { status: 500 })
  }
}
