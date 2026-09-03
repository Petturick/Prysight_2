import Link from 'next/link'
import { MatchStatus } from '@/generated/prisma/client'
import { getDashboardSnapshot, type DashboardSnapshot } from '@/lib/dashboard'
import { formatCurrency, formatNumber } from '@/lib/format'

export const dynamic = 'force-dynamic'

function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

const emptySnapshot: DashboardSnapshot = {
  filterOptions: { countries: [], productGroups: [], competitors: [] }, metrics: [],
  kpis: { monitoredProducts: 0, activeOffers: 0, validMatches: 0, reviewMatches: 0, withoutCompetitorPrice: 0, engelsLowest: 0, engelsHigher: 0, averagePriceIndex: null, failedChecks: 0, staleData: 0 },
  biggestIncreases: [], biggestDecreases: [], failedChecks: [], staleOffers: [],
}

function DecisionCard({ label, value, helper, href, tone }: { label: string; value: string; helper: string; href: string; tone: 'danger' | 'warning' | 'good' | 'info' }) {
  const styles = {
    danger: { border: 'border-[#eccbd0]', accent: 'bg-[#b13b46]', value: 'text-[#8f3039]', soft: 'bg-[#fdf3f4]' },
    warning: { border: 'border-[#eed9b7]', accent: 'bg-[#a86812]', value: 'text-[#86520f]', soft: 'bg-[#fff8eb]' },
    good: { border: 'border-[#c7e4d8]', accent: 'bg-[#17845b]', value: 'text-[#126a49]', soft: 'bg-[#f0f9f5]' },
    info: { border: 'border-[#c5dcea]', accent: 'bg-[#1769aa]', value: 'text-[#155b91]', soft: 'bg-[#f0f6fa]' },
  }[tone]
  return <Link href={href} className={`group relative overflow-hidden rounded-[12px] border bg-white p-5 shadow-[0_3px_10px_rgba(16,28,44,.05)] transition hover:-translate-y-px hover:shadow-[0_7px_18px_rgba(16,28,44,.08)] ${styles.border}`}><span className={`absolute inset-y-0 left-0 w-1 ${styles.accent}`} /><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#687587]">{label}</p><p className={`mt-2 text-[32px] font-bold tracking-[-.035em] ${styles.value}`}>{value}</p></div><span className={`rounded-[7px] px-2.5 py-1.5 text-[9px] font-semibold text-[#526173] ${styles.soft}`}>Bekijk</span></div><p className="mt-3 text-[11px] font-medium leading-5 text-[#667386]">{helper}</p></Link>
}

