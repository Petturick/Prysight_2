export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { FeedConnectForm } from '@/components/FeedConnectForm'
import { FeedTabs } from '@/components/FeedTabs'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function FeedsPage() {
  const result = await safeDatabaseQuery(() => prisma.feedSource.findMany({ orderBy: { updatedAt: 'desc' }, take: 8 }), [])
  const sources = result.data
  const activeSources = sources.filter((source) => source.isActive)
  const failedSources = sources.filter((source) => source.lastRunStatus === 'FAILED')
  const syntrxSources = sources.filter((source) => source.sourceType === 'SYNTRX')
  const importedItems = sources.reduce((sum, source) => sum + (source.lastItemCount ?? 0), 0)

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Data en beheer</p>
            <h1 className="mt-2">Feedbeheer</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#4b5870]">Beheer alle productbronnen vanuit één plek en zie direct welke bron actief is, faalt of aandacht vraagt.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className="primary-action">Productbestand importeren</Link>
            <Link href="/producten" className="secondary-action">Bekijk producten</Link>
          </div>
        </div>
        <FeedTabs />
        <div className="grid border-t-2 border-[var(--border-strong)] sm:grid-cols-4">
          <div className="bg-[#111827] px-5 py-4 text-white sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#cbd5e1]">Actieve bronnen</p><p className="mt-1 text-[27px] font-black">{formatNumber(activeSources.length)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Mislukt</p><p className={`mt-1 text-[27px] font-black ${failedSources.length ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{formatNumber(failedSources.length)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Laatste regels</p><p className="mt-1 text-[27px] font-black text-[#111827]">{formatNumber(importedItems)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Syntrx bronnen</p><p className="mt-1 text-[27px] font-black text-[#111827]">{formatNumber(syntrxSources.length)}</p></div>
        </div>
      </section>

      {failedSources.length ? <section className="rounded-[14px] border-2 border-[#b4233d] bg-[#f6d7dd] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#8e1d32]">Actie vereist</p><h2 className="mt-1 text-[15px] font-black text-[#681426]">{failedSources.length} databron{failedSources.length === 1 ? '' : 'nen'} met een mislukte laatste run</h2><p className="mt-1 text-[11px] font-semibold text-[#7a2638]">Controleer eerst deze bronnen voordat je nieuwe koppelingen toevoegt.</p></div><Link href="/feeds/map" className="secondary-action border-[#b4233d] text-[#8e1d32]">Bronnen controleren</Link></div></section> : null}

      <section className="grid gap-3 lg:grid-cols-4">
        <Link href="/import" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#111827] text-lg font-black text-white">▦</div><h2 className="mt-4">Bestand importeren</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">CSV of Excel met automatische kolomherkenning en preview.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Start import</p></Link>
        <a href="#externe-feed" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#2457d6] text-lg font-black text-white">↗</div><h2 className="mt-4">Externe feed koppelen</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">XML, CSV, JSON, Excel of openbare bestandslink koppelen.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Koppel feed</p></a>
        <Link href="/integraties" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#5b2be8] text-sm font-black text-white">S</div><h2 className="mt-4">Syntrx koppeling</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Directe synchronisatie via hetzelfde Prysight productmodel.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Open integraties</p></Link>
        <Link href="/feeds/publicaties" className="surface-card p-5 transition-transform hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#0d7a49] text-lg font-black text-white">◔</div><h2 className="mt-4">Uitgaande feed</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Publiceer de actuele productset als beveiligde JSON of CSV.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Beheer publicaties</p></Link>
      </section>

      <section id="externe-feed" className="strong-panel scroll-mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--border-strong)] bg-[#edf1f6] px-5 py-4">
          <div><h2 className="text-[15px] font-black text-[#111827]">Externe productfeed koppelen</h2><p className="mt-1 text-[11px] font-semibold text-[#647087]">Bron ophalen, velden herkennen, preview controleren en pas daarna producten bijwerken.</p></div>
          <Link href="/feeds/map" className="secondary-action min-h-0 px-3 py-2">Bestaande bronnen beheren</Link>
        </div>
        <div className="p-5"><FeedConnectForm disabled={!result.available} /></div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--border-strong)] bg-[#111827] px-5 py-4 text-white">
          <div><h2 className="text-[15px] font-black">Recente databronnen</h2><p className="mt-1 text-[11px] font-medium text-[#cbd5e1]">De laatste bronnen die productdata aan Prysight hebben geleverd.</p></div>
          <span className="rounded-[8px] bg-white/10 px-3 py-1 text-[10px] font-black">{formatNumber(sources.length)} zichtbaar</span>
        </div>
        <div className="divide-y-2 divide-[#cbd2df]">{sources.length === 0 ? <p className="py-10 text-center text-[11px] font-semibold text-[#6f7b91]">Nog geen databron gekoppeld.</p> : sources.map((source) => <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 odd:bg-white even:bg-[#f3f5f9]"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[12px] font-black text-[#111827]">{source.name}</p><span className="rounded-[7px] border border-[#aeb8c9] bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-[#4b5870]">{source.sourceType}</span></div><p className="mt-1 text-[10px] font-semibold text-[#6f7b91]">{source.countryCode || 'GLOBAL'} · {source.format ?? 'formaat wordt bepaald'} · laatste run {formatDate(source.lastRunAt)}</p></div><div className="text-right"><p className="text-[12px] font-black text-[#111827]">{formatNumber(source.lastItemCount)} regels</p><p className={`mt-1 inline-flex rounded-[7px] px-2 py-1 text-[9px] font-black uppercase ${source.lastRunStatus === 'FAILED' ? 'bg-[#b4233d] text-white' : source.lastRunStatus === 'COMPLETED' ? 'bg-[#0d7a49] text-white' : 'bg-[#dfe4ee] text-[#334155]'}`}>{source.lastRunStatus}</p></div></div>)}</div>
      </section>
    </div>
  )
}
