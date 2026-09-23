import { FeedSourceType, FeedSyncStatus } from '@/generated/prisma/client'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { ownProductSourceKey } from '@/lib/own-product-url-sync'
import { dispatchOwnProductSync } from '@/lib/own-product-sync-dispatch'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
const FREQUENCIES = [6, 12, 24, 48, 168, 8760]

async function resolveProductMarket(companyId: string, productId: string, countryId: string) {
  await requireLicensedCountry(companyId, countryId)
  const market = await prisma.productMarket.findFirst({
    where: { companyId, productId, countryId, isActive: true, product: { isActive: true } },
    include: { product: { select: { articleNumber: true } }, country: { select: { code: true } } },
  })
  if (!market?.ownUrl?.trim()) throw new Error('Sla eerst een eigen product URL op bij de productinstellingen voor deze markt.')
  await assertSafeRemoteHttpUrl(market.ownUrl)
  return market
}

export async function GET(request: Request) {
  try {
    const actor = await requirePermission('products.read')
    const params = new URL(request.url).searchParams
    const productId = params.get('productId')?.trim() ?? ''
    const countryId = params.get('countryId')?.trim() ?? ''
    if (!productId || !countryId) return NextResponse.json({ error: 'Product en markt ontbreken.' }, { status: 400 })
    const market = await prisma.productMarket.findFirst({
      where: { companyId: actor.companyId, productId, countryId, product: { isActive: true } },
      select: { id: true },
    })
    if (!market) return NextResponse.json({ error: 'Product niet gevonden voor deze markt.' }, { status: 404 })
    await requireLicensedCountry(actor.companyId, countryId)
    const source = await prisma.feedSource.findUnique({
      where: { companyId_sourceKey: { companyId: actor.companyId, sourceKey: ownProductSourceKey(productId, countryId) } },
      select: { id: true, syncFrequencyHours: true, lastRunStatus: true, lastRunAt: true, syncError: true },
    })
    return NextResponse.json({ source: source ? { ...source, lastRunAt: source.lastRunAt?.toISOString() ?? null } : null },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bron niet beschikbaar.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 403 })
    const actor = await requirePermission('products.write')
    const body = await request.json().catch(() => null) as {
      productId?: unknown; countryId?: unknown; action?: unknown; frequency?: unknown
    } | null
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
    const countryId = typeof body?.countryId === 'string' ? body.countryId.trim() : ''
    const action = body?.action
    const frequency = Number(body?.frequency)
    if (!productId || !countryId || !['configure', 'sync'].includes(String(action))) {
      return NextResponse.json({ error: 'Kies een product, markt en actie.' }, { status: 400 })
    }
    if (action === 'configure' && !FREQUENCIES.includes(frequency)) {
      return NextResponse.json({ error: 'Ongeldige synchronisatiefrequentie.' }, { status: 400 })
    }
    const market = await resolveProductMarket(actor.companyId, productId, countryId)
    const sourceKey = ownProductSourceKey(productId, countryId)
    const existing = await prisma.feedSource.findUnique({
      where: { companyId_sourceKey: { companyId: actor.companyId, sourceKey } },
      select: { id: true, lastRunStatus: true, url: true, syncFrequencyHours: true },
    })
    if (existing?.lastRunStatus === FeedSyncStatus.RUNNING) {
      return NextResponse.json({ error: 'Deze productbron wordt al gesynchroniseerd.' }, { status: 409 })
    }
    const urlChanged = Boolean(existing && existing.url !== market.ownUrl)
    const source = await prisma.feedSource.upsert({
      where: { companyId_sourceKey: { companyId: actor.companyId, sourceKey } },
      create: {
        companyId: actor.companyId, sourceKey,
        name: `Product URL ${market.product.articleNumber} (${market.country.code})`,
        sourceType: FeedSourceType.API, isMainFeed: false,
        countryCode: market.country.code, url: market.ownUrl,
        isActive: true, syncFrequencyHours: action === 'configure' ? frequency : 8760,
        config: { kind: 'OWN_PRODUCT_URL', productId, countryId },
      },
      update: {
        url: market.ownUrl, countryCode: market.country.code, isActive: true,
        config: { kind: 'OWN_PRODUCT_URL', productId, countryId },
        ...(action === 'configure' ? { syncFrequencyHours: frequency } : {}),
        ...(urlChanged ? { lastRunStatus: FeedSyncStatus.IDLE, syncError: null } : {}),
      },
      select: { id: true, syncFrequencyHours: true, lastRunStatus: true, lastRunAt: true, syncError: true },
    })
    if (action === 'configure') {
      return NextResponse.json({ source: { ...source, lastRunAt: source.lastRunAt?.toISOString() ?? null } })
    }
    const claim = await prisma.feedSource.updateMany({
      where: { id: source.id, companyId: actor.companyId, isActive: true,
        lastRunStatus: { not: FeedSyncStatus.RUNNING } },
      data: { lastRunStatus: FeedSyncStatus.RUNNING, syncError: null },
    })
    if (claim.count !== 1) return NextResponse.json({ error: 'Bron wordt al verwerkt.' }, { status: 409 })
    try {
      await dispatchOwnProductSync(request, source.id)
      return NextResponse.json({ accepted: true, source: { ...source, lastRunStatus: 'RUNNING' } }, { status: 202 })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Synchronisatie kon niet worden gestart.'
      await prisma.feedSource.updateMany({
        where: { id: source.id, companyId: actor.companyId, lastRunStatus: FeedSyncStatus.RUNNING },
        data: { lastRunStatus: FeedSyncStatus.FAILED, syncError: message, lastRunAt: new Date() },
      })
      return NextResponse.json({ error: message }, { status: 503 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Product URL synchronisatie mislukt.' }, { status: 403 })
  }
}