export default async function OneGlanceDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const filters: { countryId?: string; productGroupId?: string; competitorId?: string; matchStatus?: MatchStatus | '' } = {
    countryId: readParam(params.land), productGroupId: readParam(params.productgroep), competitorId: readParam(params.concurrent), matchStatus: (readParam(params.matchstatus) as MatchStatus | undefined) ?? '',
  }
  let snapshot = emptySnapshot
  let databaseAvailable = true
  try { snapshot = await getDashboardSnapshot(filters) } catch (error) { console.error('Dashboard database query failed', error); databaseAvailable = false }

  const coverage = snapshot.kpis.monitoredProducts > 0 ? Math.min(100, Math.round((snapshot.kpis.validMatches / snapshot.kpis.monitoredProducts) * 100)) : 0
  const selectedCountryName = filters.countryId ? snapshot.filterOptions.countries.find((country) => country.id === filters.countryId)?.name : null
  const priceMovements = [...snapshot.biggestDecreases.slice(0, 3), ...snapshot.biggestIncreases.slice(0, 2)]
  const actionTotal = snapshot.kpis.engelsHigher + snapshot.kpis.withoutCompetitorPrice + snapshot.kpis.reviewMatches + snapshot.kpis.failedChecks

  return <div className="space-y-4">
    {!databaseAvailable && <div className="rounded-[10px] border border-[#efc3c8] bg-[#fcebed] p-4 text-[12px] font-semibold text-[#96313b]">Databaseverbinding mislukt. Prysight toont bewust geen vervangende data.</div>}
    <section className="strong-panel px-5 py-5 sm:px-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="eyebrow">Vandaag</p><h1 className="mt-2">{selectedCountryName ? `Prijsbeslissingen voor ${selectedCountryName}` : 'Prijsbeslissingen in één oogopslag'}</h1><p className="mt-2 max-w-2xl text-[12px] font-medium leading-5 text-[#667386]">{actionTotal > 0 ? `${formatNumber(actionTotal)} signalen vragen aandacht. Begin bij de afwijkingen met de grootste impact.` : 'Geen open kritieke signalen. De monitoring ziet er gezond uit.'}</p></div><form className="grid gap-2 sm:grid-cols-4 xl:min-w-[690px]"><select name="land" defaultValue={filters.countryId} className="toolbar-control"><option value="">Alle landen</option>{snapshot.filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select><select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control"><option value="">Alle productgroepen</option>{snapshot.filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control"><option value="">Alle concurrenten</option>{snapshot.filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select><button className="primary-action">Toepassen</button></form></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><DecisionCard label="Te duur" value={formatNumber(snapshot.kpis.engelsHigher)} helper="Producten boven de laagste gemeten concurrentieprijs." href="/producten" tone="danger" /><DecisionCard label="Prijsdata ontbreekt" value={formatNumber(snapshot.kpis.withoutCompetitorPrice)} helper="Producten zonder betrouwbare concurrentieprijs." href="/producten" tone="warning" /><DecisionCard label="Monitoring gezond" value={`${coverage}%`} helper={`${formatNumber(snapshot.kpis.validMatches)} bevestigde matches van ${formatNumber(snapshot.kpis.monitoredProducts)} producten.`} href="/monitoring" tone="good" /><DecisionCard label="Controle nodig" value={formatNumber(snapshot.kpis.reviewMatches + snapshot.kpis.failedChecks)} helper={`${formatNumber(snapshot.kpis.reviewMatches)} matches en ${formatNumber(snapshot.kpis.failedChecks)} technische fouten.`} href="/productmatches" tone="info" /></section>
    <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><div className="strong-panel p-5"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Direct handelen</p><h2 className="mt-1 text-[17px] font-bold text-[#243247]">Belangrijkste prijsbewegingen</h2></div><Link href="/producten" className="secondary-action min-h-0 px-3 py-2">Alle producten</Link></div><div className="mt-4 space-y-2">{priceMovements.length === 0 ? <div className="rounded-[9px] border border-[#dde3e9] bg-[#f8fafc] px-4 py-5 text-[11px] font-medium text-[#697789]">Nog geen recente prijsbewegingen beschikbaar.</div> : priceMovements.map((item, index) => { const down = item.delta < 0; return <div key={`${item.productName}-${item.competitor}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-[#dde3e9] bg-white px-4 py-3 transition hover:bg-[#f8fafc]"><div><p className="text-[12px] font-semibold text-[#2d3a4d]">{item.productName}</p><p className="mt-1 text-[10px] font-medium text-[#718092]">{item.competitor}</p></div><div className="text-right"><p className={`text-[14px] font-bold ${down ? 'text-[#96313b]' : 'text-[#126a49]'}`}>{down ? '' : '+'}{formatCurrency(item.delta)}</p><p className="mt-1 text-[9px] font-medium text-[#718092]">{formatCurrency(item.previousPrice)} → {formatCurrency(item.latestPrice)}</p></div></div> })}</div></div><div className="strong-panel p-5"><p className="eyebrow">Snelle acties</p><h2 className="mt-1 text-[17px] font-bold text-[#243247]">Wat wil je nu doen</h2><div className="mt-4 grid gap-2"><Link href="/producten" className="primary-action justify-between">Prijsafwijkingen openen <span>→</span></Link><Link href="/productmatches" className="secondary-action justify-between">EAN en match suggesties <span>→</span></Link><Link href="/monitoring" className="secondary-action justify-between">Monitoringstatus <span>→</span></Link><Link href="/import" className="secondary-action justify-between">Producten importeren <span>→</span></Link></div></div></section>
    <section className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#d9e0e7] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(16,28,44,.035)]"><span className="mr-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[#718092]">Markt</span><Link href="/dashboard" className={`rounded-[7px] border px-3 py-2 text-[10px] font-semibold ${!filters.countryId ? 'border-[#1769aa] bg-[#1769aa] text-white' : 'border-[#d7dee5] text-[#526173]'}`}>Alle landen</Link>{snapshot.filterOptions.countries.map((country) => <Link key={country.id} href={`/dashboard?land=${country.id}`} className={`rounded-[7px] border px-3 py-2 text-[10px] font-semibold ${filters.countryId === country.id ? 'border-[#1769aa] bg-[#1769aa] text-white' : 'border-[#d7dee5] text-[#526173] hover:border-[#9fb2c2]'}`}>{country.code}</Link>)}</section>
  </div>
}
