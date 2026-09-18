export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { generateWeeklyReportAction } from '@/app/actions/reportActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requirePermission } from '@/lib/authz'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

type PriceMovement = {
  productName: string
  competitor: string
  latestPrice: number
  previousPrice: number
  delta: number
  recordedAt?: string | null
}

type FailedCheck = {
  concurrent: string
  product: string
  fout: string | null
  tijd: string | null
}

type StaleOffer = {
  concurrent: string
  product: string
  laatstGecontroleerd: string | null
  prijs: number | null
}

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
  topStijgers?: PriceMovement[]
  topDalers?: PriceMovement[]
  mislukteControles?: FailedCheck[]
  verouderdeData?: StaleOffer[]
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function statusLabel(status: string) {
  if (status === 'GENERATED') return 'Gegenereerd'
  if (status === 'FAILED') return 'Mislukt'
  return 'Wordt opgebouwd'
}

function reportContent(value: unknown): WeeklyReportContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as WeeklyReportContent
}

function KpiCard({ label, value, helper, tone = 'neutral' }: { label: string; value: string; helper: string; tone?: 'neutral' | 'good' | 'warning' | 'danger' }) {
  const toneClasses = {
    neutral: 'bg-[#f3f6fb] text-[#416bbd]',
    good: 'bg-[#edf8f3] text-[#16785a]',
    warning: 'bg-[#fff8ea] text-[#a9640d]',
    danger: 'bg-[#fff2f2] text-[#b94d53]',
  }[tone]

  return (
    <div className="min-h-[132px] rounded-[16px] border border-[#e7ebf0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.02),0_8px_22px_rgba(16,24,40,.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-[#667085]">{label}</p>
          <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.04em] text-[#172033]">{value}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-[11px] text-[13px] font-semibold ${toneClasses}`}>●</span>
      </div>
      <p className="mt-4 text-[10px] leading-4 text-[#98a2b3]">{helper}</p>
    </div>
  )
}

