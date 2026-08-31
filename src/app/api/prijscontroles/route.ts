export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const competitorOfferId = searchParams.get('competitorOfferId') ?? undefined
  const productId = searchParams.get('productId') ?? undefined
  const checks = await prisma.priceCheck.findMany({ where: { companyId: DEFAULT_COMPANY_ID, competitorOfferId, competitorOffer: productId ? { productMatch: { productId } } : undefined }, include: { competitorOffer: { include: { competitor: true, productMatch: { include: { product: true } } } } }, orderBy: { checkedAt: 'desc' }, take: 200 })
  return NextResponse.json(checks)
}

export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'PRICE_MONITOR_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  let body: Record<string, unknown> = {}
  try { body = await request.json() as Record<string, unknown> } catch { body = {} }
  const summary = await runDuePriceChecks({ limit: typeof body.limit === 'number' ? body.limit : 40, competitorOfferId: typeof body.competitorOfferId === 'string' ? body.competitorOfferId : undefined, productId: typeof body.productId === 'string' ? body.productId : undefined, force: body.force === true })
  return NextResponse.json(summary, { status: 200 })
}
