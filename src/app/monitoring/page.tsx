export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAuthenticatedUser } from '@/lib/authz'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function StatusCard({ label, value, helper, tone = 'neutral' }: { label: string; value: number; helper: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good'
    ? 'bg-[var(--green-soft)] text-[var(--green)]'
    : tone === 'warn'
      ? 'bg-[var(--amber-soft)] text-[var(--amber)]'
      : tone === 'bad'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-[#f1f3f6] text-[#5f6878]'

  return (
    <div className="strong-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="mt-2 text-[25px] font-semibold tracking-[-0.03em] text-[#202536]">{formatNumber(value)}</p>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">{helper}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${toneClass}`}>{tone === 'good' ? 'goed' : tone === 'warn' ? 'actie' : tone === 'bad' ? 'probleem' : 'status'}</span>
      </div>
    </div>
  )
}

export default async function MonitoringPage() {
  const user = await requireAuthenticatedUser()
  const companyId = user.companyId
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const last24Hours = new Date(today)
  last24Hours.setDate(last24Hours.getDate() - 1)

  const result = await safeDatabaseQuery(async () => {
    const [
      products,
      marketLinks,
      productsWithoutCompetitor,
      competitorUrls,
      certainMatches,
      reviewMatches,
      checksToday,
      failedChecks24h,
      unreadAlerts,
      latestCheck,
    ] = await Promise.all([
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.productMarket.count({ where: { companyId, isActive: true } }),
      prisma.product.count({ where: { companyId, isActive: true, matches: { none: {} } } }),
      prisma.competitorOffer.count({ where: { companyId, isActive: true } }),
      prisma.productMatch.count({ where: { companyId, matchStatus: 'CERTAIN' } }),
      prisma.productMatch.count({ where: { companyId, matchStatus: 'REVIEW' } }),
      prisma.priceCheck.count({ where: { companyId, checkedAt: { gte: today } } }),
      prisma.priceCheck.count({ where: { companyId, checkedAt: { gte: last24Hours }, isSuccess: false } }),
      prisma.alert.count({ where: { companyId, isRead: false } }),
      prisma.priceCheck.findFirst({ where: { companyId }, orderBy: { checkedAt: 'desc' }, select: { checkedAt: true, isSuccess: true } }),
    ])

    return { products, marketLinks, productsWithoutCompetitor, competitorUrls, certainMatches, reviewMatches, checksToday, failedChecks24h, unreadAlerts, latestCheck }
  }, {
    products: 0,
    marketLinks: 0,
    productsWithoutCompetitor: 0,
    competitorUrls: 0,
    certainMatches: 0,
    reviewMatches: 0,
    checksToday: 0,
    failedChecks24h: 0,
    unreadAlerts: 0,
    latestCheck: null as { checkedAt: Date; isSuccess: boolean } | null,
  })

  const data = result.data
  const readyCoverage = data.products ? Math.round((Math.min(data.certainMatches, data.products) / data.products) * 100) : 0

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Monitoringstatus</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Hier zie je de volledige keten van geïmporteerd product tot daadwerkelijke prijscontrole. Een product is pas volledig gemonitord als markt, concurrent URL en zekere productmatch aanwezig zijn.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className="secondary-action">Nieuwe import</Link>
            <Link href="/producten" className="primary-action">Producten bekijken</Link>
          </div>
        </div>
        <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Monitoringdekking</p><p className="mt-1 text-[23px] font-semibold text-[#202536]">{readyCoverage}%</p></div>
          <div className="border-y border-[var(--border)] px-5 py-4 sm:border-x sm:border-y-0 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Laatste controle</p><p className="mt-1 text-[15px] font-semibold text-[#202536]">{data.latestCheck ? formatDate(data.latestCheck.checkedAt) : 'Nog geen controle'}</p></div>
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Status laatste controle</p><p className={`mt-1 text-[15px] font-semibold ${data.latestCheck?.isSuccess ? 'text-[var(--green)]' : data.latestCheck ? 'text-rose-700' : 'text-[#697386]'}`}>{data.latestCheck ? data.latestCheck.isSuccess ? 'Succesvol' : 'Mislukt' : 'Nog niet gestart'}</p></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard label="Producten" value={data.products} helper="actieve producten in Prysight" />
        <StatusCard label="Marktkoppelingen" value={data.marketLinks} helper="producten met actieve land en marktconfiguratie" tone={data.marketLinks ? 'good' : 'warn'} />
        <StatusCard label="Zonder concurrent" value={data.productsWithoutCompetitor} helper="producten die nog geen productmatch hebben" tone={data.productsWithoutCompetitor ? 'warn' : 'good'} />
        <StatusCard label="Concurrent URLs" value={data.competitorUrls} helper="actieve URLs die gecontroleerd kunnen worden" tone={data.competitorUrls ? 'good' : 'warn'} />
        <StatusCard label="Monitoring gereed" value={data.certainMatches} helper="zekere matches die automatisch mee kunnen tellen" tone={data.certainMatches ? 'good' : 'warn'} />
        <StatusCard label="Match controleren" value={data.reviewMatches} helper="automatische matches die handmatige controle vragen" tone={data.reviewMatches ? 'warn' : 'good'} />
        <StatusCard label="Controles vandaag" value={data.checksToday} helper="werkelijk uitgevoerde prijscontroles" tone={data.checksToday ? 'good' : 'warn'} />
        <StatusCard label="Mislukt in 24 uur" value={data.failedChecks24h} helper="URLs waarvoor geen geldige meting kon worden gedaan" tone={data.failedChecks24h ? 'bad' : 'good'} />
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <Link href="/producten" className="strong-panel p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="eyebrow">Stap 1</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Producten controleren</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Controleer artikelnummer, eigen prijs, markt en databron na import.</p>
          <p className="mt-3 text-[11px] font-semibold text-[var(--blue)]">Productonderzoek openen</p>
        </Link>
        <Link href="/concurrenten" className="strong-panel p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="eyebrow">Stap 2</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Concurrenten en frequentie</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Voeg concurrenten toe, controleer URLs en bepaal hoe vaak deze worden gemeten.</p>
          <p className="mt-3 text-[11px] font-semibold text-[var(--blue)]">Concurrenten openen</p>
        </Link>
        <Link href="/productmatches" className="strong-panel p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="eyebrow">Stap 3</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Matches bevestigen</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Zorg dat elke concurrent URL aan het juiste Engels product is gekoppeld.</p>
          <p className="mt-3 text-[11px] font-semibold text-[var(--blue)]">Matches controleren</p>
        </Link>
        <Link href="/waarschuwingen" className="strong-panel p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="eyebrow">Stap 4</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Afwijkingen opvolgen</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Er staan {formatNumber(data.unreadAlerts)} ongelezen waarschuwingen klaar voor opvolging.</p>
          <p className="mt-3 text-[11px] font-semibold text-[var(--blue)]">Waarschuwingen openen</p>
        </Link>
      </section>
    </div>
  )
}
