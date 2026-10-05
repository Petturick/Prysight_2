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
    <div className="space-y-5 pb-10">
      {(!reportsResult.available || !live.available) && <DatabaseNotice />}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#172033]">Rapportages</h1>
          <p className="mt-1 text-[11px] text-[#7d899a]">Prijspositie, kansen en datakwaliteit in één rustig overzicht.</p>
        </div>
        <form action={generateWeeklyReportAction}>
          <button disabled={!reportsResult.available || !live.available} className="primary-action min-h-[40px] px-4 disabled:cursor-not-allowed disabled:opacity-40">
            Momentopname opslaan
          </button>
        </form>
      </header>

      {snapshot ? (
        <>
          <section className="overflow-hidden rounded-[16px] border border-[#e2e8ef] bg-white">
            <div className="flex flex-col gap-3 border-b border-[#edf1f5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[10px] font-medium text-[#8a96a6]">Actueel overzicht</p>
                <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[#24364b]">
                  {overMarket.length > 0 ? formatNumber(overMarket.length) + ' prijsposities vragen aandacht' : 'Prijsposities onder controle'}
                </h2>
              </div>
              <Link
                href={biggestRisk ? '/producten/' + biggestRisk.product.id : biggestRoom ? '/producten/' + biggestRoom.product.id : '/monitoring'}
                className="text-[10px] font-semibold text-[#315fa7]"
              >
                Belangrijkste actie →
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4">
              <div className="px-5 py-4 sm:px-6">
                <p className="text-[9px] text-[#8a96a6]">Boven markt</p>
                <p className="mt-1 text-[21px] font-semibold tracking-[-0.03em] text-[#26394f]">{formatNumber(overMarket.length)}</p>
              </div>
              <div className="border-l border-[#edf1f5] px-5 py-4">
                <p className="text-[9px] text-[#8a96a6]">Gem. afwijking</p>
                <p className="mt-1 text-[21px] font-semibold tracking-[-0.03em] text-[#26394f]">{pct(averageOverMarketPct)}</p>
              </div>
              <div className="border-t border-[#edf1f5] px-5 py-4 sm:border-l sm:border-t-0">
                <p className="text-[9px] text-[#8a96a6]">Prijsruimte</p>
                <p className="mt-1 text-[21px] font-semibold tracking-[-0.03em] text-[#26394f]">{formatNumber(priceRoom.length)}</p>
              </div>
              <div className="border-l border-t border-[#edf1f5] px-5 py-4 sm:border-t-0">
                <p className="text-[9px] text-[#8a96a6]">Dekking</p>
                <p className="mt-1 text-[21px] font-semibold tracking-[-0.03em] text-[#26394f]">{pct(coveragePct)}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-hidden rounded-[16px] border border-[#e2e8ef] bg-white">
              <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-[14px] font-semibold text-[#2c3e53]">Prijsrisico</h2>
                  <p className="mt-0.5 text-[9px] text-[#8a96a6]">Grootste afwijkingen boven de markt.</p>
                </div>
                <Link href="/producten" className="text-[10px] font-semibold text-[#315fa7]">Alle producten</Link>
              </div>

              {overMarket.length ? (
                <div className="divide-y divide-[#edf1f5]">
                  {overMarket.slice(0, 5).map((item) => {
                    const own = item.comparisonOwnPrice ?? 0
                    const market = item.lowestPrice ?? 0
                    const gap = own - market
                    const gapPct = numberValue(item.difference.pctDiff)
                    return (
                      <Link key={item.product.id} href={'/producten/' + item.product.id} className="grid gap-2 px-5 py-3.5 transition hover:bg-[#fafbfd] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#34495f]">{item.product.name}</p>
                          <p className="mt-1 text-[9px] text-[#8b97a7]">{formatCurrency(own)} vs {formatCurrency(market)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-semibold text-[#a74349]">+{formatCurrency(gap)}</p>
                          <p className="mt-0.5 text-[9px] text-[#9c6a6f]">{signed(gapPct, '%')}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-6"><EmptyState>Geen prijsrisico gevonden.</EmptyState></div>
              )}
            </div>

            <div className="overflow-hidden rounded-[16px] border border-[#e2e8ef] bg-white">
              <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-[14px] font-semibold text-[#2c3e53]">Prijsruimte</h2>
                  <p className="mt-0.5 text-[9px] text-[#8a96a6]">Producten onder de laagste marktprijs.</p>
                </div>
                <Link href="/prijsstrategie" className="text-[10px] font-semibold text-[#315fa7]">Prijsstrategie</Link>
              </div>

              {priceRoom.length ? (
                <div className="divide-y divide-[#edf1f5]">
                  {priceRoom.slice(0, 5).map((item) => {
                    const own = item.comparisonOwnPrice ?? 0
                    const market = item.lowestPrice ?? 0
                    const room = Math.max(0, market - own)
                    const roomPct = market > 0 ? (room / market) * 100 : 0
                    return (
                      <Link key={item.product.id} href={'/producten/' + item.product.id} className="grid gap-2 px-5 py-3.5 transition hover:bg-[#fafbfd] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#34495f]">{item.product.name}</p>
                          <p className="mt-1 text-[9px] text-[#8b97a7]">{formatCurrency(own)} vs {formatCurrency(market)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-semibold text-[#16785a]">{formatCurrency(room)}</p>
                          <p className="mt-0.5 text-[9px] text-[#5f8f7d]">{pct(roomPct)}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-6"><EmptyState>Geen duidelijke prijsruimte gevonden.</EmptyState></div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-[16px] border border-[#e2e8ef] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-[9px] text-[#8a96a6]">Bronproblemen</p>
                <p className="mt-0.5 text-[15px] font-semibold text-[#34495f]">{formatNumber(sourceIssues)}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#8a96a6]">Zonder marktprijs</p>
                <p className="mt-0.5 text-[15px] font-semibold text-[#34495f]">{formatNumber(missingMarketPrice.length)}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#8a96a6]">Matches controleren</p>
                <p className="mt-0.5 text-[15px] font-semibold text-[#34495f]">{formatNumber(reviewMatches)}</p>
              </div>
            </div>
            <Link href="/monitoring" className="text-[10px] font-semibold text-[#315fa7]">Datakwaliteit bekijken</Link>
          </section>

          <details className="overflow-hidden rounded-[16px] border border-[#e2e8ef] bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-[13px] font-semibold text-[#34495f]">Marktbewegingen</h2>
                <p className="mt-0.5 text-[9px] text-[#8a96a6]">{marketMoves.length} recente wijzigingen</p>
              </div>
              <span className="text-[10px] font-semibold text-[#60758d]">Bekijken</span>
            </summary>
            <div className="border-t border-[#edf1f5]">
              {marketMoves.length ? (
                <div className="divide-y divide-[#edf1f5]">
                  {marketMoves.map((move, index) => {
                    const relative = move.previousPrice ? (move.delta / move.previousPrice) * 100 : null
                    return (
                      <div key={move.productName + move.competitor + index} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#34495f]">{move.productName}</p>
                          <p className="mt-1 text-[9px] text-[#8b97a7]">{move.competitor}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[#65758a]">{formatCurrency(move.previousPrice)} → {formatCurrency(move.latestPrice)}</p>
                          <p className={'mt-0.5 text-[9px] font-semibold ' + (move.kind === 'down' ? 'text-[#a74349]' : 'text-[#16785a]')}>{signed(relative, '%')}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-6"><EmptyState>Nog geen duidelijke marktbeweging.</EmptyState></div>
              )}
            </div>
          </details>
        </>
      ) : (
        <section className="rounded-[16px] border border-[#e2e8ef] bg-white p-6">
          <EmptyState>Actuele marktinzichten konden niet worden geladen.</EmptyState>
        </section>
      )}

      <details className="overflow-hidden rounded-[16px] border border-[#e2e8ef] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[13px] font-semibold text-[#34495f]">Historische momentopnames</h2>
            <p className="mt-0.5 text-[9px] text-[#8a96a6]">{reports.length ? formatNumber(reports.length) + ' opgeslagen' : 'Nog geen momentopnames'}</p>
          </div>
          <span className="text-[10px] font-semibold text-[#60758d]">Bekijken</span>
        </summary>

        <div className="border-t border-[#edf1f5]">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-[10px] text-[#7d899a]">
              {selectedReport ? selectedReport.title + (previousReport ? ', vergeleken met ' + previousReport.title : '') : 'Sla eerst een momentopname op.'}
            </p>
            {selectedReport ? (
              <div className="flex gap-2">
                <Link href={'/api/rapportages?id=' + selectedReport.id + '&format=csv'} className="rounded-[9px] border border-[#dfe5ec] px-3 py-2 text-[9px] font-semibold text-[#526071]">CSV</Link>
                <Link href={'/api/rapportages?id=' + selectedReport.id + '&format=xlsx'} className="rounded-[9px] border border-[#dfe5ec] px-3 py-2 text-[9px] font-semibold text-[#526071]">XLSX</Link>
              </div>
            ) : null}
          </div>

          {selectedKpis ? (
            <div className="grid grid-cols-2 border-t border-[#edf1f5] sm:grid-cols-4">
              {[
                { label: 'Boven markt', current: selectedKpis.engelsHigher, previous: previousKpis?.engelsHigher ?? null, value: formatNumber(selectedKpis.engelsHigher) },
                { label: 'Zonder marktprijs', current: selectedKpis.withoutCompetitorPrice, previous: previousKpis?.withoutCompetitorPrice ?? null, value: formatNumber(selectedKpis.withoutCompetitorPrice) },
                { label: 'Prijsindex', current: selectedKpis.averagePriceIndex, previous: previousKpis?.averagePriceIndex ?? null, value: selectedKpis.averagePriceIndex === null ? '—' : formatNumber(selectedKpis.averagePriceIndex, 1) },
                { label: 'Bronproblemen', current: selectedKpis.failedChecks + selectedKpis.staleData, previous: previousKpis ? previousKpis.failedChecks + previousKpis.staleData : null, value: formatNumber(selectedKpis.failedChecks + selectedKpis.staleData) },
              ].map((item, index) => {
                const change = item.current !== null && item.previous !== null ? Number(item.current) - Number(item.previous) : null
                return (
                  <div key={item.label} className={'px-5 py-4 ' + (index > 0 ? 'border-l border-[#edf1f5]' : '')}>
                    <p className="text-[9px] text-[#8a96a6]">{item.label}</p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <strong className="text-[18px] font-semibold tracking-[-0.03em] text-[#34495f]">{item.value}</strong>
                      <span className={'text-[9px] font-semibold ' + (change === null ? 'text-[#98a2b3]' : change > 0 ? 'text-[#a74349]' : change < 0 ? 'text-[#16785a]' : 'text-[#7b8798]')}>
                        {change === null ? '—' : change === 0 ? 'gelijk' : signed(change)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {reports.length ? (
            <div className="flex flex-wrap gap-2 border-t border-[#edf1f5] px-5 py-4 sm:px-6">
              {reports.slice(0, 8).map((report) => (
                <Link
                  key={report.id}
                  href={'/rapportages?rapport=' + report.id}
                  className={'rounded-[9px] border px-3 py-2 text-[9px] font-semibold transition ' + (selectedReport?.id === report.id ? 'border-[#9fbce8] bg-[#f2f6fd] text-[#365f9d]' : 'border-[#e1e6ec] bg-white text-[#647185] hover:bg-[#f8fafc]')}
                >
                  {formatDate(report.weekStart, false)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  )
}
