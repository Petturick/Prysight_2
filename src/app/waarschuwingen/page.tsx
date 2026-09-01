export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertSeverity } from '@/generated/prisma/client'
import { markAlertReadAction } from '@/app/actions/alertActions'
import { AlertBadge } from '@/components/AlertBadge'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAuthenticatedUser } from '@/lib/authz'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function KpiCard({ label, value, helper, tone, icon }: { label: string; value: number; helper: string; tone: 'blue' | 'red' | 'green' | 'amber'; icon: React.ReactNode }) {
  const toneClasses = {
    blue: 'bg-[#eef2ff] text-[#4255ff]',
    red: 'bg-[#fff0f1] text-[#ef434f]',
    green: 'bg-[#ecfbf4] text-[#16a66a]',
    amber: 'bg-[#fff6e8] text-[#e78418]',
  }

  return (
    <div className="prysight-elevated-card flex min-h-[138px] items-start gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${toneClasses[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#536178]">{label}</p>
        <p className="mt-1 text-[30px] font-bold tracking-[-0.04em] text-[#17233b]">{formatNumber(value)}</p>
        <p className="mt-2 text-[10px] font-medium text-[#8a95a8]">{helper}</p>
      </div>
    </div>
  )
}

export default async function WaarschuwingenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser()
  const companyId = user.companyId
  const params = await searchParams
  const severity = readParam(params.severity) as AlertSeverity | undefined
  const type = readParam(params.type)
  const productId = readParam(params.product)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result = await safeDatabaseQuery(async () => {
    const [alerts, products, activeOffers, checks, totalAlerts, criticalAlerts, todayAlerts, failedChecks] = await Promise.all([
      prisma.alert.findMany({
        where: {
          companyId,
          severity: severity || undefined,
          type: type || undefined,
          productId: productId || undefined,
        },
        include: { product: true, competitorOffer: { include: { competitor: true } } },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.competitorOffer.count({ where: { companyId, isActive: true } }),
      prisma.priceCheck.count({ where: { companyId } }),
      prisma.alert.count({ where: { companyId } }),
      prisma.alert.count({ where: { companyId, severity: AlertSeverity.CRITICAL } }),
      prisma.alert.count({ where: { companyId, createdAt: { gte: today } } }),
      prisma.priceCheck.count({ where: { companyId, isSuccess: false } }),
    ])
    return { alerts, products, activeOffers, checks, totalAlerts, criticalAlerts, todayAlerts, failedChecks }
  }, { alerts: [], products: 0, activeOffers: 0, checks: 0, totalAlerts: 0, criticalAlerts: 0, todayAlerts: 0, failedChecks: 0 })

  const { alerts, products, activeOffers, checks, totalAlerts, criticalAlerts, todayAlerts, failedChecks } = result.data
  const monitoringHasStarted = products > 0 && activeOffers > 0 && checks > 0
  const hasFilters = Boolean(type || severity || productId)

  return (
    <div className="space-y-6 pb-8">
      {!result.available && <DatabaseNotice />}

      <section className="px-1 pt-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Analyse en actie</p>
            <h1 className="mt-2 text-[32px] font-bold tracking-[-0.045em] text-[#17233b]">Waarschuwingen</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#66758b]">Signaleringen op prijsverschillen, mislukte controles en afwijkende marktontwikkelingen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/monitoring" className="secondary-action">Monitoringstatus</Link>
            <Link href="/producten" className="primary-action">Producten bekijken</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Totaal waarschuwingen" value={totalAlerts} helper="Alle signalen binnen deze omgeving" tone="blue" icon={<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg>} />
        <KpiCard label="Kritiek" value={criticalAlerts} helper="Vraagt directe beoordeling" tone="red" icon={<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16.5v.1"/></svg>} />
        <KpiCard label="Nieuwe vandaag" value={todayAlerts} helper="Nieuwe signalen sinds 00:00" tone="green" icon={<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>} />
        <KpiCard label="Mislukte controles" value={failedChecks} helper="Prijscontroles met een fout" tone="amber" icon={<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.6-2L20 11M4 13l2.3 5a7 7 0 0 0 11.6-2"/></svg>} />
      </section>

      <form className="prysight-elevated-card p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1.2fr_auto_auto] lg:items-end">
          <label className="space-y-1.5 text-[11px] font-semibold text-[#5d6a7e]">
            <span>Type waarschuwing</span>
            <input name="type" defaultValue={type} placeholder="Type waarschuwing" className="toolbar-control w-full" />
          </label>
          <label className="space-y-1.5 text-[11px] font-semibold text-[#5d6a7e]">
            <span>Niveau</span>
            <select name="severity" defaultValue={severity} className="toolbar-control w-full">
              <option value="">Alle niveaus</option>
              {Object.values(AlertSeverity).map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-[11px] font-semibold text-[#5d6a7e]">
            <span>Product ID</span>
            <input name="product" defaultValue={productId} placeholder="Zoek op product ID..." className="toolbar-control w-full" />
          </label>
          <Link href="/waarschuwingen" className={`secondary-action ${hasFilters ? '' : 'pointer-events-none opacity-55'}`}>Filters wissen</Link>
          <button className="primary-action min-w-[132px]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/></svg>Filteren</button>
        </div>
      </form>

      {!monitoringHasStarted ? <section className="prysight-elevated-card overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#5461ff]"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4 6v5c0 5 3.4 8.2 8 10 4.6-1.8 8-5 8-10V6l-8-3Z"/><path d="M9 12h6M12 9v6"/></svg></div>
            <div>
              <p className="text-[14px] font-semibold text-[#27344a]">Monitoring is nog niet volledig gestart</p>
              <p className="mt-2 max-w-3xl text-[11px] leading-6 text-[#718096]">Prysight heeft producten, gekoppelde concurrent URLs en uitgevoerde prijscontroles nodig. Zodra die keten compleet is, verschijnen waarschuwingen automatisch.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {products === 0 ? <Link href="/import" className="primary-action">Producten importeren</Link> : null}
            {products > 0 && activeOffers === 0 ? <Link href="/concurrenten" className="primary-action">Concurrent URL toevoegen</Link> : null}
            {products > 0 ? <Link href="/monitoring" className="secondary-action">Ontbrekende stappen</Link> : null}
          </div>
        </div>
      </section> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="prysight-elevated-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-[11px]">
              <thead className="bg-[#f7f8fb] text-left text-[#647086]">
                <tr>
                  {['Niveau', 'Titel', 'Bericht', 'Product', 'Concurrent', 'Datum', 'Status'].map((header) => <th key={header} className="whitespace-nowrap px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.045em]">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center"><div className="mx-auto max-w-md"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#5663ff]"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg></div><p className="mt-4 text-[13px] font-semibold text-[#354158]">{monitoringHasStarted ? 'Geen waarschuwingen voor deze selectie' : 'Nog geen waarschuwingen'}</p><p className="mt-2 text-[11px] leading-5 text-[#8490a3]">{monitoringHasStarted ? 'Pas de filters aan om andere signalen te bekijken.' : 'Rond eerst de monitoringflow af, daarna verschijnen hier prijs en marktwaarschuwingen.'}</p></div></td></tr> : alerts.map((alert) => {
                  const statusLabel = alert.isRead ? 'Gelezen' : alert.severity === AlertSeverity.CRITICAL ? 'Onderzoek nodig' : 'Nieuw'
                  const statusClass = alert.isRead ? 'bg-[#e9f9f0] text-[#168653]' : alert.severity === AlertSeverity.CRITICAL ? 'bg-[#fff0ec] text-[#df5b3f]' : 'bg-[#efefff] text-[#5451d6]'
                  return <tr key={alert.id} className="border-t border-[#e8ebf1] align-top transition hover:bg-[#fafbff]">
                    <td className="px-4 py-4"><AlertBadge severity={alert.severity} /></td>
                    <td className="max-w-[210px] px-4 py-4 font-semibold text-[#344057]">{alert.title}</td>
                    <td className="max-w-[280px] whitespace-normal px-4 py-4 leading-5 text-[#667389]">{alert.message}</td>
                    <td className="max-w-[190px] whitespace-normal px-4 py-4 font-medium text-[#4b5870]">{alert.product?.name ?? '—'}</td>
                    <td className="px-4 py-4 text-[#59667c]">{alert.competitorOffer?.competitor.name ?? '—'}</td>
                    <td className="px-4 py-4 text-[#667389]">{formatDate(alert.createdAt)}</td>
                    <td className="px-4 py-4">{alert.isRead ? <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span> : <form action={markAlertReadAction.bind(null, alert.id)} className="flex flex-col items-start gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span><button className="text-[10px] font-semibold text-[#5a62e8] transition hover:text-[#3e46c9]">Markeer als gelezen</button></form>}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8ebf1] bg-[#fbfcfe] px-4 py-3 text-[10px] font-medium text-[#7a879a]">
            <span>{alerts.length ? `1 tot ${formatNumber(alerts.length)} van ${formatNumber(totalAlerts)} waarschuwingen` : 'Geen resultaten'}</span>
            <Link href="/monitoring" className="font-semibold text-[#5861e8] transition hover:text-[#3f47c7]">Bekijk monitoringstatus</Link>
          </div>
        </div>

        <aside className="prysight-elevated-card h-fit p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef2ff] text-[#5360f4]"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4 6v5c0 5 3.4 8.2 8 10 4.6-1.8 8-5 8-10V6l-8-3Z"/></svg></div>
            <div><p className="text-[12px] font-semibold text-[#344057]">Zo werken waarschuwingen</p><p className="mt-0.5 text-[9px] text-[#8b95a7]">Van bron naar actie</p></div>
          </div>
          <p className="mt-4 text-[10px] leading-5 text-[#708096]">Prysight monitort continu je markt via imports, productmatches en prijscontroles.</p>
          <div className="mt-5 space-y-5">
            {[['Import', 'Nieuwe data uit feeds en imports wordt gevalideerd en gekoppeld.'], ['Matches', 'Productmatches verbinden jouw producten met die van concurrenten.'], ['Prijscontroles', 'Prijsverschillen, dalingen en marktontwikkelingen worden gedetecteerd.']].map(([title, description], index) => <div key={title} className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f3ff] text-[11px] font-bold text-[#5962ec]">{index + 1}</div><div><p className="text-[11px] font-semibold text-[#3b475e]">{title}</p><p className="mt-1 text-[9px] leading-4 text-[#8290a3]">{description}</p></div></div>)}
          </div>
          <div className="mt-5 rounded-2xl bg-[#f7f8ff] p-4 text-[9px] leading-4 text-[#707d92]">Waarschuwingen helpen je sneller reageren en betere prijsbeslissingen nemen.</div>
        </aside>
      </section>
    </div>
  )
}
