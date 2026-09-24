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
  const syntrxSources = sources.filter((source) => source.sourceType === 'SYNTRX')
  const importedItems = sources.reduce((sum, source) => sum + (source.lastItemCount ?? 0), 0)

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}
      <section className="ps-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div><p className="eyebrow">Data en beheer</p><h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em] text-[#17233a]">Feedbeheer</h1><p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#66768b]">Beheer productbronnen vanuit één plek. Status, synchronisatie en fouten blijven zichtbaar zonder dat technische details de hoofdtaak overnemen.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/import" className="primary-action">Productbestand importeren</Link><Link href="/producten" className="secondary-action">Bekijk producten</Link></div>
        </div>
        <FeedTabs />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Feedstatus">
        <div className="premium-kpi-card p-4"><p className="text-[11px] font-semibold text-[#65758a]">Actieve bronnen</p><p className="mt-2 text-[27px] font-semibold tabular-nums text-[#17233a]">{formatNumber(activeSources.length)}</p><p className="mt-1 text-[10px] text-[#8491a2]">Bronnen die momenteel synchroniseren</p></div>
        <div className="premium-kpi-card p-4"><p className="text-[11px] font-semibold text-[#65758a]">Aandacht nodig</p><p className={`mt-2 text-[27px] font-semibold tabular-nums ${failedSources.length ? 'text-[#b84a50]' : 'text-[#21835d]'}`}>{formatNumber(failedSources.length)}</p><p className="mt-1 text-[10px] text-[#8491a2]">Bronnen waarvan de laatste run is mislukt</p></div>
        <div className="premium-kpi-card p-4"><p className="text-[11px] font-semibold text-[#65758a]">Productregels</p><p className="mt-2 text-[27px] font-semibold tabular-nums text-[#17233a]">{formatNumber(importedItems)}</p><p className="mt-1 text-[10px] text-[#8491a2]">Regels in de laatst bekende bronstanden</p></div>
        <div className="premium-kpi-card p-4"><p className="text-[11px] font-semibold text-[#65758a]">Syntrx bronnen</p><p className="mt-2 text-[27px] font-semibold tabular-nums text-[#17233a]">{formatNumber(syntrxSources.length)}</p><p className="mt-1 text-[10px] text-[#8491a2]">Direct gekoppeld aan Syntrx</p></div>
      </section>
      {failedSources.length ? <section className="rounded-[12px] border border-[#f1cfd0] bg-[#fff5f5] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold text-[#b84a50]">Aandacht nodig</p><h2 className="mt-1 text-[14px] font-semibold text-[#7d3439]">{failedSources.length} databron{failedSources.length === 1 ? '' : 'nen'} met een mislukte laatste run</h2><p className="mt-1 text-[11px] text-[#7f5a5d]">Controleer deze bronnen voordat je conclusies trekt uit onvolledige productdata.</p></div><Link href="/feeds/map" className="secondary-action">Bronnen controleren</Link></div></section> : null}
      <section className="grid gap-3 lg:grid-cols-4">
        <Link href="/import" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#111827] text-lg font-semibold text-white">▦</div><h2 className="mt-4">Bestand importeren</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">CSV of Excel met automatische kolomherkenning en preview.</p><p className="mt-4 text-[11px] font-semibold text-[var(--blue)]">Start import</p></Link>
        <a href="#externe-feed" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#2457d6] text-lg font-semibold text-white">↗</div><h2 className="mt-4">Externe feed koppelen</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">XML, CSV, JSON, Excel of openbare bestandslink koppelen.</p><p className="mt-4 text-[11px] font-semibold text-[var(--blue)]">Koppel feed</p></a>
        <Link href="/integraties" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#5b2be8] text-sm font-semibold text-white">S</div><h2 className="mt-4">Syntrx koppeling</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Directe synchronisatie via hetzelfde Prysight productmodel.</p><p className="mt-4 text-[11px] font-semibold text-[var(--blue)]">Open integraties</p></Link>
        <Link href="/feeds/publicaties" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#0d7a49] text-lg font-semibold text-white">◔</div><h2 className="mt-4">Uitgaande feed</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Publiceer de actuele productset als beveiligde JSON of CSV.</p><p className="mt-4 text-[11px] font-semibold text-[var(--blue)]">Beheer publicaties</p></Link>
      </section>
      <section id="externe-feed" className="strong-panel scroll-mt-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] bg-[#edf1f6] px-5 py-4"><div><h2 className="text-[15px] font-semibold text-[#111827]">Externe productfeed koppelen</h2><p className="mt-1 text-[11px] font-semibold text-[#647087]">Bron ophalen, velden herkennen en producten bijwerken. Controleer daarna de importresultaten en mappings.</p></div><a href="#bronbeheer" className="secondary-action min-h-0 px-3 py-2">Bestaande bronnen beheren</a></div><div className="p-5"><FeedConnectForm disabled={!result.available || !canManage} /></div></section>
      <FeedSourceManager canManage={canManage && result.available} initialSources={sources.map((source) => ({ ...source, lastRunAt: source.lastRunAt?.toISOString() ?? null }))} />

    </div>
  )
}
