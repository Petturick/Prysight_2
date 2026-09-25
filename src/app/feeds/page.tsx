export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { FeedConnectForm } from '@/components/FeedConnectForm'
import { FeedSourceManager } from '@/components/FeedSourceManager'
import { FeedTabs } from '@/components/FeedTabs'
import { requirePermission } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { profileStep } from '@/lib/performance-profile'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function FeedsPage() {
  const actor = await requirePermission('feeds.read')
  const result = await profileStep('/feeds', 'sources', () => safeDatabaseQuery(() => prisma.feedSource.findMany({
    where: { companyId: actor.companyId },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, name: true, url: true, isActive: true, syncFrequencyHours: true, syncError: true, lastRunStatus: true, sourceType: true, lastItemCount: true, lastErrorCount: true, countryCode: true, format: true, lastRunAt: true },
  }), []), { companyId: actor.companyId }, 200)

  const sources = result.data
  const canManage = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('feeds.write')
  const activeSources = sources.filter((source) => source.isActive)
  const failedSources = sources.filter((source) => source.lastRunStatus === 'FAILED')
  const importedItems = sources.reduce((sum, source) => sum + (source.lastItemCount ?? 0), 0)

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}

      <section className="grid gap-2 sm:grid-cols-3" aria-label="Feedstatus">
        <div className="premium-kpi-card px-4 py-3">
          <p className="text-[11px] text-[#7a8798]">Actieve feeds</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#17233a]">{formatNumber(activeSources.length)}</p>
        </div>
        <div className="premium-kpi-card px-4 py-3">
          <p className="text-[11px] text-[#7a8798]">Aandacht</p>
          <p className={`mt-1 text-[20px] font-semibold tabular-nums ${failedSources.length ? 'text-[#b84a50]' : 'text-[#21835d]'}`}>{formatNumber(failedSources.length)}</p>
        </div>
        <div className="premium-kpi-card px-4 py-3">
          <p className="text-[11px] text-[#7a8798]">Productregels</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#17233a]">{formatNumber(importedItems)}</p>
        </div>
      </section>

      <section className="ps-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <FeedTabs />
          <div className="flex gap-2">
            <Link href="/import" className="secondary-action">Importeren</Link>
            <Link href="/integraties" className="secondary-action">Integraties</Link>
          </div>
        </div>
      </section>

      {failedSources.length ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-[#fff5f5] px-4 py-3">
          <p className="text-[12px] font-medium text-[#8f3f44]">{failedSources.length} feed{failedSources.length === 1 ? '' : 's'} vragen aandacht</p>
          <Link href="/feeds/map" className="secondary-action">Controleren</Link>
        </section>
      ) : null}

      <details id="externe-feed" className="ps-panel group overflow-hidden" open={sources.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[#25364b]">Nieuwe feed koppelen</h2>
          <span className="text-[12px] font-semibold text-[#356ccd] group-open:hidden">Open</span>
          <span className="hidden text-[12px] font-semibold text-[#667085] group-open:inline">Sluit</span>
        </summary>
        <div className="border-t border-[#edf0f3] p-5">
          <FeedConnectForm disabled={!result.available || !canManage} />
        </div>
      </details>

      <FeedSourceManager
        canManage={canManage && result.available}
        initialSources={sources.map((source) => ({ ...source, lastRunAt: source.lastRunAt?.toISOString() ?? null }))}
      />
    </div>
  )
}
