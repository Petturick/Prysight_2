export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { selectedMarketCode } from '@/lib/market-context'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { FeedConnectForm } from '@/components/FeedConnectForm'
import { FeedSourceManager } from '@/components/FeedSourceManager'
import { requirePermission } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function InstellingenFeedbeheerPage() {
  const actor = await requirePermission('feeds.read')
  const marketCode = await selectedMarketCode(actor.companyId)
  const canManage = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('feeds.write')

  const result = await safeDatabaseQuery(() => prisma.feedSource.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
    take: 500,
    select: {
      id: true,
      name: true,
      url: true,
      isActive: true,
      syncFrequencyHours: true,
      syncError: true,
      lastRunStatus: true,
      sourceType: true,
      lastItemCount: true,
      lastErrorCount: true,
      countryCode: true,
      format: true,
      lastRunAt: true,
    },
  }), [])

  const sources = result.data
  const active = sources.filter((source) => source.isActive).length
  const inactive = sources.filter((source) => !source.isActive).length
  const failed = sources.filter((source) => source.lastRunStatus === 'FAILED').length
  const countries = new Set(sources.map((source) => source.countryCode)).size

  return (
    <div className="space-y-5">
      {!result.available ? <DatabaseNotice /> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex justify-end gap-2 px-5 py-3"><Link href="/feeds/map" className="secondary-action">Mapping</Link><Link href="/feeds/data" className="secondary-action">Data</Link></div>
        <div className="grid border-t border-[#e7ebf0] sm:grid-cols-4">
          <div className="px-5 py-4 sm:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Totaal</p>
            <p className="mt-1 text-[24px] font-semibold text-[#172033]">{formatNumber(sources.length)}</p>
          </div>
          <div className="border-t border-[#e7ebf0] px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Actief</p>
            <p className="mt-1 text-[24px] font-semibold text-[#1f7548]">{formatNumber(active)}</p>
          </div>
          <div className="border-t border-[#e7ebf0] px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Inactief</p>
            <p className="mt-1 text-[24px] font-semibold text-[#667085]">{formatNumber(inactive)}</p>
          </div>
          <div className="border-t border-[#e7ebf0] px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Landen, controle nodig</p>
            <p className="mt-1 text-[24px] font-semibold text-[#172033]">{formatNumber(countries)} <span className={failed ? 'text-[#a83f4b]' : 'text-[#98a2b3]'}>, {formatNumber(failed)}</span></p>
          </div>
        </div>
      </section>

      {canManage ? (
        <details className="surface-card overflow-hidden">
          <summary className="cursor-pointer list-none px-5 py-4 text-[12px] font-semibold text-[#344054]">
            Nieuwe externe feed toevoegen
          </summary>
          <div className="border-t border-[#e7ebf0] p-5">
            <FeedConnectForm disabled={!result.available} />
          </div>
        </details>
      ) : null}

      <FeedSourceManager
        key={marketCode}
        initialMarket={marketCode === 'ALL' ? '' : marketCode}
        canManage={canManage && result.available}
        initialSources={sources.map((source) => ({
          ...source,
          lastRunAt: source.lastRunAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
