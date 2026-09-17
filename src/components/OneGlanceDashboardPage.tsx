import Link from 'next/link'
import { MatchStatus } from '@/generated/prisma/client'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getDashboardSnapshot, type DashboardSnapshot } from '@/lib/dashboard'
import { formatCurrency, formatNumber } from '@/lib/format'
import { profileStep } from '@/lib/performance-profile'

export const dynamic = 'force-dynamic'

function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }
const emptySnapshot: DashboardSnapshot = { filterOptions: { countries: [], productGroups: [], competitors: [] }, metrics: [], kpis: { monitoredProducts: 0, activeOffers: 0, validMatches: 0, reviewMatches: 0, withoutCompetitorPrice: 0, engelsLowest: 0, engelsHigher: 0, averagePriceIndex: null, failedChecks: 0, staleData: 0 }, biggestIncreases: [], biggestDecreases: [], failedChecks: [], staleOffers: [] }

type KpiTone = 'red'|'amber'|'green'|'blue'

function MetricIcon({ tone }: { tone: KpiTone }) {
  const common = 'h-[18px] w-[18px]'
  if (tone === 'red') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 17 10 12l4 4 5-7"/><path d="M15 9h4v4"/></svg>
  if (tone === 'amber') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16h.01"/></svg>
  if (tone === 'green') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2L15.8 9"/></svg>
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 7h14M5 12h14M5 17h9"/><path d="m17 15 2 2 3-4"/></svg>
}

