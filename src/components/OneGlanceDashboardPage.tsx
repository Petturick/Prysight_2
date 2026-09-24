import Link from 'next/link'
import { MatchStatus } from '@/generated/prisma/client'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getDashboardSnapshot, type DashboardSnapshot } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { productGroupLabel } from '@/lib/product-groups'
import { profileStep } from '@/lib/performance-profile'
import MarketPositionDonut from '@/components/MarketPositionDonut'

export const dynamic = 'force-dynamic'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

const emptySnapshot: DashboardSnapshot = {
  filterOptions: { countries: [], productGroups: [], competitors: [] },
  metrics: [],
  kpis: {
    monitoredProducts: 0, activeOffers: 0, validMatches: 0, reviewMatches: 0,
    withoutCompetitorPrice: 0, engelsLowest: 0, engelsHigher: 0, averagePriceIndex: null,
    failedChecks: 0, staleData: 0,
  },
  biggestIncreases: [], biggestDecreases: [], failedChecks: [], staleOffers: [],
}

function StatCard({ label, value, detail, href, accent }: {
  label: string; value: string; detail: string; href: string; accent: 'neutral' | 'red' | 'amber' | 'green'
}) {
  const accentStyles = {
    neutral: 'bg-[#edf3ff] text-[#386ac6]',
    red: 'bg-[#fff0f0] text-[#b94d53]',
    amber: 'bg-[#fff8e9] text-[#9c6317]',
    green: 'bg-[#eaf7f1] text-[#147951]',
  }
  return <Link href={href} className="group rounded-2xl border border-[#e4eaf2] bg-white p-5 shadow-sm transition hover:border-[#b8cce9] hover:shadow-md">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[12px] font-semibold text-[#59677b]">{label}</p>
      <span aria-hidden="true" className={'flex h-7 w-7 items-center justify-center rounded-lg ' + accentStyles[accent]}>↗</span>
    </div>
    <p className="mt-3 text-[29px] font-semibold leading-none tracking-tight text-[#182439]">{value}</p>
    <p className="mt-3 text-[11px] leading-4 text-[#68778d]">{detail}</p>
  </Link>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-[#dfe7f0] bg-[#fbfcfe] px-5 text-center">
    <p className="text-[12px] font-semibold text-[#40536c]">{title}</p>
    <p className="mt-1 max-w-sm text-[11px] leading-5 text-[#8290a1]">{detail}</p>
  </div>
}

export default async function OneGlanceDashboardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actor = await requireAuthenticatedUser()
  const params = await searchParams
  const filters: {
    countryId?: string; productGroupId?: string; competitorId?: string; matchStatus?: MatchStatus | ''
  } = {
    countryId: readParam(params.land),
    productGroupId: readParam(params.productgroep),
    competitorId: readParam(params.concurrent),
  }

  let snapshot = emptySnapshot
  let databaseAvailable = true
  try {
    snapshot = await profileStep('/dashboard', 'snapshot',
      () => getDashboardSnapshot(filters, actor.companyId), { companyId: actor.companyId }, 350)
  } catch (error) {
    console.error('Dashboard database query failed', error)
    databaseAvailable = false
  }

  // Only recently checked, verified prices may be used in a current market comparison.
  // A historical offer or an unmatched product must never be shown as a current market position.
  const comparable = snapshot.metrics.filter(item =>
    !item.stale && item.comparisonOwnPrice !== null && item.lowestPrice !== null && item.lowestPrice > 0)
  const higher = comparable.filter(item => (item.comparisonOwnPrice ?? 0) > (item.lowestPrice ?? 0))
  const lowerOrEqual = comparable.length - higher.length
  const withoutComparison = Math.max(0, snapshot.kpis.monitoredProducts - comparable.length)
  const avgDeviation = comparable.length
    ? comparable.reduce((sum, item) =>
      sum + (((item.comparisonOwnPrice ?? 0) - (item.lowestPrice ?? 0)) / (item.lowestPrice ?? 1)) * 100, 0) / comparable.length
    : null
  const pct = (value: number) => snapshot.kpis.monitoredProducts
    ? Math.round(value / snapshot.kpis.monitoredProducts * 100) : 0
  const coveragePct = pct(comparable.length)
  const monitoringIssues = snapshot.kpis.failedChecks + snapshot.kpis.staleData
  const incompleteProducts = Math.max(0, snapshot.kpis.monitoredProducts - comparable.length)

  const priceRows = [...comparable]
    .map(item => ({
      ...item,
      differencePct: (((item.comparisonOwnPrice ?? 0) - (item.lowestPrice ?? 0)) / (item.lowestPrice ?? 1)) * 100,
    }))
    .sort((a, b) => b.differencePct - a.differencePct)
  const topDifferences = priceRows.filter(item => item.differencePct > 0).slice(0, 5)
  const attention = priceRows.filter(item => item.differencePct > 0).slice(0, 6)
  const signals = snapshot.kpis.reviewMatches + snapshot.kpis.failedChecks + snapshot.kpis.staleData
  const recentMoves = Array.from(new Map(
    [...snapshot.biggestIncreases, ...snapshot.biggestDecreases].map(item => [item.id, item])
  ).values()).sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 5)

  const selectedCountry = filters.countryId
    ? snapshot.filterOptions.countries.find(country => country.id === filters.countryId)?.name : null
  const productQuery = filters.countryId ? '?land=' + encodeURIComponent(filters.countryId) : ''
  const productHref = '/producten' + productQuery

  return <div className="space-y-4 pb-6">
    {!databaseAvailable && <div role="alert" className="rounded-xl border border-[#f0c6c8] bg-[#fff3f3] p-4 text-[12px] font-medium text-[#b0444b]">
      Databaseverbinding mislukt. Er wordt geen vervangende of fictieve data getoond.
    </div>}

    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-[#182439]">Prijsoverzicht</h1>
        <p className="mt-1 text-[12px] text-[#78869a]">
          {selectedCountry ? 'B2B prijspositie voor ' + selectedCountry : 'B2B prijspositie en marktmonitoring per actieve markt'}.
          Alleen bevestigde, actuele prijzen tellen mee in de vergelijking, btw en markt blijven expliciet gescheiden.
        </p>
      </div>
      <form aria-label="Dashboardfilters" className="flex flex-wrap items-end gap-2 rounded-xl border border-[#e5ebf3] bg-white p-2 shadow-sm">
        <label className="text-[10px] font-semibold text-[#66758b]">
          Land
          <select name="land" defaultValue={filters.countryId ?? ''} className="toolbar-control mt-1 min-w-[135px]">
            <option value="">Alle landen</option>
            {snapshot.filterOptions.countries.map(country =>
              <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-[#66758b]">
          Productgroep
          <select name="productgroep" defaultValue={filters.productGroupId ?? ''} className="toolbar-control mt-1 min-w-[135px]">
            <option value="">Alle groepen</option>
            {snapshot.filterOptions.productGroups.filter((group) => productGroupLabel(group) !== 'Nog niet ingedeeld').map(group =>
              <option key={group.id} value={group.id}>{productGroupLabel(group)}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-[#66758b]">
          Concurrent
          <select name="concurrent" defaultValue={filters.competitorId ?? ''} className="toolbar-control mt-1 min-w-[135px]">
            <option value="">Alle concurrenten</option>
            {snapshot.filterOptions.competitors.filter(competitor =>
              !filters.countryId || competitor.countryId === filters.countryId
            ).map(competitor =>
              <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
          </select>
        </label>
        <button type="submit" className="primary-action min-h-[38px]">Toepassen</button>
      </form>
    </header>

    <section aria-label="Belangrijkste cijfers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Datadekking" value={coveragePct + '%'}
        detail={formatNumber(comparable.length) + ' van ' + formatNumber(snapshot.kpis.monitoredProducts) + ' producten actueel vergelijkbaar'} href={productHref} accent={coveragePct >= 90 ? 'green' : coveragePct >= 70 ? 'neutral' : 'amber'}/>
      <StatCard label="Boven marktprijs" value={formatNumber(higher.length)}
        detail="Producten boven de laagste actuele concurrentieprijs" href={productHref} accent="red"/>
      <StatCard label="Gemiddelde prijsafwijking" value={avgDeviation === null ? '—' : (avgDeviation > 0 ? '+' : '') + formatNumber(avgDeviation, 1) + '%'}
        detail="Eigen prijs ten opzichte van de laagste actuele concurrentieprijs" href={productHref} accent={avgDeviation !== null && avgDeviation > 0 ? 'amber' : 'green'}/>
      <StatCard label="Openstaande signalen" value={formatNumber(signals)}
        detail="Te beoordelen matches, mislukte checks en verouderde bronnen" href="/waarschuwingen" accent="amber"/>
    </section>


    <section aria-label="Besliscockpit" className="grid gap-3 lg:grid-cols-3">
      <Link href={productHref} className="premium-decision-card p-4 transition hover:-translate-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8290a1]">Commercieel</p>
        <div className="mt-2 flex items-end justify-between gap-3"><div><p className="text-[22px] font-semibold text-[#182439]">{formatNumber(higher.length)}</p><p className="mt-1 text-[11px] text-[#68778d]">producten boven de laagste actuele marktprijs</p></div><span className="text-[11px] font-semibold text-[#416bbd]">Bekijken →</span></div>
      </Link>
      <Link href={productHref} className="premium-decision-card p-4 transition hover:-translate-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8290a1]">Datadekking</p>
        <div className="mt-2 flex items-end justify-between gap-3"><div><p className="text-[22px] font-semibold text-[#182439]">{formatNumber(incompleteProducts)}</p><p className="mt-1 text-[11px] text-[#68778d]">producten zonder actuele bevestigde vergelijking</p></div><span className="text-[11px] font-semibold text-[#416bbd]">Aanvullen →</span></div>
      </Link>
      <Link href="/monitoring" className="premium-decision-card p-4 transition hover:-translate-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8290a1]">Technische kwaliteit</p>
        <div className="mt-2 flex items-end justify-between gap-3"><div><p className="text-[22px] font-semibold text-[#182439]">{formatNumber(monitoringIssues)}</p><p className="mt-1 text-[11px] text-[#68778d]">mislukte of verouderde prijsbronnen</p></div><span className="text-[11px] font-semibold text-[#416bbd]">Controleren →</span></div>
      </Link>
    </section>

    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,.75fr)]">
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#25324a]">Grootste prijsverschillen</h2>
            <p className="mt-1 text-[11px] text-[#8490a2]">Eigen prijs tegenover de laagste actuele concurrentieprijs, per product</p>
          </div>
          <Link href={productHref} className="text-[11px] font-semibold text-[#416bbd]">Bekijk producten →</Link>
        </div>
        {topDifferences.length
          ? <div className="mt-6 space-y-5">
            {topDifferences.map(item => {
              const barWidth = Math.min(100, Math.max(4, item.differencePct / Math.max(topDifferences[0].differencePct, 1) * 100))
              return <Link key={item.product.id} href={'/producten/' + item.product.id} className="block rounded-lg p-1 transition hover:bg-[#f7f9fc]">
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="min-w-0 truncate font-medium text-[#344054]" title={item.product.name}>{item.product.name}</span>
                  <strong className="shrink-0 text-[#b94d53]">+{formatNumber(item.differencePct, 1)}%</strong>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f3f7]">
                  <div className="h-full rounded-full bg-[#c95c61]" style={{ width: barWidth + '%' }}/>
                </div>
                <p className="mt-1 text-[10px] text-[#8290a1]">
                  Eigen prijs incl. btw {formatCurrency(item.comparisonOwnPrice)} · Concurrent incl. btw {formatCurrency(item.lowestPrice)}
                </p>
              </Link>
            })}
          </div>
          : <div className="mt-5"><EmptyState title="Geen actuele prijsverschillen boven de markt"
            detail="Zodra producten een bevestigde, actuele concurrentieprijs hebben, zie je hier de grootste verschillen."/></div>}
      </div>

      <div className="surface-card p-5">
        <h2 className="text-[15px] font-semibold text-[#25324a]">Concurrentiepositie</h2>
        <p className="mt-1 text-[11px] text-[#8490a2]">Actieve producten binnen de gekozen filters</p>
        <MarketPositionDonut total={snapshot.kpis.monitoredProducts} lowerOrEqual={lowerOrEqual}
          higher={higher.length} withoutComparison={withoutComparison}/>
        <div className="mt-6 space-y-3 text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#299574]"/>Onder of gelijk aan markt</span>
            <strong>{lowerOrEqual} · {pct(lowerOrEqual)}%</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#c95c61]"/>Boven markt</span>
            <strong>{higher.length} · {pct(higher.length)}%</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#e7b05b]"/>Geen actuele vergelijking</span>
            <strong>{withoutComparison} · {pct(withoutComparison)}%</strong>
          </div>
        </div>
      </div>
    </section>

    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,.75fr)]">
      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#25324a]">Producten om te bekijken</h2>
            <p className="mt-1 text-[11px] text-[#8490a2]">Actuele prijsverschillen die mogelijk aandacht vragen</p>
          </div>
          <Link href={productHref} className="text-[11px] font-semibold text-[#416bbd]">Alle producten →</Link>
        </div>
        {attention.length ? <div className="overflow-x-auto border-t border-[#edf0f3]">
          <table className="min-w-full text-[11px]">
            <thead><tr>
              <th className="px-5 py-3 text-left">Product</th>
              <th className="px-3 py-3 text-right">Eigen prijs incl. btw</th>
              <th className="px-3 py-3 text-right">Concurrent incl. btw</th>
              <th className="px-5 py-3 text-right">Verschil</th>
            </tr></thead>
            <tbody>{attention.map(item =>
              <tr key={item.product.id} className="border-t border-[#edf0f3]">
                <td className="max-w-[280px] px-5 py-3">
                  <Link href={'/producten/' + item.product.id} className="block truncate font-semibold text-[#344054] hover:text-[#416bbd]">{item.product.name}</Link>
                  <span className="text-[10px] text-[#8996a8]">{item.product.articleNumber}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(item.comparisonOwnPrice)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(item.lowestPrice)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-[#b94d53]">+{formatNumber(item.differencePct, 1)}%</td>
              </tr>)}</tbody>
          </table>
        </div> : <div className="px-5 pb-5"><EmptyState title="Geen producten boven de actuele marktprijs"
          detail="Producten met onvoldoende of verouderde prijsinformatie worden niet als goedkoper of duurder aangemerkt."/></div>}
      </div>

      <div className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[#25324a]">Recente prijsbewegingen</h2>
          <Link href={productHref} className="text-[11px] font-semibold text-[#416bbd]">Bekijk alles →</Link>
        </div>
        <p className="mt-1 text-[11px] text-[#8490a2]">Laatste twee gemeten concurrentieprijzen per bron</p>
        {recentMoves.length ? <div className="mt-3 divide-y divide-[#edf0f3]">
          {recentMoves.map(move => <div key={move.id} className="py-3">
            <div className="flex items-start justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate font-semibold text-[#344054]" title={move.productName}>{move.productName}</span>
              <strong className={move.delta > 0 ? 'shrink-0 text-[#b94d53]' : 'shrink-0 text-[#16785a]'}>
                {move.delta > 0 ? '+' : ''}{formatCurrency(move.delta)}
              </strong>
            </div>
            <p className="mt-1 text-[10px] text-[#8996a8]">{move.competitor} · {formatCurrency(move.previousPrice)} → {formatCurrency(move.latestPrice)}</p>
            <p className="mt-1 text-[10px] text-[#a0a9b7]">Gemeten {formatDate(move.recordedAt)}</p>
          </div>)}
        </div> : <div className="mt-4"><EmptyState title="Nog geen prijsbewegingen"
          detail="Na twee geslaagde prijsmetingen per concurrent verschijnt hier het verschil."/></div>}
      </div>
    </section>

    {(snapshot.kpis.failedChecks > 0 || snapshot.kpis.staleData > 0 || snapshot.kpis.reviewMatches > 0) &&
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[#25324a]">Monitoring en controles</h2>
            <p className="mt-1 text-[11px] text-[#8490a2]">Signalen voor de huidige selectie, geen historische verwijderde producten</p>
          </div>
          <Link href="/waarschuwingen" className="text-[11px] font-semibold text-[#416bbd]">Bekijk signalen →</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#fff7eb] p-3"><strong className="text-xl text-[#915915]">{snapshot.kpis.reviewMatches}</strong><p className="text-[11px] text-[#78664d]">Matches te beoordelen</p></div>
          <div className="rounded-xl bg-[#fff2f2] p-3"><strong className="text-xl text-[#a94349]">{snapshot.kpis.failedChecks}</strong><p className="text-[11px] text-[#85676a]">Mislukte controles, laatste 7 dagen</p></div>
          <div className="rounded-xl bg-[#fff7eb] p-3"><strong className="text-xl text-[#915915]">{snapshot.kpis.staleData}</strong><p className="text-[11px] text-[#78664d]">Bronnen zonder actuele controle</p></div>
        </div>
      </section>}
  </div>
}
