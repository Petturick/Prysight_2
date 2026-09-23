export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { selectedMarketCode } from '@/lib/market-context'
import { prisma } from '@/lib/prisma'
import { SynchronizationHub } from '@/components/SynchronizationHub'

export default async function SynchronisatiePage() {
  const actor = await requireAuthenticatedUser()
  const canReadFeeds = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('feeds.read')
  const canWriteFeeds = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('feeds.write')
  const canReadPrices = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('competitors.read')
  const canWritePrices = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('pricing.manage')
  const canEditCompetitors = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('competitors.write')
  if (!canReadFeeds && !canReadPrices) throw new Error('Onvoldoende rechten voor synchronisatiebeheer.')

  const [markets, marketCode] = await Promise.all([
    getActiveCompanyCountries(actor.companyId),
    selectedMarketCode(actor.companyId),
  ])
  const selected = markets.find(market => market.code.toUpperCase() === marketCode)
  const scopedCode = marketCode === 'ALL' ? 'ALL' : selected?.code.toUpperCase() ?? 'ALL'
  const [feeds, competitors] = await Promise.all([
    canReadFeeds ? prisma.feedSource.findMany({
      where: { companyId: actor.companyId, ...(scopedCode !== 'ALL' ? { countryCode: scopedCode } : {}) },
      orderBy: [{ countryCode: 'asc' }, { name: 'asc' }], take: 300,
      select: { id: true, name: true, countryCode: true, isActive: true, sourceType: true,
        syncFrequencyHours: true, lastRunStatus: true, lastRunAt: true, lastItemCount: true, lastErrorCount: true, syncError: true },
    }) : Promise.resolve([]),
    canReadPrices ? prisma.competitor.findMany({
      where: { companyId: actor.companyId, countryId: { in: scopedCode === 'ALL' ? markets.map(market => market.id) : [selected!.id] } },
      orderBy: [{ name: 'asc' }], take: 300,
      select: { id: true, name: true, isActive: true, countryId: true, checkFrequencyHours: true,
        lastCheckedAt: true, _count: { select: { offers: true } } },
    }) : Promise.resolve([]),
  ])

  return <div className="mx-auto max-w-[1200px] space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3eaf3] pb-4">
      <div>
        <Link href="/beheer" className="text-[12px] font-medium text-[#416b9d]">← Beheer</Link>
        <h1 className="mt-1 text-[22px] font-semibold text-[#20344b]">Synchronisatie</h1>
        <p className="mt-1 text-[12px] text-[#738298]">Productgegevens en marktprijzen op één plek bijwerken.</p>
      </div>
      <Link href="/instellingen/markten" className="secondary-action text-[12px]">Markten beheren</Link>
    </header>
    <SynchronizationHub key={scopedCode} marketName={selected?.name ?? 'Alle markten'}
      feeds={feeds.map(feed => ({ ...feed, lastRunAt: feed.lastRunAt?.toISOString() ?? null }))}
      competitors={competitors.map(competitor => ({
        id: competitor.id, name: competitor.name, isActive: competitor.isActive,
        frequency: competitor.checkFrequencyHours, lastCheckedAt: competitor.lastCheckedAt?.toISOString() ?? null,
        offerCount: competitor._count.offers,
      }))}
      canReadFeeds={canReadFeeds} canWriteFeeds={canWriteFeeds}
      canReadPrices={canReadPrices} canWritePrices={canWritePrices} canEditCompetitors={canEditCompetitors} />
  </div>
}
