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
import { getCompanyProductSettings } from '@/lib/product-settings'
import { prisma } from '@/lib/prisma'

function readLimit(value: unknown, fallback = 40, max = 200) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.round(parsed), 1), max)
}

type CycleOptions = {
  limit: number
  discoveryEnabled: boolean
  pricingEnabled: boolean
  discoveryLimit: number
  competitorOfferId?: string
  productId?: string
  force: boolean
}

async function runCompanyCycle(companyId: string, options: CycleOptions) {
  const settingsPromise = options.discoveryEnabled || options.pricingEnabled
    ? getCompanyProductSettings(companyId)
    : Promise.resolve(undefined)

  const [monitoring, settings] = await Promise.all([
    runDuePriceChecks({
      companyId,
      limit: options.limit,
      competitorOfferId: options.competitorOfferId,
      productId: options.productId,
      force: options.force,
    }),
    settingsPromise,
  ])

  const discovery = options.discoveryEnabled
    ? await runDiscoveryBatch(companyId, options.discoveryLimit, settings)
    : null
  const matching = options.discoveryEnabled
    ? await reconcileMeasuredMatches(companyId)
    : null
  const pricing = options.pricingEnabled
    ? await runPricingQueue(companyId, 100, settings)
    : null
  const execution = options.pricingEnabled
    ? await runPricingExecutor(companyId, 20, settings)
    : null

  return { monitoring, discovery, matching, pricing, execution }
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
  const discoveryEnabled = body.smartDiscovery === true
  const pricingEnabled = body.smartPricing === true
  const discoveryLimit = readLimit(body.discoveryLimit, 4, 12)
  const baseOptions = {
    discoveryEnabled,
    pricingEnabled,
    discoveryLimit,
    competitorOfferId: typeof body.competitorOfferId === 'string' ? body.competitorOfferId : undefined,
    productId: typeof body.productId === 'string' ? body.productId : undefined,
    force: body.force === true,
  }

  if (requestedCompanyId) {
    const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, include: { license: true } })
    if (!company?.license) return NextResponse.json({ error: 'Organisatie niet gevonden of zonder licentie.' }, { status: 404 })
    if (!hasLicenseAccess(company.license)) return NextResponse.json({ error: 'De licentie van deze organisatie staat prijscontrole niet toe.' }, { status: 403 })
    const cycle = await runCompanyCycle(company.id, { ...baseOptions, limit })
    return NextResponse.json({ companyId: company.id, ...cycle }, { status: 200 })
  }

  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, include: { license: true }, orderBy: { createdAt: 'asc' } })
  const eligible = companies.filter((company) => company.license && hasLicenseAccess(company.license))
  const perCompanyLimit = eligible.length ? Math.max(1, Math.ceil(limit / eligible.length)) : limit
  const results: Array<{ companyId: string; due: number; successful: number; failed: number; discoveryCreated?: number; matchesPromoted?: number; queued?: number; applied?: number; error?: string }> = []

  for (const company of eligible) {
    try {
      const cycle = await runCompanyCycle(company.id, { ...baseOptions, limit: perCompanyLimit })
      results.push({
        companyId: company.id,
        due: cycle.monitoring.due,
        successful: cycle.monitoring.successful,
        failed: cycle.monitoring.failed,
        discoveryCreated: cycle.discovery?.created ?? 0,
        matchesPromoted: cycle.matching?.promoted ?? 0,
        queued: cycle.pricing?.queued ?? 0,
        applied: cycle.execution?.applied ?? 0,
      })
    } catch (error) {
      results.push({ companyId: company.id, due: 0, successful: 0, failed: 0, error: error instanceof Error ? error.message : 'Background verwerking mislukt.' })
    }
  }

  return NextResponse.json({
    companies: eligible.length,
    requested: limit,
    due: results.reduce((sum,item)=>sum+item.due,0),
    successful: results.reduce((sum,item)=>sum+item.successful,0),
    failed: results.reduce((sum,item)=>sum+item.failed,0),
    discoveryCreated: results.reduce((sum,item)=>sum+(item.discoveryCreated??0),0),
    matchesPromoted: results.reduce((sum,item)=>sum+(item.matchesPromoted??0),0),
    queued: results.reduce((sum,item)=>sum+(item.queued??0),0),
    applied: results.reduce((sum,item)=>sum+(item.applied??0),0),
    results,
  })
}
