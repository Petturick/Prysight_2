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
    danger: 'border-[#8e1d32] bg-[#b4233d]',
    warning: 'border-[#754400] bg-[#9a5b00]',
    good: 'border-[#065f38] bg-[#0d7a49]',
    info: 'border-[#1b43a6] bg-[#2457d6]',
  }
  return <Link href={href} className={`rounded-[16px] border-2 p-5 text-white shadow-[0_10px_24px_rgba(20,31,55,.14)] transition hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(20,31,55,.22)] ${styles[tone]}`}><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.1em] text-white/80">{label}</p><p className="mt-2 text-[36px] font-black tracking-[-.045em]">{value}</p></div><span className="rounded-[9px] border border-white/25 bg-white/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[.05em]">Bekijk</span></div><p className="mt-3 text-[11px] font-semibold leading-5 text-white/85">{helper}</p></Link>
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
    {!databaseAvailable && <div className="rounded-[14px] border-2 border-[#b4233d] bg-[#f6d7dd] p-4 text-[12px] font-bold text-[#8e1d32]">Databaseverbinding mislukt. Prysight toont bewust geen vervangende data.</div>}
    <section className="strong-panel px-5 py-5 sm:px-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="eyebrow">Vandaag</p><h1 className="mt-2 text-[30px] font-black tracking-[-.04em] text-[#111827]">{selectedCountryName ? `Prijsbeslissingen voor ${selectedCountryName}` : 'Prijsbeslissingen in één oogopslag'}</h1><p className="mt-2 max-w-2xl text-[12px] font-medium leading-5 text-[#59667d]">{actionTotal > 0 ? `${formatNumber(actionTotal)} signalen vragen aandacht. Begin bij rood en oranje.` : 'Geen open kritieke signalen. De monitoring ziet er gezond uit.'}</p></div><form className="grid gap-2 sm:grid-cols-4 xl:min-w-[690px]"><select name="land" defaultValue={filters.countryId} className="toolbar-control"><option value="">Alle landen</option>{snapshot.filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select><select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control"><option value="">Alle productgroepen</option>{snapshot.filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control"><option value="">Alle concurrenten</option>{snapshot.filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select><button className="primary-action">Toepassen</button></form></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><DecisionCard label="Te duur" value={formatNumber(snapshot.kpis.engelsHigher)} helper="Producten boven de laagste gemeten concurrentieprijs." href="/producten" tone="danger" /><DecisionCard label="Prijsdata ontbreekt" value={formatNumber(snapshot.kpis.withoutCompetitorPrice)} helper="Producten zonder betrouwbare concurrentieprijs." href="/producten" tone="warning" /><DecisionCard label="Monitoring gezond" value={`${coverage}%`} helper={`${formatNumber(snapshot.kpis.validMatches)} bevestigde matches van ${formatNumber(snapshot.kpis.monitoredProducts)} producten.`} href="/monitoring" tone="good" /><DecisionCard label="Controle nodig" value={formatNumber(snapshot.kpis.reviewMatches + snapshot.kpis.failedChecks)} helper={`${formatNumber(snapshot.kpis.reviewMatches)} matches en ${formatNumber(snapshot.kpis.failedChecks)} technische fouten.`} href="/productmatches" tone="info" /></section>
    <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><div className="strong-panel p-5"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Direct handelen</p><h2 className="mt-1 text-[17px] font-black text-[#182238]">Belangrijkste prijsbewegingen</h2></div><Link href="/producten" className="secondary-action min-h-0 px-3 py-2">Alle producten</Link></div><div className="mt-4 space-y-2">{priceMovements.length === 0 ? <div className="rounded-[12px] border-2 border-[#d6dce7] bg-[#f4f6fa] px-4 py-5 text-[11px] font-semibold text-[#697386]">Nog geen recente prijsbewegingen beschikbaar.</div> : priceMovements.map((item, index) => { const down = item.delta < 0; return <div key={`${item.productName}-${item.competitor}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border-2 border-[#d6dce7] bg-white px-4 py-3"><div><p className="text-[12px] font-black text-[#253149]">{item.productName}</p><p className="mt-1 text-[10px] font-semibold text-[#697386]">{item.competitor}</p></div><div className="text-right"><p className={`text-[14px] font-black ${down ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{down ? '' : '+'}{formatCurrency(item.delta)}</p><p className="mt-1 text-[9px] font-bold text-[#697386]">{formatCurrency(item.previousPrice)} → {formatCurrency(item.latestPrice)}</p></div></div> })}</div></div><div className="strong-panel p-5"><p className="eyebrow">Snelle acties</p><h2 className="mt-1 text-[17px] font-black text-[#182238]">Wat wil je nu doen</h2><div className="mt-4 grid gap-2"><Link href="/producten" className="primary-action justify-between">Prijsafwijkingen openen <span>→</span></Link><Link href="/productmatches" className="secondary-action justify-between">EAN en match suggesties <span>→</span></Link><Link href="/monitoring" className="secondary-action justify-between">Monitoringstatus <span>→</span></Link><Link href="/import" className="secondary-action justify-between">Producten importeren <span>→</span></Link></div></div></section>
    <section className="flex flex-wrap items-center gap-2 rounded-[14px] border-2 border-[#cbd2df] bg-white px-4 py-3"><span className="mr-1 text-[10px] font-black uppercase tracking-[.08em] text-[#697386]">Markt</span><Link href="/dashboard" className={`rounded-[9px] border-2 px-3 py-2 text-[10px] font-black ${!filters.countryId ? 'border-[#5b2be8] bg-[#5b2be8] text-white' : 'border-[#cbd2df] text-[#253149]'}`}>Alle landen</Link>{snapshot.filterOptions.countries.map((country) => <Link key={country.id} href={`/dashboard?land=${country.id}`} className={`rounded-[9px] border-2 px-3 py-2 text-[10px] font-black ${filters.countryId === country.id ? 'border-[#5b2be8] bg-[#5b2be8] text-white' : 'border-[#cbd2df] text-[#253149] hover:border-[#5b2be8]'}`}>{country.code}</Link>)}</section>
  </div>
}
