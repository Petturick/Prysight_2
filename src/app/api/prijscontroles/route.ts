export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { requireAuthenticatedUser } from '@/lib/authz'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser()
    const { searchParams } = new URL(request.url)
    const competitorOfferId = searchParams.get('competitorOfferId') ?? undefined
    const productId = searchParams.get('productId') ?? undefined
    const checks = await prisma.priceCheck.findMany({
      where: { companyId: actor.companyId, competitorOfferId, competitorOffer: productId ? { productMatch: { productId } } : undefined },
      include: { competitorOffer: { include: { competitor: true, productMatch: { include: { product: true } } } } },
      orderBy: { checkedAt: 'desc' }, take: 200,
    })
    return NextResponse.json(checks)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'PRICE_MONITOR_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  let body: Record<string, unknown> = {}
  try { body = await request.json() as Record<string, unknown> } catch { body = {} }
  const requestedCompanyId = typeof body.companyId === 'string' && body.companyId.trim() ? body.companyId.trim() : DEFAULT_COMPANY_ID
  const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'Organisatie niet gevonden of niet actief.' }, { status: 404 })
  const summary = await runDuePriceChecks({ companyId: company.id, limit: typeof body.limit === 'number' ? body.limit : 40, competitorOfferId: typeof body.competitorOfferId === 'string' ? body.competitorOfferId : undefined, productId: typeof body.productId === 'string' ? body.productId : undefined, force: body.force === true })
  return NextResponse.json(summary, { status: 200 })
}
