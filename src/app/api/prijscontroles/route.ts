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
  const options = {
    competitorOfferId: typeof body.competitorOfferId === 'string' ? body.competitorOfferId : undefined,
    productId: typeof body.productId === 'string' ? body.productId : undefined,
    force: body.force === true,
  }

  if (requestedCompanyId) {
    const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, include: { license: true } })
    if (!company?.license) return NextResponse.json({ error: 'Organisatie niet gevonden of zonder licentie.' }, { status: 404 })
    if (!hasLicenseAccess(company.license)) return NextResponse.json({ error: 'De licentie van deze organisatie staat prijscontrole niet toe.' }, { status: 403 })

    const settingsPromise = discoveryEnabled || pricingEnabled
      ? getCompanyProductSettings(company.id)
      : Promise.resolve(undefined)
    const [monitoring, settings] = await Promise.all([
      runDuePriceChecks({ companyId: company.id, limit, ...options }),
      settingsPromise,
    ])
    const discovery = discoveryEnabled ? await runDiscoveryBatch(company.id, discoveryLimit, settings) : null
    const matching = discoveryEnabled ? await reconcileMeasuredMatches(company.id) : null
    const pricing = pricingEnabled ? await runPricingQueue(company.id, 100, settings) : null
    const execution = pricingEnabled ? await runPricingExecutor(company.id, 20, settings) : null
    return NextResponse.json({ companyId: company.id, monitoring, discovery, matching, pricing, execution }, { status: 200 })
  }

  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, include: { license: true }, orderBy: { createdAt: 'asc' } })
  const eligible = companies.filter((company) => company.license && hasLicenseAccess(company.license))
  const perCompanyLimit = eligible.length ? Math.max(1, Math.ceil(limit / eligible.length)) : limit
  const results: Array<{ companyId: string; due: number; successful: number; failed: number; discoveryCreated?: number; matchesPromoted?: number; queued?: number; applied?: number; error?: string }> = []

  for (const company of eligible) {
    try {
      const settingsPromise = discoveryEnabled || pricingEnabled
        ? getCompanyProductSettings(company.id)
        : Promise.resolve(undefined)
      const [monitoring, settings] = await Promise.all([
        runDuePriceChecks({ companyId: company.id, limit: perCompanyLimit, ...options }),
        settingsPromise,
      ])
      const discovery = discoveryEnabled ? await runDiscoveryBatch(company.id, discoveryLimit, settings) : null
      const matching = discoveryEnabled ? await reconcileMeasuredMatches(company.id) : null
      const pricing = pricingEnabled ? await runPricingQueue(company.id, 100, settings) : null
      const execution = pricingEnabled ? await runPricingExecutor(company.id, 20, settings) : null
      results.push({ companyId: company.id, due: monitoring.due, successful: monitoring.successful, failed: monitoring.failed, discoveryCreated: discovery?.created ?? 0, matchesPromoted: matching?.promoted ?? 0, queued: pricing?.queued ?? 0, applied: execution?.applied ?? 0 })
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
