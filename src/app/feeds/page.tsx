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
  const syntrxSources = sources.filter((source) => source.sourceType === 'SYNTRX')

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Data en beheer</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Feedbeheer</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Beheer productdata als zelfstandige Prysight databron. Bestandsimports en externe feeds werken onafhankelijk van Syntrx en komen samen in hetzelfde productmodel.</p>
          </div>
          <Link href="/producten" className="secondary-action">Bekijk producten</Link>
        </div>
        <FeedTabs />
        <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
          <div className="px-5 py-4 sm:px-6"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Bronnen zichtbaar</p><p className="mt-1 text-[21px] font-semibold text-[#202536]">{formatNumber(sources.length)}</p></div>
          <div className="border-y border-[var(--border)] px-5 py-4 sm:border-x sm:border-y-0 sm:px-6"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Actieve bronnen</p><p className="mt-1 text-[21px] font-semibold text-[#202536]">{formatNumber(activeSources.length)}</p></div>
          <div className="px-5 py-4 sm:px-6"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Syntrx bronnen</p><p className="mt-1 text-[21px] font-semibold text-[#202536]">{formatNumber(syntrxSources.length)}</p></div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <Link href="/import" className="surface-card group p-5 transition-transform hover:-translate-y-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#202536] text-white">▦</div>
          <h2 className="mt-4 text-[13px] font-semibold text-[#252a37]">Productbestand importeren</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#778195]">Upload CSV of Excel, controleer de herkende velden en bekijk een preview voordat producten worden bijgewerkt.</p>
        </Link>
        <a href="#externe-feed" className="surface-card group p-5 transition-transform hover:-translate-y-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--blue-soft)] text-[var(--blue)]">↗</div>
          <h2 className="mt-4 text-[13px] font-semibold text-[#252a37]">Externe productfeed</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#778195]">Koppel XML, CSV, JSON, Excel of een openbare bestandslink. Velden en producten worden automatisch herkend.</p>
        </a>
        <Link href="/integraties" className="surface-card group p-5 transition-transform hover:-translate-y-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--violet-soft)] text-[var(--violet)]">S</div>
          <h2 className="mt-4 text-[13px] font-semibold text-[#252a37]">Syntrx PIM koppeling</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#778195]">Syntrx is een aparte directe synchronisatiebron. De koppeling gebruikt hetzelfde Prysight productmodel, zonder Feedbeheer afhankelijk te maken van Syntrx.</p>
        </Link>
        <Link href="/feeds/publicaties" className="surface-card group p-5 transition-transform hover:-translate-y-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--green-soft)] text-[var(--green)]">◔</div>
          <h2 className="mt-4 text-[13px] font-semibold text-[#252a37]">Uitgaande productfeed</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#778195]">Publiceer de actuele Prysight productset als beveiligde JSON of CSV voor andere systemen.</p>
        </Link>
      </section>

      <section id="externe-feed" className="strong-panel scroll-mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[#252a37]">Externe productfeed koppelen</h2>
            <p className="mt-1 text-[10px] text-[#8790a2]">Bron ophalen, velden herkennen en producten gecontroleerd bijwerken in één flow.</p>
          </div>
          <Link href="/feeds/map" className="text-[10px] font-semibold text-[var(--blue)]">Bestaande bronfeeds beheren</Link>
        </div>
        <div className="p-5"><FeedConnectForm disabled={!result.available} /></div>
      </section>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[14px] font-semibold text-[#252a37]">Recente databronnen</h2><p className="mt-1 text-[10px] text-[#8790a2]">De laatste bronnen die productdata aan Prysight hebben geleverd.</p></div>
          <span className="rounded-full bg-[#f0f2f6] px-3 py-1 text-[9px] font-bold text-[#697386]">{formatNumber(sources.length)} zichtbaar</span>
        </div>
        <div className="mt-4 grid gap-2">{sources.length === 0 ? <p className="rounded-[12px] bg-[#f6f8fb] py-7 text-center text-[10px] text-[#98a2b3]">Nog geen databron gekoppeld.</p> : sources.map((source) => <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] bg-[#f7f8fb] px-4 py-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold text-[#303647]">{source.name}</p><span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-[#7b8497]">{source.sourceType}</span></div><p className="mt-1 text-[9px] text-[#929bad]">{source.countryCode || 'GLOBAL'} · {source.format ?? 'formaat wordt bepaald'} · laatste run {formatDate(source.lastRunAt)}</p></div><div className="text-right"><p className="text-[11px] font-semibold text-[#303647]">{formatNumber(source.lastItemCount)} regels</p><p className={`mt-1 text-[9px] font-semibold ${source.lastRunStatus === 'FAILED' ? 'text-[#b4233d]' : source.lastRunStatus === 'COMPLETED' ? 'text-[#39805a]' : 'text-[#8790a2]'}`}>{source.lastRunStatus}</p></div></div>)}</div>
      </section>
    </div>
  )
}
