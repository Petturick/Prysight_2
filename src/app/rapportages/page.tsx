export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { generateWeeklyReportAction } from '@/app/actions/reportActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requirePermission } from '@/lib/authz'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { getFreshDashboardSnapshot } from '@/lib/dashboard'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

type ReportKpis = {
  monitoredProducts: number
  activeOffers: number
  validMatches: number
  reviewMatches: number
  withoutCompetitorPrice: number
  engelsLowest: number
  engelsHigher: number
  averagePriceIndex: number | null
  failedChecks: number
  staleData: number
}

type WeeklyReportContent = {
  samenvatting?: ReportKpis
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function reportContent(value: unknown): WeeklyReportContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as WeeklyReportContent
}

function statusLabel(status: string) {
  if (status === 'GENERATED') return 'Gereed'
  if (status === 'FAILED') return 'Mislukt'
  return 'Wordt opgebouwd'
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return formatNumber(value, 1) + '%'
}

function signed(value: number | null, suffix = '') {
  if (value === null || !Number.isFinite(value)) return '—'
  return (value > 0 ? '+' : '') + formatNumber(value, 1) + suffix
}

function InsightCard({
  eyebrow,
  value,
  title,
  detail,
  href,
  action,
  tone = 'neutral',
}: {
  eyebrow: string
  value: string
  title: string
  detail: string
  href: string
  action: string
  tone?: 'neutral' | 'danger' | 'warning' | 'good'
}) {
  const styles = {
    neutral: 'border-[#dfe7f2] bg-white text-[#315f9f]',
    danger: 'border-[#f1d9dc] bg-[#fffafa] text-[#a74349]',
    warning: 'border-[#f0e2c7] bg-[#fffdf8] text-[#946019]',
    good: 'border-[#d6eadf] bg-[#fbfefc] text-[#147451]',
  }[tone]

  return (
    <Link href={href} className={'group rounded-[18px] border p-5 shadow-[0_8px_24px_rgba(16,24,40,.035)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(16,24,40,.06)] ' + styles}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">{eyebrow}</p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-[30px] font-semibold leading-none tracking-[-0.04em] text-[#172033]">{value}</p>
          <h3 className="mt-3 text-[13px] font-semibold text-[#29384d]">{title}</h3>
        </div>
        <span className="text-[18px] transition group-hover:translate-x-0.5">→</span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#78869a]">{detail}</p>
      <p className="mt-4 text-[10px] font-semibold">{action}</p>
    </Link>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[150px] items-center justify-center rounded-[14px] border border-dashed border-[#dfe5ec] bg-[#fbfcfd] px-6 text-center text-[11px] leading-5 text-[#8b98a9]">
      {children}
    </div>
  )
}

export default async function RapportagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission('reports.read')
  const params = await searchParams

  const [reportsResult, live] = await Promise.all([
    safeDatabaseQuery(
      () => prisma.report.findMany({ where: { companyId: actor.companyId }, orderBy: { createdAt: 'desc' } }),
      [],
    ),
    safeDatabaseQuery(() => getFreshDashboardSnapshot({}, actor.companyId), null),
  ])

  const reports = reportsResult.data
  const requestedReportId = readParam(params.rapport)
  const selectedReport = reports.find((report) => report.id === requestedReportId) ?? reports[0] ?? null
  const selectedIndex = selectedReport ? reports.findIndex((report) => report.id === selectedReport.id) : -1
  const previousReport = selectedIndex >= 0 ? reports[selectedIndex + 1] ?? null : null
  const selectedKpis = reportContent(selectedReport?.content)?.samenvatting ?? null
  const previousKpis = reportContent(previousReport?.content)?.samenvatting ?? null

  const snapshot = live.data
  const metrics = snapshot?.metrics ?? []
  const monitoredProducts = snapshot?.kpis.monitoredProducts ?? 0

  const comparable = metrics.filter((item) =>
    !item.stale &&
    item.comparisonOwnPrice !== null &&
    item.lowestPrice !== null &&
    item.lowestPrice > 0,
  )

  const overMarket = comparable
    .filter((item) => item.difference.position === 'DUURDER')
    .sort((a, b) => Math.abs(numberValue(b.difference.pctDiff) ?? 0) - Math.abs(numberValue(a.difference.pctDiff) ?? 0))

  const priceRoom = comparable
    .filter((item) => item.difference.position === 'LAAGSTE')
    .sort((a, b) => {
      const aRoom = (a.lowestPrice ?? 0) - (a.comparisonOwnPrice ?? 0)
      const bRoom = (b.lowestPrice ?? 0) - (b.comparisonOwnPrice ?? 0)
      return bRoom - aRoom
    })

  const missingMarketPrice = metrics.filter((item) => item.lowestPrice === null)
  const coveragePct = monitoredProducts ? (comparable.length / monitoredProducts) * 100 : 0
  const averageOverMarketPct = overMarket.length
    ? overMarket.reduce((sum, item) => sum + Math.max(0, numberValue(item.difference.pctDiff) ?? 0), 0) / overMarket.length
    : 0
  const averagePriceRoomPct = priceRoom.length
    ? priceRoom.reduce((sum, item) => {
        const own = item.comparisonOwnPrice ?? 0
        const market = item.lowestPrice ?? 0
        return sum + (market > 0 ? Math.max(0, ((market - own) / market) * 100) : 0)
      }, 0) / priceRoom.length
    : 0
  const sourceIssues = (snapshot?.kpis.failedChecks ?? 0) + (snapshot?.kpis.staleData ?? 0)
  const reviewMatches = snapshot?.kpis.reviewMatches ?? 0

  const marketMoves = [
    ...(snapshot?.biggestDecreases ?? []).slice(0, 3).map((item) => ({ ...item, kind: 'down' as const })),
    ...(snapshot?.biggestIncreases ?? []).slice(0, 3).map((item) => ({ ...item, kind: 'up' as const })),
  ].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5)

  const biggestRisk = overMarket[0]
  const biggestRoom = priceRoom[0]

  return (
    <div className="space-y-6">
      {(!reportsResult.available || !live.available) && <DatabaseNotice />}

      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8c98a8]">Prysight intelligence</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.045em] text-[#172033]">Inzichten</h1>
          <p className="mt-2 max-w-[720px] text-[13px] leading-5 text-[#768397]">
            Niet alleen zien wat er gebeurt, maar direct begrijpen waar prijsrisico, commerciële ruimte en dataproblemen zitten.
          </p>
        </div>
        <form action={generateWeeklyReportAction}>
          <button disabled={!reportsResult.available || !live.available} className="primary-action min-h-[42px] px-5 disabled:cursor-not-allowed disabled:opacity-40">
            Momentopname opslaan
          </button>
        </form>
      </header>

      {snapshot ? (
        <>
          <section className="overflow-hidden rounded-[20px] border border-[#dfe6ee] bg-[#172033] px-5 py-5 text-white shadow-[0_12px_30px_rgba(16,24,40,.08)] sm:px-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)] xl:items-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Managementsamenvatting</p>
                <h2 className="mt-2 max-w-[760px] text-[22px] font-semibold leading-8 tracking-[-0.03em]">
                  {overMarket.length > 0
                    ? formatNumber(overMarket.length) + ' prijsposities vragen nu commerciële aandacht.'
                    : 'De actuele prijsposities tonen op dit moment geen directe prijsachterstand.'}
                </h2>
                <div className="mt-4 grid gap-2 text-[11px] leading-5 text-white/72 md:grid-cols-3">
                  <p>
                    <strong className="font-semibold text-white">{pct(coveragePct)}</strong><br />
                    van actieve producten is nu betrouwbaar vergelijkbaar.
                  </p>
                  <p>
                    <strong className="font-semibold text-white">{formatNumber(priceRoom.length)}</strong><br />
                    producten staan onder de laagste gemeten marktprijs en verdienen een prijscheck.
                  </p>
                  <p>
                    <strong className="font-semibold text-white">{formatNumber(sourceIssues + missingMarketPrice.length + reviewMatches)}</strong><br />
                    signalen beperken de kwaliteit of volledigheid van de marktvergelijking.
                  </p>
                </div>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/[0.06] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">Eerst doen</p>
                <p className="mt-2 text-[13px] font-semibold leading-5">
                  {biggestRisk
                    ? 'Controleer ' + biggestRisk.product.name + ', dit product staat het verst boven de laagste gemeten marktprijs.'
                    : biggestRoom
                      ? 'Controleer de prijsruimte op ' + biggestRoom.product.name + '.'
                      : 'Verbeter eerst de marktdekking en bronkwaliteit zodat Prysight meer prijsbeslissingen kan onderbouwen.'}
                </p>
                <Link
                  href={biggestRisk ? '/producten/' + biggestRisk.product.id : biggestRoom ? '/producten/' + biggestRoom.product.id : '/monitoring'}
                  className="mt-4 inline-flex text-[10px] font-semibold text-white underline decoration-white/35 underline-offset-4"
                >
                  Open actie →
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InsightCard
              eyebrow="Prijsrisico"
              value={formatNumber(overMarket.length)}
              title="Producten boven markt"
              detail={overMarket.length ? 'Gemiddeld ' + pct(averageOverMarketPct) + ' boven de laagste betrouwbare marktprijs.' : 'Geen vergelijkbare producten staan boven de laagste marktprijs.'}
              href="/producten"
              action="Bekijk prijsposities"
              tone={overMarket.length ? 'danger' : 'good'}
            />
            <InsightCard
              eyebrow="Prijsruimte"
              value={formatNumber(priceRoom.length)}
              title="Mogelijke ruimte om te toetsen"
              detail={priceRoom.length ? 'Gemiddeld ' + pct(averagePriceRoomPct) + ' onder de laagste gemeten marktprijs. Dit is een signaal, geen automatische prijsverhoging.' : 'Geen duidelijke prijsruimte zichtbaar in de huidige vergelijkingen.'}
              href="/prijsstrategie"
              action="Beoordeel prijsstrategie"
              tone={priceRoom.length ? 'good' : 'neutral'}
            />
            <InsightCard
              eyebrow="Dekking"
              value={pct(coveragePct)}
              title="Producten goed vergelijkbaar"
              detail={formatNumber(missingMarketPrice.length) + ' actieve producten hebben nog geen bruikbare concurrentieprijs.'}
              href="/concurrenten"
              action="Verbeter marktdekking"
              tone={coveragePct >= 80 ? 'good' : coveragePct >= 60 ? 'warning' : 'danger'}
            />
            <InsightCard
              eyebrow="Datakwaliteit"
              value={formatNumber(sourceIssues)}
              title="Bronproblemen"
              detail={formatNumber(snapshot.kpis.failedChecks) + ' mislukte controles en ' + formatNumber(snapshot.kpis.staleData) + ' verouderde prijsbronnen.'}
              href="/monitoring"
              action="Los bronproblemen op"
              tone={sourceIssues ? 'warning' : 'good'}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="surface-card overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-[#edf0f3] px-5 py-5 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a3484e]">Prioriteit</p>
                  <h2 className="mt-1 text-[16px] font-semibold text-[#25324a]">Waar je mogelijk omzet verliest</h2>
                  <p className="mt-1 text-[10px] leading-4 text-[#8995a5]">Producten die boven de laagste betrouwbare marktprijs staan, gesorteerd op grootste afwijking.</p>
                </div>
                <Link href="/producten" className="shrink-0 text-[10px] font-semibold text-[#4774bb]">Alle producten →</Link>
              </div>
              {overMarket.length ? (
                <div className="divide-y divide-[#eef1f4]">
                  {overMarket.slice(0, 5).map((item) => {
                    const own = item.comparisonOwnPrice ?? 0
                    const market = item.lowestPrice ?? 0
                    const gap = own - market
                    const gapPct = numberValue(item.difference.pctDiff)
                    return (
                      <Link key={item.product.id} href={'/producten/' + item.product.id} className="grid gap-3 px-5 py-4 transition hover:bg-[#fbfcfe] sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#314056]">{item.product.name}</p>
                          <p className="mt-1 truncate text-[9px] text-[#98a2b3]">
                            {item.lowestOffer?.competitorOffer.competitor.name ?? 'Laagste marktprijs'} · artikel {item.product.articleNumber}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 md:justify-end">
                          <div className="text-right">
                            <p className="text-[9px] text-[#98a2b3]">Jouw prijs</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-[#344054]">{formatCurrency(own)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-[#98a2b3]">Laagste markt</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-[#344054]">{formatCurrency(market)}</p>
                          </div>
                          <div className="min-w-[72px] rounded-[10px] bg-[#fff1f2] px-2.5 py-2 text-right">
                            <p className="text-[11px] font-semibold text-[#b14950]">+{formatCurrency(gap)}</p>
                            <p className="mt-0.5 text-[9px] text-[#a45c61]">{signed(gapPct, '%')}</p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-6"><EmptyState>Geen actuele prijsachterstand gevonden binnen de betrouwbaar vergelijkbare producten.</EmptyState></div>
              )}
            </div>

            <div className="surface-card overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-[#edf0f3] px-5 py-5 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#177552]">Kans</p>
                  <h2 className="mt-1 text-[16px] font-semibold text-[#25324a]">Waar mogelijk prijsruimte zit</h2>
                  <p className="mt-1 text-[10px] leading-4 text-[#8995a5]">Producten die onder de laagste gemeten marktprijs staan. Eerst marge en strategie toetsen voordat een prijs verandert.</p>
                </div>
                <Link href="/prijsstrategie" className="shrink-0 text-[10px] font-semibold text-[#4774bb]">Prijsstrategie →</Link>
              </div>
              {priceRoom.length ? (
                <div className="divide-y divide-[#eef1f4]">
                  {priceRoom.slice(0, 5).map((item) => {
                    const own = item.comparisonOwnPrice ?? 0
                    const market = item.lowestPrice ?? 0
                    const room = Math.max(0, market - own)
                    const roomPct = market > 0 ? (room / market) * 100 : 0
                    return (
                      <Link key={item.product.id} href={'/producten/' + item.product.id} className="grid gap-3 px-5 py-4 transition hover:bg-[#fbfcfe] sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#314056]">{item.product.name}</p>
                          <p className="mt-1 truncate text-[9px] text-[#98a2b3]">
                            {item.lowestOffer?.competitorOffer.competitor.name ?? 'Laagste marktprijs'} · artikel {item.product.articleNumber}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 md:justify-end">
                          <div className="text-right">
                            <p className="text-[9px] text-[#98a2b3]">Jouw prijs</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-[#344054]">{formatCurrency(own)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-[#98a2b3]">Laagste markt</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-[#344054]">{formatCurrency(market)}</p>
                          </div>
                          <div className="min-w-[72px] rounded-[10px] bg-[#edf8f3] px-2.5 py-2 text-right">
                            <p className="text-[11px] font-semibold text-[#16785a]">{formatCurrency(room)}</p>
                            <p className="mt-0.5 text-[9px] text-[#4d8b76]">{pct(roomPct)} ruimte</p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-6"><EmptyState>Er is nu geen duidelijke prijsruimte ten opzichte van de laagste betrouwbare marktprijs.</EmptyState></div>
              )}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
            <div className="surface-card overflow-hidden">
              <div className="border-b border-[#edf0f3] px-5 py-5 sm:px-6">
                <h2 className="text-[16px] font-semibold text-[#25324a]">Wat beweegt er in de markt</h2>
                <p className="mt-1 text-[10px] leading-4 text-[#8995a5]">De grootste recente prijsbewegingen bij concurrenten, zodat veranderingen niet verdwijnen in losse productpagina's.</p>
              </div>
              {marketMoves.length ? (
                <div className="divide-y divide-[#eef1f4]">
                  {marketMoves.map((move, index) => {
                    const relative = move.previousPrice ? (move.delta / move.previousPrice) * 100 : null
                    return (
                      <div key={move.productName + move.competitor + index} className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#314056]">{move.productName}</p>
                          <p className="mt-1 truncate text-[9px] text-[#98a2b3]">{move.competitor}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-[10px] text-[#7a8699]">{formatCurrency(move.previousPrice)} → {formatCurrency(move.latestPrice)}</p>
                          <div className={'min-w-[78px] rounded-[10px] px-2.5 py-2 text-right ' + (move.kind === 'down' ? 'bg-[#fff1f2]' : 'bg-[#edf8f3]')}>
                            <p className={'text-[11px] font-semibold ' + (move.kind === 'down' ? 'text-[#b14950]' : 'text-[#16785a]')}>{move.delta > 0 ? '+' : ''}{formatCurrency(move.delta)}</p>
                            <p className="mt-0.5 text-[9px] text-[#7a8699]">{signed(relative, '%')}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-6"><EmptyState>Nog onvoldoende prijsveranderingen om een marktbeweging te tonen.</EmptyState></div>
              )}
            </div>

            <div className="surface-card p-5 sm:p-6">
              <h2 className="text-[16px] font-semibold text-[#25324a]">Betrouwbaarheid van het inzicht</h2>
              <p className="mt-1 text-[10px] leading-4 text-[#8995a5]">Prysight maakt zichtbaar waarom een conclusie sterk of juist onvolledig is.</p>
              <div className="mt-5 space-y-3">
                <Link href="/concurrenten" className="flex items-center justify-between rounded-[12px] border border-[#edf0f3] px-4 py-3 hover:bg-[#fbfcfe]">
                  <div>
                    <p className="text-[11px] font-semibold text-[#344054]">Geen concurrentieprijs</p>
                    <p className="mt-0.5 text-[9px] text-[#98a2b3]">Producten die nog niet vergelijkbaar zijn</p>
                  </div>
                  <strong className="text-[18px] font-semibold text-[#a9640d]">{formatNumber(missingMarketPrice.length)}</strong>
                </Link>
                <Link href="/productmatches" className="flex items-center justify-between rounded-[12px] border border-[#edf0f3] px-4 py-3 hover:bg-[#fbfcfe]">
                  <div>
                    <p className="text-[11px] font-semibold text-[#344054]">Matches ter controle</p>
                    <p className="mt-0.5 text-[9px] text-[#98a2b3]">Koppelingen die nog bevestiging nodig hebben</p>
                  </div>
                  <strong className="text-[18px] font-semibold text-[#a9640d]">{formatNumber(reviewMatches)}</strong>
                </Link>
                <Link href="/monitoring" className="flex items-center justify-between rounded-[12px] border border-[#edf0f3] px-4 py-3 hover:bg-[#fbfcfe]">
                  <div>
                    <p className="text-[11px] font-semibold text-[#344054]">Verouderde bronnen</p>
                    <p className="mt-0.5 text-[9px] text-[#98a2b3]">Langer dan 72 uur niet succesvol vernieuwd</p>
                  </div>
                  <strong className="text-[18px] font-semibold text-[#b94d53]">{formatNumber(snapshot.kpis.staleData)}</strong>
                </Link>
                <Link href="/monitoring" className="flex items-center justify-between rounded-[12px] border border-[#edf0f3] px-4 py-3 hover:bg-[#fbfcfe]">
                  <div>
                    <p className="text-[11px] font-semibold text-[#344054]">Mislukte controles</p>
                    <p className="mt-0.5 text-[9px] text-[#98a2b3]">Mislukte pogingen in de afgelopen 7 dagen</p>
                  </div>
                  <strong className="text-[18px] font-semibold text-[#b94d53]">{formatNumber(snapshot.kpis.failedChecks)}</strong>
                </Link>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="surface-card p-6">
          <EmptyState>De actuele marktinzichten konden niet worden geladen. Er worden geen oude cijfers als actuele conclusie gepresenteerd.</EmptyState>
        </section>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#edf0f3] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8793a4]">Historie</p>
            <h2 className="mt-1 text-[16px] font-semibold text-[#25324a]">Ontwikkeling ten opzichte van vorige momentopname</h2>
            <p className="mt-1 text-[10px] text-[#8995a5]">
              {selectedReport ? 'Vergelijk ' + selectedReport.title + (previousReport ? ' met ' + previousReport.title + '.' : '.') : 'Sla een eerste momentopname op om ontwikkeling te kunnen vergelijken.'}
            </p>
          </div>
          {selectedReport ? (
            <div className="flex gap-2">
              <Link href={'/api/rapportages?id=' + selectedReport.id + '&format=csv'} className="rounded-[10px] border border-[#dfe5ec] bg-white px-3 py-2 text-[10px] font-semibold text-[#526071] hover:bg-[#f7f9fb]">CSV</Link>
              <Link href={'/api/rapportages?id=' + selectedReport.id + '&format=xlsx'} className="rounded-[10px] border border-[#dfe5ec] bg-white px-3 py-2 text-[10px] font-semibold text-[#526071] hover:bg-[#f7f9fb]">XLSX</Link>
            </div>
          ) : null}
        </div>

        {selectedKpis ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
            {[
              {
                label: 'Boven markt',
                current: selectedKpis.engelsHigher,
                previous: previousKpis?.engelsHigher ?? null,
                value: formatNumber(selectedKpis.engelsHigher),
              },
              {
                label: 'Zonder marktprijs',
                current: selectedKpis.withoutCompetitorPrice,
                previous: previousKpis?.withoutCompetitorPrice ?? null,
                value: formatNumber(selectedKpis.withoutCompetitorPrice),
              },
              {
                label: 'Gemiddelde prijsindex',
                current: selectedKpis.averagePriceIndex,
                previous: previousKpis?.averagePriceIndex ?? null,
                value: selectedKpis.averagePriceIndex === null ? '—' : formatNumber(selectedKpis.averagePriceIndex, 1),
              },
              {
                label: 'Bronproblemen',
                current: selectedKpis.failedChecks + selectedKpis.staleData,
                previous: previousKpis ? previousKpis.failedChecks + previousKpis.staleData : null,
                value: formatNumber(selectedKpis.failedChecks + selectedKpis.staleData),
              },
            ].map((item) => {
              const change = item.current !== null && item.previous !== null ? Number(item.current) - Number(item.previous) : null
              return (
                <div key={item.label} className="rounded-[14px] border border-[#e7ebf0] bg-white p-4">
                  <p className="text-[10px] font-semibold text-[#7b8798]">{item.label}</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <strong className="text-[24px] font-semibold tracking-[-0.04em] text-[#172033]">{item.value}</strong>
                    <span className={'text-[10px] font-semibold ' + (change === null ? 'text-[#98a2b3]' : change > 0 ? 'text-[#b14950]' : change < 0 ? 'text-[#16785a]' : 'text-[#7b8798]')}>
                      {change === null ? 'geen vergelijking' : change === 0 ? 'gelijk' : signed(change)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-5 sm:p-6"><EmptyState>Nog geen opgeslagen momentopname beschikbaar.</EmptyState></div>
        )}

        {reports.length ? (
          <div className="border-t border-[#edf0f3] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {reports.slice(0, 8).map((report) => (
                <Link
                  key={report.id}
                  href={'/rapportages?rapport=' + report.id}
                  className={'rounded-[10px] border px-3 py-2 text-[10px] font-semibold transition ' + (selectedReport?.id === report.id ? 'border-[#9fbce8] bg-[#f2f6fd] text-[#365f9d]' : 'border-[#e1e6ec] bg-white text-[#647185] hover:bg-[#f8fafc]')}
                >
                  {formatDate(report.weekStart, false)} · {statusLabel(report.status)}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
