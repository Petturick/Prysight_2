export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAuthenticatedUser } from '@/lib/authz'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function Signal({ label, value, helper, tone = 'neutral' }: { label: string; value: number; helper: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good'
    ? 'border-[#0d7a49] bg-[#e3f3ea] text-[#065f38]'
    : tone === 'warn'
      ? 'border-[#9a5b00] bg-[#f8e4bd] text-[#7b4700]'
      : tone === 'bad'
        ? 'border-[#b4233d] bg-[#f6d7dd] text-[#8e1d32]'
        : 'border-[#94a0b5] bg-[#edf1f6] text-[#334155]'

  return (
    <div className={`rounded-[14px] border-2 p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.08em]">{label}</p>
          <p className="mt-2 text-[30px] font-black tracking-[-0.04em] text-[#111827]">{formatNumber(value)}</p>
        </div>
        <span className="rounded-[8px] bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em]">{tone === 'good' ? 'goed' : tone === 'warn' ? 'actie' : tone === 'bad' ? 'probleem' : 'status'}</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-5 text-[#4b5870]">{helper}</p>
    </div>
  )
}

function sourceTone(successRate: number, consecutiveFailures: number) {
  if (consecutiveFailures >= 3 || successRate < 60) return 'text-[#b4233d]'
  if (consecutiveFailures > 0 || successRate < 90) return 'text-[#9a5b00]'
  return 'text-[#0d7a49]'
}

export default async function MonitoringPage() {
  const user = await requireAuthenticatedUser()
  const companyId = user.companyId
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const last24Hours = new Date()
  last24Hours.setHours(last24Hours.getHours() - 24)

  const result = await safeDatabaseQuery(async () => {
    const [products, marketLinks, productsWithoutCompetitor, competitorUrls, certainMatches, reviewMatches, checksToday, checks24h, failedChecks24h, unreadAlerts, latestCheck, latestSuccessfulCheck, offers] = await Promise.all([
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.productMarket.count({ where: { companyId, isActive: true } }),
      prisma.product.count({ where: { companyId, isActive: true, matches: { none: {} } } }),
      prisma.competitorOffer.count({ where: { companyId, isActive: true } }),
      prisma.productMatch.count({ where: { companyId, matchStatus: 'CERTAIN' } }),
      prisma.productMatch.count({ where: { companyId, matchStatus: 'REVIEW' } }),
      prisma.priceCheck.count({ where: { companyId, checkedAt: { gte: today } } }),
      prisma.priceCheck.count({ where: { companyId, checkedAt: { gte: last24Hours } } }),
      prisma.priceCheck.count({ where: { companyId, checkedAt: { gte: last24Hours }, isSuccess: false } }),
      prisma.alert.count({ where: { companyId, isRead: false } }),
      prisma.priceCheck.findFirst({ where: { companyId }, orderBy: { checkedAt: 'desc' }, select: { checkedAt: true, isSuccess: true } }),
      prisma.priceCheck.findFirst({ where: { companyId, isSuccess: true }, orderBy: { checkedAt: 'desc' }, select: { checkedAt: true } }),
      prisma.competitorOffer.findMany({
        where: { companyId, isActive: true },
        select: {
          id: true,
          url: true,
          lastCheckedAt: true,
          competitor: { select: { name: true } },
          productMatch: { select: { product: { select: { name: true, articleNumber: true } } } },
          priceChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 20,
            select: { checkedAt: true, isSuccess: true, errorMessage: true, checkMethod: true },
          },
        },
        orderBy: { lastCheckedAt: 'desc' },
        take: 100,
      }),
    ])

    const sourceHealth = offers.map((offer) => {
      const checks = offer.priceChecks
      const successful = checks.filter((check) => check.isSuccess).length
      const successRate = checks.length ? Math.round((successful / checks.length) * 100) : 0
      const consecutiveFailures = checks.findIndex((check) => check.isSuccess)
      const failureStreak = consecutiveFailures === -1 ? checks.length : consecutiveFailures
      const lastSuccess = checks.find((check) => check.isSuccess)?.checkedAt ?? null
      const latest = checks[0] ?? null
      return {
        id: offer.id,
        competitor: offer.competitor.name,
        product: offer.productMatch?.product.name ?? 'Ongekoppeld product',
        articleNumber: offer.productMatch?.product.articleNumber ?? '',
        url: offer.url,
        lastCheckedAt: offer.lastCheckedAt,
        lastSuccess,
        successRate,
        consecutiveFailures: failureStreak,
        latestError: latest && !latest.isSuccess ? latest.errorMessage : null,
        method: latest?.checkMethod ?? null,
      }
    }).sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.successRate - b.successRate)

    return { products, marketLinks, productsWithoutCompetitor, competitorUrls, certainMatches, reviewMatches, checksToday, checks24h, failedChecks24h, unreadAlerts, latestCheck, latestSuccessfulCheck, sourceHealth }
  }, {
    products: 0, marketLinks: 0, productsWithoutCompetitor: 0, competitorUrls: 0, certainMatches: 0, reviewMatches: 0, checksToday: 0, checks24h: 0, failedChecks24h: 0, unreadAlerts: 0,
    latestCheck: null as { checkedAt: Date; isSuccess: boolean } | null,
    latestSuccessfulCheck: null as { checkedAt: Date } | null,
    sourceHealth: [] as Array<{ id: string; competitor: string; product: string; articleNumber: string; url: string; lastCheckedAt: Date | null; lastSuccess: Date | null; successRate: number; consecutiveFailures: number; latestError: string | null; method: string | null }>,
  })

  const data = result.data
  const readyCoverage = data.products ? Math.round((Math.min(data.certainMatches, data.products) / data.products) * 100) : 0
  const actionTotal = data.productsWithoutCompetitor + data.reviewMatches + data.failedChecks24h + data.unreadAlerts
  const successRate24h = data.checks24h ? Math.round(((data.checks24h - data.failedChecks24h) / data.checks24h) * 100) : 0
  const unhealthySources = data.sourceHealth.filter((source) => source.consecutiveFailures >= 3 || source.successRate < 60).length

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2">Monitoringstatus</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#4b5870]">Zie direct waar de monitoringketen breekt, hoe betrouwbaar iedere bron is en welke stap nu aandacht vraagt.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className="secondary-action">Nieuwe import</Link>
            <Link href="/producten" className="primary-action">Producten bekijken</Link>
          </div>
        </div>
        <div className="grid border-t-2 border-[var(--border-strong)] md:grid-cols-5">
          <div className="bg-[#111827] px-5 py-4 text-white sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#cbd5e1]">Monitoringdekking</p><p className="mt-1 text-[28px] font-black">{readyCoverage}%</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 md:border-l-2 md:border-t-0 sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Succes 24 uur</p><p className={`mt-1 text-[28px] font-black ${successRate24h >= 90 ? 'text-[#0d7a49]' : successRate24h >= 60 ? 'text-[#9a5b00]' : 'text-[#b4233d]'}`}>{successRate24h}%</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 md:border-l-2 md:border-t-0 sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Ongezonde bronnen</p><p className={`mt-1 text-[28px] font-black ${unhealthySources ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{formatNumber(unhealthySources)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 md:border-l-2 md:border-t-0 sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Laatste controle</p><p className="mt-1 text-[14px] font-black text-[#111827]">{data.latestCheck ? formatDate(data.latestCheck.checkedAt) : 'Nog geen controle'}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 md:border-l-2 md:border-t-0 sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Laatste succes</p><p className="mt-1 text-[14px] font-black text-[#111827]">{data.latestSuccessfulCheck ? formatDate(data.latestSuccessfulCheck.checkedAt) : 'Nog geen succes'}</p></div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Signal label="Zonder concurrent" value={data.productsWithoutCompetitor} helper="Producten zonder bruikbare productmatch" tone={data.productsWithoutCompetitor ? 'warn' : 'good'} />
        <Signal label="Matches controleren" value={data.reviewMatches} helper="Automatische matches die nog goedkeuring vragen" tone={data.reviewMatches ? 'warn' : 'good'} />
        <Signal label="Mislukt in 24 uur" value={data.failedChecks24h} helper="URLs waarvoor geen geldige prijsmeting kon worden gedaan" tone={data.failedChecks24h ? 'bad' : 'good'} />
        <Signal label="Ongelezen alerts" value={data.unreadAlerts} helper="Prijsafwijkingen en signalen die opvolging vragen" tone={data.unreadAlerts ? 'bad' : 'good'} />
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b-2 border-[var(--border-strong)] bg-[#111827] px-5 py-4 text-white">
          <h2 className="text-[15px] font-black">Brongezondheid</h2>
          <p className="mt-1 text-[11px] font-medium text-[#cbd5e1]">Succesratio is gebaseerd op maximaal de laatste twintig controles per URL. Bronnen met drie opeenvolgende fouten of minder dan zestig procent succes krijgen prioriteit.</p>
        </div>
        {data.sourceHealth.length === 0 ? (
          <div className="px-5 py-6 text-[12px] font-semibold text-[#647087]">Nog geen actieve bronnen met prijscontroles.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b-2 border-[var(--border)] bg-[#f4f6f9] text-[#5d687d]">
                <tr><th className="px-4 py-3 font-black">Concurrent</th><th className="px-4 py-3 font-black">Product</th><th className="px-4 py-3 font-black">Succes</th><th className="px-4 py-3 font-black">Foutreeks</th><th className="px-4 py-3 font-black">Laatste succes</th><th className="px-4 py-3 font-black">Methode</th><th className="px-4 py-3 font-black">Status</th></tr>
              </thead>
              <tbody>
                {data.sourceHealth.slice(0, 50).map((source) => (
                  <tr key={source.id} className="border-b border-[var(--border)] align-top last:border-0">
                    <td className="px-4 py-3 font-black text-[#111827]">{source.competitor}</td>
                    <td className="px-4 py-3"><p className="font-bold text-[#111827]">{source.product}</p>{source.articleNumber ? <p className="mt-1 text-[10px] text-[#6f7b91]">{source.articleNumber}</p> : null}</td>
                    <td className={`px-4 py-3 font-black ${sourceTone(source.successRate, source.consecutiveFailures)}`}>{source.successRate}%</td>
                    <td className={`px-4 py-3 font-black ${source.consecutiveFailures ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{source.consecutiveFailures}</td>
                    <td className="px-4 py-3 font-semibold text-[#4b5870]">{source.lastSuccess ? formatDate(source.lastSuccess) : 'Nog geen succes'}</td>
                    <td className="px-4 py-3 font-semibold text-[#4b5870]">{source.method ?? 'Onbekend'}</td>
                    <td className="max-w-[280px] px-4 py-3"><p className={`font-black ${sourceTone(source.successRate, source.consecutiveFailures)}`}>{source.consecutiveFailures >= 3 || source.successRate < 60 ? 'Actie nodig' : source.consecutiveFailures > 0 || source.successRate < 90 ? 'Controleren' : 'Gezond'}</p>{source.latestError ? <p className="mt-1 line-clamp-2 text-[10px] font-medium leading-4 text-[#6f7b91]">{source.latestError}</p> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b-2 border-[var(--border-strong)] bg-[#111827] px-5 py-4 text-white">
          <h2 className="text-[15px] font-black">Dataketen</h2>
          <p className="mt-1 text-[11px] font-medium text-[#cbd5e1]">De vier cijfers hieronder tonen of de technische basis van prijsmonitoring gevuld is.</p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Producten', data.products, 'Actieve producten'],
            ['Marktkoppelingen', data.marketLinks, 'Producten met marktconfiguratie'],
            ['Concurrent URLs', data.competitorUrls, 'Actieve meetbare URLs'],
            ['Monitoring gereed', data.certainMatches, 'Zekere productmatches'],
          ].map(([label, value, helper], index) => <div key={String(label)} className={`px-5 py-4 ${index ? 'border-t-2 border-[var(--border)] sm:border-l-2 sm:border-t-0' : ''}`}><p className="text-[10px] font-black uppercase tracking-[0.07em] text-[#6f7b91]">{label}</p><p className="mt-1 text-[24px] font-black text-[#111827]">{formatNumber(value as number)}</p><p className="mt-1 text-[10px] font-semibold text-[#6f7b91]">{helper}</p></div>)}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <Link href="/producten" className="surface-card p-5 transition hover:-translate-y-0.5"><p className="eyebrow">Stap 1</p><h2 className="mt-2">Producten controleren</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Controleer artikelnummer, eigen prijs, markt en databron.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Open productonderzoek</p></Link>
        <Link href="/concurrenten" className="surface-card p-5 transition hover:-translate-y-0.5"><p className="eyebrow">Stap 2</p><h2 className="mt-2">Concurrenten koppelen</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Voeg concurrenten en meetfrequenties toe.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Open concurrenten</p></Link>
        <Link href="/productmatches" className="surface-card p-5 transition hover:-translate-y-0.5"><p className="eyebrow">Stap 3</p><h2 className="mt-2">Matches bevestigen</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Bevestig dat iedere URL bij het juiste product hoort.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Open matches</p></Link>
        <Link href="/waarschuwingen" className="surface-card p-5 transition hover:-translate-y-0.5"><p className="eyebrow">Stap 4</p><h2 className="mt-2">Afwijkingen opvolgen</h2><p className="mt-2 text-[11px] font-medium leading-5 text-[#647087]">Pak prijsafwijkingen en technische fouten gericht op.</p><p className="mt-4 text-[11px] font-black text-[var(--blue)]">Open waarschuwingen</p></Link>
      </section>

      <div className="rounded-[14px] border-2 border-[#94a0b5] bg-[#edf1f6] px-4 py-3 text-[11px] font-semibold text-[#4b5870]">Vandaag uitgevoerd, <strong>{formatNumber(data.checksToday)}</strong> prijscontroles.</div>
    </div>
  )
}
