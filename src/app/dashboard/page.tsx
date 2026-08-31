export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { MatchStatus } from '@/generated/prisma/client'
import { DashboardOverviewCharts } from '@/components/DashboardOverviewCharts'
import { DataTable } from '@/components/DataTable'
import { StatCard } from '@/components/StatCard'
import { deriveProductMetrics, getDashboardSnapshot, type DashboardSnapshot } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'

function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

const emptySnapshot: DashboardSnapshot = {
  filterOptions: { countries: [], productGroups: [], competitors: [] }, metrics: [],
  kpis: { monitoredProducts: 0, activeOffers: 0, validMatches: 0, reviewMatches: 0, withoutCompetitorPrice: 0, engelsLowest: 0, engelsHigher: 0, averagePriceIndex: null, failedChecks: 0, staleData: 0 },
  biggestIncreases: [], biggestDecreases: [], failedChecks: [], staleOffers: [],
}

function CountryCard({ name, code, href, active, products, higher, changes }: { name: string; code: string; href: string; active: boolean; products: number; higher: number; changes: number }) {
  return (
    <Link href={href} className={`min-w-[150px] rounded-2xl border px-4 py-3 transition ${active ? 'border-[#f1a6ad] bg-[var(--accent-soft)] shadow-sm' : 'border-[var(--border)] bg-white hover:border-[#cfd5df]'}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a93a5]">{code || '—'}</span>{active && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}</div>
      <p className="mt-1 truncate text-[13px] font-semibold text-[#252a37]">{name}</p>
      <p className="mt-2 text-[10px] leading-4 text-[#7d8698]">{products} producten · {higher} duurder · {changes} wijzigingen</p>
    </Link>
  )
}

function AttentionCard({ title, value, helper, href, tone = 'red' }: { title: string; value: string; helper: string; href: string; tone?: 'red' | 'amber' | 'blue' }) {
  const toneClass = tone === 'red' ? 'border-[#ffd2d9] bg-[var(--accent-soft)]' : tone === 'amber' ? 'border-[#f3dfb2] bg-[#fff9eb]' : 'border-[#d8e5ff] bg-[var(--blue-soft)]'
  return (
    <Link href={href} className={`rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[#303645]">{title}</p><p className="mt-1 text-[10px] leading-4 text-[#7d8698]">{helper}</p></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-semibold text-[#303645]">{value}</span></div>
    </Link>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const filters: { countryId?: string; productGroupId?: string; competitorId?: string; matchStatus?: MatchStatus | '' } = {
    countryId: readParam(params.land),
    productGroupId: readParam(params.productgroep),
    competitorId: readParam(params.concurrent),
    matchStatus: (readParam(params.matchstatus) as MatchStatus | undefined) ?? '',
  }

  let snapshot = emptySnapshot
  let databaseAvailable = true
  try { snapshot = await getDashboardSnapshot(filters) } catch (error) { console.error('Dashboard database query failed', error); databaseAvailable = false }

  const coverage = snapshot.kpis.monitoredProducts > 0 ? Math.min(100, Math.round((snapshot.kpis.validMatches / snapshot.kpis.monitoredProducts) * 100)) : 0
  const comparable = snapshot.metrics.filter((item) => item.lowestPrice !== null && item.ownPrice !== null)
  const equalToMarket = comparable.filter((item) => item.marketPosition === 'Gelijk aan markt').length

  const relevantOfferMap = new Map<string, DashboardSnapshot['metrics'][number]['product']['matches'][number]['competitorOffer']>()
  snapshot.metrics.forEach((metric) => {
    metric.product.matches.forEach((match) => {
      const offer = match.competitorOffer
      if (!offer.isActive) return
      if (filters.countryId && offer.competitor.countryId !== filters.countryId) return
      if (filters.competitorId && offer.competitorId !== filters.competitorId) return
      if (filters.matchStatus && match.matchStatus !== filters.matchStatus) return
      relevantOfferMap.set(offer.id, offer)
    })
  })
  const relevantOffers = [...relevantOfferMap.values()]
  // Server rendered monitoring health intentionally uses one request time snapshot.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  let healthyOffers = 0
  let staleOffersCount = 0
  let failedOffers = 0
  relevantOffers.forEach((offer) => {
    const latest = offer.priceChecks[0]
    const verified = offer.normalizedPrice !== null && offer.priceHistory.length > 0 && offer.priceChecks.some((check) => check.isSuccess)
    if (latest && !latest.isSuccess) failedOffers += 1
    else if (!verified || !offer.lastCheckedAt || now - offer.lastCheckedAt.getTime() > 72 * 60 * 60 * 1000) staleOffersCount += 1
    else healthyOffers += 1
  })

  const countrySummaries = snapshot.filterOptions.countries
    .filter((country) => !filters.countryId || country.id === filters.countryId)
    .map((country) => {
      const metrics = snapshot.metrics
        .map((item) => deriveProductMetrics(item.product, { ...filters, countryId: country.id }))
        .filter((item) => item.product.productMarkets.some((market) => market.countryId === country.id && market.isActive) || item.offerCount > 0)
      const changed = metrics.filter((item) => item.trendDelta !== null && item.trendDelta !== 0).length
      return {
        id: country.id,
        name: country.name,
        code: country.code,
        products: metrics.length,
        higher: metrics.filter((item) => item.marketPosition === 'Engels duurder').length,
        changes: changed,
      }
    })

  const selectedCountryName = filters.countryId ? snapshot.filterOptions.countries.find((country) => country.id === filters.countryId)?.name : null
  const strongestDecrease = snapshot.biggestDecreases[0]

  return (
    <div className="space-y-5">
      {!databaseAvailable && <div className="rounded-2xl border border-[#ffd2d9] bg-[var(--accent-soft)] p-4 text-sm text-[#b4233d]"><p className="font-semibold">Databaseverbinding mislukt</p><p className="mt-1 text-[12px]">Het dashboard toont bewust geen vervangende demo waarden.</p></div>}

      <section className="surface-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="eyebrow">Prijsmonitoring</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26] sm:text-[32px]">{selectedCountryName ? `Marktoverzicht ${selectedCountryName}` : 'Marktoverzicht alle landen'}</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#697386]">In één oogopslag de prijspositie, actuele metingen, afwijkingen en producten die aandacht vragen.</p></div>
          <form className="grid gap-2 sm:grid-cols-3 xl:min-w-[560px]">
            {filters.countryId && <input type="hidden" name="land" value={filters.countryId} />}
            <select name="productgroep" defaultValue={filters.productGroupId} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]"><option value="">Alle productgroepen</option>{snapshot.filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
            <select name="concurrent" defaultValue={filters.competitorId} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]"><option value="">Alle concurrenten</option>{snapshot.filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select>
            <button className="focus-ring h-9 rounded-xl border border-[#ffd3d9] bg-[var(--accent-soft)] px-4 text-[11px] font-semibold text-[var(--accent)]">Filter toepassen</button>
          </form>
        </div>
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-[14px] font-semibold text-[#252a37]">Landen</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Schakel direct naar het prijsbeeld van een markt.</p></div>{filters.countryId && <Link href="/dashboard" className="text-[11px] font-semibold text-[var(--blue)]">Alle landen</Link>}</div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {!filters.countryId && <CountryCard name="Alle landen" code="ALL" href="/dashboard" active products={snapshot.kpis.monitoredProducts} higher={snapshot.kpis.engelsHigher} changes={snapshot.metrics.filter((item) => item.trendDelta !== null && item.trendDelta !== 0).length} />}
          {countrySummaries.map((country) => <CountryCard key={country.id} name={country.name} code={country.code} href={`/dashboard?land=${country.id}`} active={filters.countryId === country.id} products={country.products} higher={country.higher} changes={country.changes} />)}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Producten" value={formatNumber(snapshot.kpis.monitoredProducts)} helper={`${formatNumber(snapshot.kpis.withoutCompetitorPrice)} zonder geverifieerde concurrentieprijs`} tone="red" />
        <StatCard title="Geverifieerde prijzen" value={formatNumber(snapshot.kpis.activeOffers)} helper="Alleen uit echte prijscontroles" tone="blue" />
        <StatCard title="Engels goedkoper" value={formatNumber(snapshot.kpis.engelsLowest)} helper="Onder laagste gemeten marktprijs" tone="green" />
        <StatCard title="Engels duurder" value={formatNumber(snapshot.kpis.engelsHigher)} helper="Prijspositie vraagt beoordeling" tone="amber" />
        <StatCard title="Prijsindex" value={snapshot.kpis.averagePriceIndex ? formatNumber(snapshot.kpis.averagePriceIndex, 1) : '—'} helper="100 betekent gelijk aan laagste marktprijs" tone="blue" />
        <StatCard title="Datadekking" value={`${coverage}%`} helper={`${formatNumber(snapshot.kpis.reviewMatches)} matches vragen controle`} tone="green" />
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3"><h2 className="text-[14px] font-semibold text-[#252a37]">Aandacht nodig</h2><p className="mt-1 text-[11px] text-[#8a93a5]">De belangrijkste signalen uit de laatste echte metingen.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AttentionCard title="Boven marktprijs" value={formatNumber(snapshot.kpis.engelsHigher)} helper="Producten waarbij Engels boven de laagste concurrentieprijs ligt." href="/producten" />
          <AttentionCard title="Mislukte controles" value={formatNumber(failedOffers)} helper="Concurrentpagina's waarvan de laatste controle technisch mislukte." href="/concurrenten" tone="amber" />
          <AttentionCard title="Verouderde metingen" value={formatNumber(staleOffersCount)} helper="Prijsmetingen ouder dan 72 uur of nog niet geverifieerd." href="/concurrenten" tone="amber" />
          <AttentionCard title="Open productmatches" value={formatNumber(snapshot.kpis.reviewMatches)} helper={strongestDecrease ? `${strongestDecrease.productName} heeft een recente prijsdaling bij ${strongestDecrease.competitor}.` : 'Matches die nog handmatige beoordeling nodig hebben.'} href="/productmatches" tone="blue" />
        </div>
      </section>

      <DashboardOverviewCharts
        market={{ lower: snapshot.kpis.engelsLowest, equal: equalToMarket, higher: snapshot.kpis.engelsHigher, noPrice: snapshot.kpis.withoutCompetitorPrice }}
        monitoring={{ healthy: healthyOffers, stale: staleOffersCount, failed: failedOffers }}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-[14px] font-semibold text-[#252a37]">Grootste prijsstijgingen</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Recente bewegingen uit opgeslagen prijs historie.</p></div><Link href="/producten" className="text-[11px] font-semibold text-[var(--blue)]">Bekijk producten</Link></div><DataTable columns={[{ key: 'product', header: 'Product' }, { key: 'concurrent', header: 'Concurrent' }, { key: 'van', header: 'Van' }, { key: 'naar', header: 'Naar' }, { key: 'delta', header: 'Verschil' }]} rows={snapshot.biggestIncreases.map((item) => ({ product: item.productName, concurrent: item.competitor, van: formatCurrency(item.previousPrice), naar: formatCurrency(item.latestPrice), delta: formatCurrency(item.delta) }))} /></div>
        <div className="surface-card p-4 sm:p-5"><div className="mb-3"><h2 className="text-[14px] font-semibold text-[#252a37]">Grootste prijsdalingen</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Prijsdruk die mogelijk om een besluit vraagt.</p></div><DataTable columns={[{ key: 'product', header: 'Product' }, { key: 'concurrent', header: 'Concurrent' }, { key: 'van', header: 'Van' }, { key: 'naar', header: 'Naar' }, { key: 'delta', header: 'Verschil' }]} rows={snapshot.biggestDecreases.map((item) => ({ product: item.productName, concurrent: item.competitor, van: formatCurrency(item.previousPrice), naar: formatCurrency(item.latestPrice), delta: formatCurrency(item.delta) }))} /></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-4 sm:p-5"><div className="mb-3"><h2 className="text-[14px] font-semibold text-[#252a37]">Mislukte prijscontroles</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Bronnen die technisch aandacht nodig hebben.</p></div><DataTable columns={[{ key: 'concurrent', header: 'Concurrent' }, { key: 'product', header: 'Product' }, { key: 'melding', header: 'Melding' }, { key: 'tijd', header: 'Gecontroleerd' }]} rows={snapshot.failedChecks.map((check) => ({ concurrent: check.competitorOffer.competitor.name, product: check.competitorOffer.productMatch?.product.name ?? 'Ongekoppeld', melding: check.errorMessage ?? 'Onbekende fout', tijd: formatDate(check.checkedAt) }))} /></div>
        <div className="surface-card p-4 sm:p-5"><div className="mb-3"><h2 className="text-[14px] font-semibold text-[#252a37]">Verouderde prijsgegevens</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Aanbiedingen waarvan de laatste geldige controle te oud is.</p></div><DataTable columns={[{ key: 'concurrent', header: 'Concurrent' }, { key: 'product', header: 'Product' }, { key: 'prijs', header: 'Prijs' }, { key: 'laatsteControle', header: 'Laatste controle' }]} rows={snapshot.staleOffers.map((offer) => ({ concurrent: offer.competitor.name, product: offer.productMatch?.product.name ?? 'Ongekoppeld', prijs: formatCurrency(offer.normalizedPrice), laatsteControle: formatDate(offer.lastCheckedAt) }))} /></div>
      </section>
    </div>
  )
}
