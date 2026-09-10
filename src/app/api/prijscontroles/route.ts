export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { requireAuthenticatedUser } from '@/lib/authz'
import { hasLicenseAccess } from '@/lib/licensing'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { prisma } from '@/lib/prisma'

function readLimit(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 40
  return Math.min(Math.max(Math.round(parsed), 1), 200)
}

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

  const requestedCompanyId = typeof body.companyId === 'string' && body.companyId.trim() ? body.companyId.trim() : null
  const limit = readLimit(body.limit)
  const options = {
    competitorOfferId: typeof body.competitorOfferId === 'string' ? body.competitorOfferId : undefined,
    productId: typeof body.productId === 'string' ? body.productId : undefined,
    force: body.force === true,
  }

  if (requestedCompanyId) {
    const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, include: { license: true } })
    if (!company?.license) return NextResponse.json({ error: 'Organisatie niet gevonden of zonder licentie.' }, { status: 404 })
    if (!hasLicenseAccess(company.license)) return NextResponse.json({ error: 'De licentie van deze organisatie staat prijscontrole niet toe.' }, { status: 403 })
    const summary = await runDuePriceChecks({ companyId: company.id, limit, ...options })
    return NextResponse.json({ companyId: company.id, ...summary }, { status: 200 })
  }

  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, include: { license: true }, orderBy: { createdAt: 'asc' } })
  const eligible = companies.filter((company) => company.license && hasLicenseAccess(company.license))
  if (eligible.length === 0) return NextResponse.json({ companies: 0, requested: limit, due: 0, successful: 0, failed: 0, results: [] })

  const perCompanyLimit = Math.max(1, Math.ceil(limit / eligible.length))
  const results: Array<{ companyId: string; due: number; successful: number; failed: number; error?: string }> = []
  for (const company of eligible) {
    try {
      const summary = await runDuePriceChecks({ companyId: company.id, limit: perCompanyLimit, ...options })
      results.push({ companyId: company.id, due: summary.due, successful: summary.successful, failed: summary.failed })
    } catch (error) {
      results.push({ companyId: company.id, due: 0, successful: 0, failed: 0, error: error instanceof Error ? error.message : 'Prijscontrole mislukt.' })
    }
  }

  return NextResponse.json({
    companies: eligible.length,
    requested: limit,
    due: results.reduce((sum, item) => sum + item.due, 0),
    successful: results.reduce((sum, item) => sum + item.successful, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
    results,
  })
}
