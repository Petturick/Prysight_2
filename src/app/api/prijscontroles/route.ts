export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { requireAuthenticatedUser } from '@/lib/authz'
import { runDiscoveryBatch } from '@/lib/discovery-batch'
import { hasLicenseAccess } from '@/lib/licensing'
import { reconcileMeasuredMatches } from '@/lib/match-reconciliation'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { runPricingExecutor } from '@/lib/pricing-executor'
import { runPricingQueue } from '@/lib/pricing-queue'
import { prisma } from '@/lib/prisma'

function readLimit(value: unknown, fallback = 40, max = 200) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.round(parsed), 1), max)
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

async function processCompany(companyId: string, limit: number, discoveryLimit: number, discoveryEnabled: boolean, pricingEnabled: boolean, options: { competitorOfferId?: string; productId?: string; force: boolean }) {
  const monitoring = await runDuePriceChecks({ companyId, limit, ...options })
  const discovery = discoveryEnabled ? await runDiscoveryBatch(companyId, discoveryLimit) : null
  const matching = discoveryEnabled ? await reconcileMeasuredMatches(companyId) : null
  const pricing = pricingEnabled ? await runPricingQueue(companyId) : null
  const execution = pricingEnabled ? await runPricingExecutor(companyId) : null
  return { monitoring, discovery, matching, pricing, execution }
}

export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'PRICE_MONITOR_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  let body: Record<string, unknown> = {}
  try { body = await request.json() as Record<string, unknown> } catch { body = {} }

  const requestedCompanyId = typeof body.companyId === 'string' && body.companyId.trim() ? body.companyId.trim() : null
  const limit = readLimit(body.limit)
  const discoveryEnabled = body.smartDiscovery === true
  const pricingEnabled = body.smartPricing === true
  const discoveryLimit = readLimit(body.discoveryLimit, 4, 12)
  const options = {
    competitorOfferId: typeof body.competitorOfferId === 'string' ? body.competitorOfferId : undefined,
    productId: typeof body.productId === 'string' ? body.productId : undefined,
    force: body.force === true,
  }

  if (requestedCompanyId) {
    const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, include: { license: true } })
    if (!company?.license) return NextResponse.json({ error: 'Organisatie niet gevonden of zonder licentie.' }, { status: 404 })
    if (!hasLicenseAccess(company.license)) return NextResponse.json({ error: 'De licentie van deze organisatie staat prijscontrole niet toe.' }, { status: 403 })
    const result = await processCompany(company.id, limit, discoveryLimit, discoveryEnabled, pricingEnabled, options)
    return NextResponse.json({ companyId: company.id, ...result }, { status: 200 })
  }

  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, include: { license: true }, orderBy: { createdAt: 'asc' } })
  const eligible = companies.filter((company) => company.license && hasLicenseAccess(company.license))
  const perCompanyLimit = eligible.length ? Math.max(1, Math.ceil(limit / eligible.length)) : limit
  const results: Array<{ companyId: string; monitoring?: { due: number; successful: number; failed: number }; discoveryCreated?: number; matchesPromoted?: number; queued?: number; applied?: number; error?: string }> = []

  for (const company of eligible) {
    try {
      const result = await processCompany(company.id, perCompanyLimit, discoveryLimit, discoveryEnabled, pricingEnabled, options)
      results.push({ companyId: company.id, monitoring: { due: result.monitoring.due, successful: result.monitoring.successful, failed: result.monitoring.failed }, discoveryCreated: result.discovery?.created ?? 0, matchesPromoted: result.matching?.promoted ?? 0, queued: result.pricing?.queued ?? 0, applied: result.execution?.applied ?? 0 })
    } catch (error) {
      results.push({ companyId: company.id, error: error instanceof Error ? error.message : 'Background verwerking mislukt.' })
    }
  }

  return NextResponse.json({
    companies: eligible.length,
    requested: limit,
    due: results.reduce((sum, item) => sum + (item.monitoring?.due ?? 0), 0),
    successful: results.reduce((sum, item) => sum + (item.monitoring?.successful ?? 0), 0),
    failed: results.reduce((sum, item) => sum + (item.monitoring?.failed ?? 0), 0),
    discoveryCreated: results.reduce((sum, item) => sum + (item.discoveryCreated ?? 0), 0),
    matchesPromoted: results.reduce((sum, item) => sum + (item.matchesPromoted ?? 0), 0),
    queued: results.reduce((sum, item) => sum + (item.queued ?? 0), 0),
    applied: results.reduce((sum, item) => sum + (item.applied ?? 0), 0),
    results,
  })
}
