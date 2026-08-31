export const dynamic = 'force-dynamic'

import { DataTable } from '@/components/DataTable'
import { getPricingRecommendations, type PricingStrategy } from '@/lib/pricing-engine'

const labels: Record<PricingStrategy, string> = {
  LOWEST_MATCH: 'Laagste marktprijs volgen',
  LOWEST_MINUS: 'Onder laagste marktprijs',
  SECOND_LOWEST: 'Tweede laagste volgen',
  MARKET_MEDIAN: 'Marktmediaan volgen',
  MARKET_AVERAGE: 'Marktgemiddelde volgen',
}

function read(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }
function numberValue(value: string | undefined, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function money(value: number | null) { return value === null ? '—' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value) }

export default async function PricingStrategyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const requestedStrategy = read(params.strategy) as PricingStrategy | undefined
  const strategy: PricingStrategy = requestedStrategy && requestedStrategy in labels ? requestedStrategy : 'MARKET_MEDIAN'
  const adjustmentPct = numberValue(read(params.adjustmentPct), 0)
  const maxChangePct = Math.max(0, numberValue(read(params.maxChangePct), 5))
  const minimumSignalPct = Math.max(0, numberValue(read(params.minimumSignalPct), 1))
  const onlyInStock = read(params.onlyInStock) !== 'false'
  const { recommendations } = await getPricingRecommendations({ strategy, adjustmentPct, maxChangePct, minimumSignalPct, onlyInStock })
  const actionable = recommendations.filter((item) => item.action === 'LOWER' || item.action === 'RAISE')
  const raises = recommendations.filter((item) => item.action === 'RAISE').length
  const lowers = recommendations.filter((item) => item.action === 'LOWER').length
  const noData = recommendations.filter((item) => item.action === 'NO_DATA').length

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="surface-card p-5 sm:p-6"><p className="eyebrow">Prijsstrategie</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Van marktdata naar gecontroleerd prijsadvies</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#697386]">De engine gebruikt uitsluitend goedgekeurde productmatches en kan uitverkochte concurrenten uitsluiten. Adviezen worden begrensd zodat één marktbeweging niet direct tot een grote prijswijziging leidt.</p></div>
        <div className="surface-card p-5"><p className="text-[12px] font-semibold text-[#252a37]">Veiligheidsstatus</p><div className="mt-3 rounded-2xl border border-[#ffe2b9] bg-[var(--amber-soft)] p-3.5"><p className="text-[12px] font-semibold text-[#8b5a15]">Adviesmodus actief</p><p className="mt-1 text-[11px] leading-5 text-[#8b6b3c]">Automatisch publiceren blijft uit totdat kostprijs, minimale marge en een gecontroleerde writeback koppeling beschikbaar zijn.</p></div></div>
      </section>

      <section className="surface-card p-4 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="text-[14px] font-semibold text-[#252a37]">Regels simuleren</h2><p className="mt-1 text-[11px] text-[#7d8698]">Pas de strategie aan en bekijk direct het effect zonder prijzen te publiceren.</p></div><form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><select name="strategy" defaultValue={strategy} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input name="adjustmentPct" type="number" step="0.1" defaultValue={adjustmentPct} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]" aria-label="Correctie percentage" /><input name="maxChangePct" type="number" step="0.1" min="0" defaultValue={maxChangePct} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]" aria-label="Maximale wijziging percentage" /><select name="onlyInStock" defaultValue={String(onlyInStock)} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]"><option value="true">Alleen op voorraad</option><option value="false">Alle actieve aanbiedingen</option></select><button className="focus-ring h-9 rounded-xl border border-[#d9e6ff] bg-[var(--blue-soft)] px-4 text-[11px] font-semibold text-[var(--blue)]">Simuleer</button><input type="hidden" name="minimumSignalPct" value={minimumSignalPct} /></form></div></section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Actieadviezen', actionable.length, 'Prijsbeweging groter dan signaaldrempel', 'var(--violet-soft)', 'var(--violet)'],
          ['Ruimte omhoog', raises, 'Mogelijke margeverbetering', 'var(--green-soft)', 'var(--green)'],
          ['Prijsdruk', lowers, 'Markt vraagt mogelijk om verlaging', 'var(--accent-soft)', 'var(--accent)'],
          ['Onvoldoende data', noData, 'Eigen prijs of betrouwbare marktdata ontbreekt', 'var(--amber-soft)', 'var(--amber)'],
        ].map(([title, value, helper, background, color]) => <div key={String(title)} className="surface-card-flat p-4"><div className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: String(background), color: String(color) }}>{title}</div><p className="mt-3 text-[27px] font-semibold tracking-[-0.03em] text-[#171b28]">{String(value)}</p><p className="mt-1 text-[11px] leading-5 text-[#8790a2]">{helper}</p></div>)}
      </section>

      <section className="surface-card p-4 sm:p-5"><div className="mb-3"><h2 className="text-[14px] font-semibold text-[#252a37]">Prijsadviezen</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Marktpositie en advies op basis van de gekozen simulatieregels.</p></div><DataTable emptyText="Nog geen producten met voldoende marktdata." columns={[{ key: 'product', header: 'Product' }, { key: 'eigen', header: 'Eigen prijs' }, { key: 'laagste', header: 'Laagste markt' }, { key: 'mediaan', header: 'Mediaan' }, { key: 'advies', header: 'Advies' }, { key: 'actie', header: 'Actie' }, { key: 'reden', header: 'Onderbouwing' }]} rows={recommendations.map((item) => ({ product: `${item.articleNumber} · ${item.productName}`, eigen: money(item.ownPrice), laagste: money(item.marketLowest), mediaan: money(item.marketMedian), advies: money(item.recommendedPrice), actie: item.action === 'RAISE' ? 'Verhogen' : item.action === 'LOWER' ? 'Verlagen' : item.action === 'KEEP' ? 'Behouden' : 'Geen data', reden: item.reason }))} /></section>
    </div>
  )
}