function MovementPanel({ title, subtitle, rows, direction }: { title: string; subtitle: string; rows: PriceMovement[]; direction: 'up' | 'down' }) {
  const maxDelta = Math.max(...rows.map((row) => Math.abs(Number(row.delta) || 0)), 1)

  return (
    <div className="surface-card p-5 sm:p-6">
      <div>
        <h3 className="text-[15px] font-semibold text-[#25324a]">{title}</h3>
        <p className="mt-1 text-[10px] text-[#98a2b3]">{subtitle}</p>
      </div>
      {rows.length ? (
        <div className="mt-5 space-y-4">
          {rows.map((row, index) => {
            const delta = Number(row.delta) || 0
            const width = Math.max(8, Math.round((Math.abs(delta) / maxDelta) * 100))
            return (
              <div key={`${row.productName}-${row.competitor}-${index}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[#344054]">{row.productName}</p>
                    <p className="mt-0.5 truncate text-[10px] text-[#98a2b3]">{row.competitor}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-[11px] font-semibold ${direction === 'up' ? 'text-[#b94d53]' : 'text-[#16785a]'}`}>
                      {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                    </p>
                    <p className="mt-0.5 text-[9px] text-[#98a2b3]">{formatCurrency(row.previousPrice)} → {formatCurrency(row.latestPrice)}</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef1f4]">
                  <div className={`h-full rounded-full ${direction === 'up' ? 'bg-[#c95c61]' : 'bg-[#2a9b73]'}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 flex min-h-[180px] items-center justify-center rounded-[12px] border border-dashed border-[#dce3ea] bg-[#fafbfc] px-5 text-center text-[11px] text-[#98a2b3]">
          Geen prijsbewegingen in deze rapportage.
        </div>
      )}
    </div>
  )
}

export default async function RapportagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission('reports.read')
  const params = await searchParams
  const result = await safeDatabaseQuery(
    () => prisma.report.findMany({ where: { companyId: actor.companyId }, orderBy: { createdAt: 'desc' } }),
    [],
  )
  const reports = result.data
  const requestedReportId = readParam(params.rapport)
  const selectedReport = reports.find((report) => report.id === requestedReportId) ?? reports[0] ?? null
  const selectedContent = reportContent(selectedReport?.content)

  const kpis = selectedContent?.samenvatting
  const increases = Array.isArray(selectedContent?.topStijgers) ? selectedContent.topStijgers : []
  const decreases = Array.isArray(selectedContent?.topDalers) ? selectedContent.topDalers : []
  const failedChecks = Array.isArray(selectedContent?.mislukteControles) ? selectedContent.mislukteControles : []
  const staleOffers = Array.isArray(selectedContent?.verouderdeData) ? selectedContent.verouderdeData : []

  const totalPosition = Math.max((kpis?.engelsLowest ?? 0) + (kpis?.engelsHigher ?? 0) + (kpis?.withoutCompetitorPrice ?? 0), 1)
  const lowestPct = Math.round(((kpis?.engelsLowest ?? 0) / totalPosition) * 100)
  const higherPct = Math.round(((kpis?.engelsHigher ?? 0) / totalPosition) * 100)
  const missingPct = Math.max(0, 100 - lowestPct - higherPct)

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#172033]">Rapportages</h1>
          <p className="mt-2 max-w-[760px] text-[13px] leading-5 text-[#7a8699]">
            Bekijk de volledige managementrapportage direct in PrySight, inclusief prijspositie, bewegingen, datakwaliteit en controles.
          </p>
        </div>
        <form action={generateWeeklyReportAction}>
          <button disabled={!result.available} className="primary-action min-h-[42px] px-5 disabled:cursor-not-allowed disabled:opacity-40">
            Weekrapport genereren
          </button>
        </form>
      </div>

      {selectedReport ? (
        <>
          <section className="surface-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[#edf0f3] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#edf8f3] px-2.5 py-1 text-[10px] font-semibold text-[#16785a]">{statusLabel(selectedReport.status)}</span>
                  <span className="text-[10px] text-[#98a2b3]">Gegenereerd {formatDate(selectedReport.generatedAt)}</span>
                </div>
                <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-[#25324a]">{selectedReport.title}</h2>
                <p className="mt-1 text-[11px] text-[#7a8699]">{formatDate(selectedReport.weekStart, false)} tot {formatDate(selectedReport.weekEnd, false)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/api/rapportages?id=${selectedReport.id}&format=csv`} className="rounded-[10px] border border-[#dfe5ec] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#475467] hover:bg-[#f7f9fb]">CSV export</Link>
                <Link href={`/api/rapportages?id=${selectedReport.id}&format=xlsx`} className="rounded-[10px] border border-[#dfe5ec] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#475467] hover:bg-[#f7f9fb]">XLSX export</Link>
              </div>
            </div>

            {kpis ? (
              <div className="p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <KpiCard label="Gemonitorde producten" value={formatNumber(kpis.monitoredProducts)} helper="Producten die in deze rapportage worden bewaakt" />
                  <KpiCard label="Actieve prijsmetingen" value={formatNumber(kpis.activeOffers)} helper="Actuele en bruikbare concurrentieprijzen" />
                  <KpiCard label="Bevestigde matches" value={formatNumber(kpis.validMatches)} helper="Producten met minimaal één bevestigde match" tone="good" />
                  <KpiCard label="Matches ter controle" value={formatNumber(kpis.reviewMatches)} helper="Matches die handmatige beoordeling vragen" tone={kpis.reviewMatches ? 'warning' : 'good'} />
                  <KpiCard label="Zonder concurrentieprijs" value={formatNumber(kpis.withoutCompetitorPrice)} helper="Producten waarvoor nog geen marktprijs beschikbaar is" tone={kpis.withoutCompetitorPrice ? 'warning' : 'good'} />
                  <KpiCard label="Engels laagste" value={formatNumber(kpis.engelsLowest)} helper="Producten op of onder de laagste gemeten marktprijs" tone="good" />
                  <KpiCard label="Engels duurder" value={formatNumber(kpis.engelsHigher)} helper="Producten boven de laagste gemeten marktprijs" tone={kpis.engelsHigher ? 'danger' : 'good'} />
                  <KpiCard label="Gemiddelde prijsindex" value={formatNumber(kpis.averagePriceIndex, 1)} helper="Index 100 betekent gelijk aan de laagste gemeten marktprijs" />
                  <KpiCard label="Mislukte controles" value={formatNumber(kpis.failedChecks)} helper="Prijscontroles met een technische of inhoudelijke fout" tone={kpis.failedChecks ? 'danger' : 'good'} />
                  <KpiCard label="Verouderde data" value={formatNumber(kpis.staleData)} helper="Prijsdata die langer dan 72 uur niet succesvol is vernieuwd" tone={kpis.staleData ? 'warning' : 'good'} />
                </div>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-[11px] text-[#98a2b3] sm:px-6">Voor deze rapportage is geen visuele samenvatting beschikbaar.</div>
            )}
          </section>

          {kpis && (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
              <div className="surface-card p-5 sm:p-6">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#25324a]">Prijspositie in één oogopslag</h3>
                  <p className="mt-1 text-[10px] text-[#98a2b3]">Verdeling van de producten waarvoor PrySight de marktpositie kan beoordelen.</p>
                </div>
                <div className="mt-6 grid gap-6 md:grid-cols-[190px_minmax(0,1fr)] md:items-center">
                  <div className="flex justify-center">
                    <div
                      className="relative h-[170px] w-[170px] rounded-full"
                      style={{ background: `conic-gradient(#2a9b73 0 ${lowestPct}%, #c95c61 ${lowestPct}% ${lowestPct + higherPct}%, #dfa13d ${lowestPct + higherPct}% 100%)` }}
                    >
                      <div className="absolute inset-[30px] flex flex-col items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(16,24,40,.04)]">
                        <span className="text-[26px] font-semibold tracking-[-0.04em] text-[#172033]">{formatNumber(kpis.monitoredProducts)}</span>
                        <span className="mt-1 text-[10px] text-[#98a2b3]">producten</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-[11px]"><span className="font-medium text-[#526071]">Laagste of gelijk aan markt</span><strong className="text-[#16785a]">{lowestPct}%</strong></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef1f4]"><div className="h-full rounded-full bg-[#2a9b73]" style={{ width: `${lowestPct}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[11px]"><span className="font-medium text-[#526071]">Boven markt</span><strong className="text-[#b94d53]">{higherPct}%</strong></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef1f4]"><div className="h-full rounded-full bg-[#c95c61]" style={{ width: `${higherPct}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[11px]"><span className="font-medium text-[#526071]">Nog geen prijsdata</span><strong className="text-[#a9640d]">{missingPct}%</strong></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef1f4]"><div className="h-full rounded-full bg-[#dfa13d]" style={{ width: `${missingPct}%` }} /></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="surface-card p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold text-[#25324a]">Datakwaliteit</h3>
                <p className="mt-1 text-[10px] text-[#98a2b3]">Direct zichtbaar welke onderdelen de betrouwbaarheid van de rapportage beïnvloeden.</p>
                <div className="mt-5 space-y-3">
                  <div className="rounded-[12px] bg-[#fff4f4] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold text-[#8f3f44]">Mislukte controles</span>
                      <strong className="text-[18px] font-semibold text-[#b94d53]">{formatNumber(kpis.failedChecks)}</strong>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-[#9b6b6f]">Controles die geen betrouwbare prijsmeting hebben opgeleverd.</p>
                  </div>
                  <div className="rounded-[12px] bg-[#fff8ea] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold text-[#8c5b16]">Verouderde prijsdata</span>
                      <strong className="text-[18px] font-semibold text-[#a9640d]">{formatNumber(kpis.staleData)}</strong>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-[#9c7a49]">Bronnen die langer dan 72 uur niet succesvol zijn gecontroleerd.</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 xl:grid-cols-2">
            <MovementPanel title="Grootste prijsstijgingen" subtitle="Concurrentieprijzen die het sterkst zijn gestegen ten opzichte van de vorige meting." rows={increases} direction="up" />
            <MovementPanel title="Grootste prijsdalingen" subtitle="Concurrentieprijzen die het sterkst zijn gedaald ten opzichte van de vorige meting." rows={decreases} direction="down" />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="surface-card overflow-hidden">
              <div className="px-5 py-4 sm:px-6">
                <h3 className="text-[15px] font-semibold text-[#25324a]">Mislukte controles</h3>
                <p className="mt-1 text-[10px] text-[#98a2b3]">De concrete controles die in deze rapportage aandacht vragen.</p>
              </div>
              <div className="border-t border-[#edf0f3]">
                {failedChecks.length ? (
                  <div className="divide-y divide-[#eef1f4]">
                    {failedChecks.map((check, index) => (
                      <div key={`${check.concurrent}-${check.product}-${index}`} className="grid gap-2 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#344054]">{check.product}</p>
                          <p className="mt-0.5 truncate text-[10px] text-[#98a2b3]">{check.concurrent}</p>
                        </div>
                        <p className="text-[10px] leading-4 text-[#7a8699]">{check.fout || 'Geen foutmelding beschikbaar'}</p>
                        <p className="text-[9px] text-[#98a2b3]">{formatDate(check.tijd)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-10 text-center text-[11px] text-[#98a2b3] sm:px-6">Geen mislukte controles in deze rapportage.</div>
                )}
              </div>
            </div>

            <div className="surface-card overflow-hidden">
              <div className="px-5 py-4 sm:px-6">
                <h3 className="text-[15px] font-semibold text-[#25324a]">Verouderde prijsdata</h3>
                <p className="mt-1 text-[10px] text-[#98a2b3]">Bronnen waarvan de prijs opnieuw gecontroleerd moet worden.</p>
              </div>
              <div className="border-t border-[#edf0f3]">
                {staleOffers.length ? (
                  <div className="divide-y divide-[#eef1f4]">
                    {staleOffers.map((offer, index) => (
                      <div key={`${offer.concurrent}-${offer.product}-${index}`} className="grid gap-2 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-[#344054]">{offer.product}</p>
                          <p className="mt-0.5 truncate text-[10px] text-[#98a2b3]">{offer.concurrent}</p>
                        </div>
                        <p className="text-[10px] font-semibold text-[#475467]">{formatCurrency(offer.prijs)}</p>
                        <p className="text-[9px] text-[#98a2b3]">{offer.laatstGecontroleerd ? formatDate(offer.laatstGecontroleerd) : 'Nog niet gecontroleerd'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-10 text-center text-[11px] text-[#98a2b3] sm:px-6">Geen verouderde prijsdata in deze rapportage.</div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="surface-card px-6 py-14 text-center">
          <h2 className="text-[16px] font-semibold text-[#25324a]">Nog geen rapportages beschikbaar</h2>
          <p className="mx-auto mt-2 max-w-[520px] text-[11px] leading-5 text-[#98a2b3]">Genereer het eerste weekrapport. Daarna verschijnt de volledige visuele rapportage direct op deze pagina.</p>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#25324a]">Rapportagearchief</h2>
          <p className="mt-1 text-[10px] text-[#98a2b3]">Open een eerder rapport om de volledige inhoud direct hierboven te bekijken.</p>
        </div>
        <DataTable
          columns={[
            { key: 'titel', header: 'Titel' },
            { key: 'periode', header: 'Periode' },
            { key: 'status', header: 'Status' },
            { key: 'gegenereerd', header: 'Gegenereerd op' },
            { key: 'export', header: 'Export' },
          ]}
          rows={reports.map((report) => ({
            titel: <Link href={`/rapportages?rapport=${report.id}`} className="font-semibold text-[#344054] hover:text-[#416bbd]">{report.title}</Link>,
            periode: `${formatDate(report.weekStart, false)} tot ${formatDate(report.weekEnd, false)}`,
            status: statusLabel(report.status),
            gegenereerd: formatDate(report.generatedAt),
            export: (
              <div className="flex gap-2">
                <Link href={`/api/rapportages?id=${report.id}&format=csv`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium">CSV</Link>
                <Link href={`/api/rapportages?id=${report.id}&format=xlsx`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium">XLSX</Link>
              </div>
            ),
          }))}
        />
      </section>
    </div>
  )
}