function KpiCard({ label, value, helper, href, tone }: { label: string; value: string; helper: string; href: string; tone: KpiTone }) {
  const colors = {
    red: { text:'#b94d53', soft:'#fff2f2', ring:'#f5d9db' },
    amber: { text:'#a9640d', soft:'#fff8ea', ring:'#f3e1bb' },
    green: { text:'#16785a', soft:'#edf8f3', ring:'#d6ede3' },
    blue: { text:'#2f65c7', soft:'#eff4ff', ring:'#dce7fb' },
  }[tone]

  return <Link href={href} prefetch className="group relative min-h-[148px] overflow-hidden rounded-[16px] border border-[#e7ebf0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.02),0_8px_22px_rgba(16,24,40,.035)] transition-all hover:-translate-y-px hover:border-[#dce3eb] hover:shadow-[0_2px_4px_rgba(16,24,40,.025),0_14px_28px_rgba(16,24,40,.055)]">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[12px] font-semibold tracking-[-0.01em] text-[#526071]">{label}</p>
        <p className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.05em] text-[#172033]">{value}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ring-1" style={{background:colors.soft,color:colors.text,boxShadow:`inset 0 0 0 1px ${colors.ring}`}}><MetricIcon tone={tone}/></div>
    </div>
    <div className="mt-4 flex items-end justify-between gap-3">
      <p className="max-w-[220px] text-[11px] leading-4 text-[#8a94a4]">{helper}</p>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5f7fa] text-[#667085] transition-colors group-hover:bg-[#172033] group-hover:text-white"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </div>
  </Link>
}

function EmptyChart() {
  return <div className="flex h-[238px] flex-col items-center justify-center rounded-[13px] border border-dashed border-[#dce3ea] bg-[#fafbfc] px-6 text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f4f8] text-[#8793a4]"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg></div>
    <p className="mt-3 text-[12px] font-semibold text-[#475467]">Nog geen prijsbewegingen</p>
    <p className="mt-1 max-w-[310px] text-[11px] leading-4 text-[#98a2b3]">Zodra prijschecks beschikbaar zijn verschijnen de marktbewegingen hier automatisch.</p>
  </div>
}

export default async function OneGlanceDashboardPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const actor = await requireAuthenticatedUser()
  const params = await searchParams
  const filters: { countryId?: string; productGroupId?: string; competitorId?: string; matchStatus?: MatchStatus|'' } = { countryId: readParam(params.land), productGroupId: readParam(params.productgroep), competitorId: readParam(params.concurrent), matchStatus: (readParam(params.matchstatus) as MatchStatus|undefined) ?? '' }
  let snapshot = emptySnapshot
  let databaseAvailable = true
  try { snapshot = await profileStep('/dashboard','snapshot',()=>getDashboardSnapshot(filters,actor.companyId),{companyId:actor.companyId},350) } catch (error) { console.error('Dashboard database query failed',error); databaseAvailable = false }

  const coverage = snapshot.kpis.monitoredProducts > 0 ? Math.min(100, Math.round(snapshot.kpis.validMatches / snapshot.kpis.monitoredProducts * 100)) : 0
  const selectedCountryName = filters.countryId ? snapshot.filterOptions.countries.find(c=>c.id===filters.countryId)?.name : null
  const movements = [...snapshot.biggestDecreases.slice(0,3), ...snapshot.biggestIncreases.slice(0,3)]
  const totalDistribution = Math.max(snapshot.kpis.engelsLowest + snapshot.kpis.engelsHigher + snapshot.kpis.withoutCompetitorPrice, 1)
  const lowPct = Math.round(snapshot.kpis.engelsLowest / totalDistribution * 100)
  const highPct = Math.round(snapshot.kpis.engelsHigher / totalDistribution * 100)
  const missingPct = Math.max(0, 100 - lowPct - highPct)
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Goedemorgen' : now.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond'
  const dateLabel = new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)
  const attentionRows = movements.slice(0,5)
  const maxMove = Math.max(...movements.map(m=>Math.max(Math.abs(m.latestPrice),Math.abs(m.previousPrice))),1)

  return <div className="space-y-5">
    {!databaseAvailable && <div className="rounded-[12px] border border-[#efc9cc] bg-[#fff4f4] p-4 text-[12px] font-semibold text-[#b5474c]">Databaseverbinding mislukt. PrySight toont bewust geen vervangende data.</div>}

    <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium capitalize text-[#98a2b3]"><span className="h-1.5 w-1.5 rounded-full bg-[#72a2ff]" />{dateLabel}</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#172033]">{greeting}, {actor.name || 'PrySight gebruiker'}</h1>
        <p className="mt-2 max-w-[650px] text-[13px] leading-5 text-[#7a8699]">Hier zie je wat vandaag aandacht vraagt in je prijspositie en marktmonitoring{selectedCountryName ? ` voor ${selectedCountryName}` : ''}.</p>
      </div>
      <form className="flex flex-wrap items-center gap-2 rounded-[13px] border border-[#e7ebf0] bg-white p-1.5 shadow-[0_1px_2px_rgba(16,24,40,.02)]">
        <select name="land" defaultValue={filters.countryId} className="toolbar-control min-w-[180px] border-0 bg-transparent shadow-none"><option value="">Alle landen</option>{snapshot.filterOptions.countries.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="primary-action min-h-[38px]">Toepassen</button>
      </form>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Producten te duur" value={formatNumber(snapshot.kpis.engelsHigher)} helper="Staan boven de gemeten marktprijs" href="/producten" tone="red" />
      <KpiCard label="Ontbrekende prijsdata" value={formatNumber(snapshot.kpis.withoutCompetitorPrice)} helper="Geen actuele concurrentieprijs beschikbaar" href="/producten" tone="amber" />
      <KpiCard label="Monitoring gezond" value={`${coverage}%`} helper="Van de producten heeft bevestigde prijsdekking" href="/monitoring" tone="green" />
      <KpiCard label="Acties vandaag" value={formatNumber(snapshot.kpis.reviewMatches + snapshot.kpis.failedChecks)} helper="Matches en controles vragen aandacht" href="/waarschuwingen" tone="blue" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.72fr)]">
      <div className="surface-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-[16px] font-semibold text-[#25324a]">Prijspositie ten opzichte van concurrenten</h2><p className="mt-1 text-[11px] text-[#98a2b3]">Laatste gemeten prijs afgezet tegen de vorige meting</p></div>
          <div className="flex items-center gap-4 rounded-full bg-[#f7f9fb] px-3 py-2 text-[10px] font-medium text-[#7a8699]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#4777cf]" />Laatste prijs</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#cfd7e3]" />Vorige prijs</span></div>
        </div>
        <div className="mt-5">
          {movements.length ? <>
            <div className="flex h-[238px] items-end gap-5 rounded-[13px] border border-[#edf0f3] bg-[#fafbfc] px-5 pb-0 pt-5" style={{backgroundImage:'linear-gradient(to top, rgba(226,232,240,.55) 1px, transparent 1px)',backgroundSize:'100% 48px'}}>
              {movements.map((m,i)=>{ const latest=Math.max(Math.abs(m.latestPrice),1); const previous=Math.max(Math.abs(m.previousPrice),1); return <div key={`${m.productName}-${i}`} className="flex min-w-0 flex-1 items-end justify-center gap-1.5"><div className="w-[34%] rounded-t-[5px] bg-[#4777cf] shadow-[0_1px_2px_rgba(47,101,199,.12)]" style={{height:`${Math.max(22,latest/maxMove*185)}px`}}/><div className="w-[34%] rounded-t-[5px] bg-[#d7dee8]" style={{height:`${Math.max(16,previous/maxMove*185)}px`}}/></div>})}
            </div>
            <div className="mt-2 grid text-center text-[10px] text-[#8a94a4]" style={{gridTemplateColumns:`repeat(${movements.length},minmax(0,1fr))`}}>{movements.map((m,i)=><span key={i} className="truncate px-1">{m.productName}</span>)}</div>
          </> : <EmptyChart />}
        </div>
      </div>

      <div className="surface-card p-5 sm:p-6">
        <div><h2 className="text-[16px] font-semibold text-[#25324a]">Prijsverdeling</h2><p className="mt-1 text-[11px] text-[#98a2b3]">Verdeling van de gemonitorde producten</p></div>
        <div className="mt-7 flex flex-col items-center">
          <div className="relative h-[164px] w-[164px] rounded-full shadow-[inset_0_0_0_1px_rgba(16,24,40,.025)]" style={{background:`conic-gradient(#2a9b73 0 ${lowPct}%, #c95c61 ${lowPct}% ${lowPct+highPct}%, #dfa13d ${lowPct+highPct}% 100%)`}}>
            <div className="absolute inset-[29px] flex flex-col items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(16,24,40,.035)]"><span className="text-[25px] font-semibold leading-none tracking-[-0.04em] text-[#172033]">{formatNumber(snapshot.kpis.monitoredProducts)}</span><span className="mt-1 text-[10px] text-[#98a2b3]">producten</span></div>
          </div>
          <div className="mt-7 w-full space-y-3 text-[11px] text-[#526071]">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#2a9b73]" />Onder of gelijk aan markt</span><strong className="font-semibold text-[#344054]">{lowPct}%</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#c95c61]" />Boven markt</span><strong className="font-semibold text-[#344054]">{highPct}%</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#dfa13d]" />Geen prijsdata</span><strong className="font-semibold text-[#344054]">{missingPct}%</strong></div>
          </div>
        </div>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.72fr)]">
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 sm:px-6"><div><h2 className="text-[15px] font-semibold text-[#25324a]">Producten die aandacht nodig hebben</h2><p className="mt-1 text-[10px] text-[#98a2b3]">Grootste recente prijsbewegingen</p></div><Link href="/producten" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#416bbd] hover:text-[#2f5aa8]">Bekijk alles <span>→</span></Link></div>
        <div className="overflow-x-auto border-t border-[#edf0f3]"><table className="min-w-full"><thead><tr><th className="px-5 py-3 text-left sm:px-6">Product</th><th className="px-4 py-3 text-left">Concurrent</th><th className="px-4 py-3 text-right">Vorige prijs</th><th className="px-4 py-3 text-right">Laatste prijs</th><th className="px-5 py-3 text-right sm:px-6">Verschil</th></tr></thead><tbody>{attentionRows.length ? attentionRows.map((m,i)=><tr key={i}><td className="px-5 py-3.5 font-semibold text-[#344054] sm:px-6">{m.productName}</td><td className="px-4 py-3.5 text-[#7a8699]">{m.competitor}</td><td className="px-4 py-3.5 text-right text-[#667085]">{formatCurrency(m.previousPrice)}</td><td className="px-4 py-3.5 text-right font-medium text-[#344054]">{formatCurrency(m.latestPrice)}</td><td className={`px-5 py-3.5 text-right font-semibold sm:px-6 ${m.delta>0?'text-[#b94d53]':'text-[#16785a]'}`}>{m.delta>0?'+':''}{formatCurrency(m.delta)}</td></tr>) : <tr><td colSpan={5} className="px-5 py-12 text-center text-[11px] text-[#98a2b3]">Nog geen prijsbewegingen beschikbaar.</td></tr>}</tbody></table></div>
      </div>

      <div className="surface-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold text-[#25324a]">Recente prijswijzigingen</h2><p className="mt-1 text-[10px] text-[#98a2b3]">Laatste bewegingen in de markt</p></div><Link href="/producten" className="text-[11px] font-semibold text-[#416bbd] hover:text-[#2f5aa8]">Bekijk alles →</Link></div>
        {movements.length ? <div className="mt-4 divide-y divide-[#eef1f4]">{movements.slice(0,5).map((m,i)=><div key={i} className="flex items-center gap-3 py-3.5"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${m.delta>0?'bg-[#fff1f1] text-[#b94d53]':'bg-[#edf8f3] text-[#16785a]'}`}>{m.delta>0?'↑':'↓'}</div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-[#344054]">{m.productName}</p><p className="mt-0.5 truncate text-[10px] text-[#98a2b3]">{m.competitor}</p></div><p className="text-right text-[10px] font-semibold text-[#475467]"><span className="block text-[#98a2b3]">{formatCurrency(m.previousPrice)}</span>{formatCurrency(m.latestPrice)}</p></div>)}</div> : <div className="mt-5 flex min-h-[190px] flex-col items-center justify-center rounded-[12px] bg-[#fafbfc] px-5 text-center"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f4f8] text-[#8793a4]">↕</div><p className="mt-3 text-[11px] font-semibold text-[#667085]">Nog geen wijzigingen</p><p className="mt-1 text-[10px] leading-4 text-[#98a2b3]">Nieuwe prijsbewegingen verschijnen hier na de eerstvolgende metingen.</p></div>}
      </div>
    </section>
  </div>
}
