export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createPriceChangeRequestAction } from '@/app/actions/priceChangeActions'
import { DataTable } from '@/components/DataTable'
import { requirePermission } from '@/lib/authz'
import { profileStep } from '@/lib/performance-profile'
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
function pct(value: number | null) { return value === null ? '—' : `${value.toFixed(1)}%` }

export default async function PricingStrategyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission('pricing.manage')
  const params = await searchParams
  const isSimulation = read(params.simulate) === '1'
  const requestedStrategy = read(params.strategy) as PricingStrategy | undefined
  const strategy: PricingStrategy = requestedStrategy && requestedStrategy in labels ? requestedStrategy : 'MARKET_MEDIAN'
  const adjustmentPct = numberValue(read(params.adjustmentPct), 0)
  const maxChangePct = Math.max(0, numberValue(read(params.maxChangePct), 5))
  const minimumSignalPct = Math.max(0, numberValue(read(params.minimumSignalPct), 1))
  const onlyInStock = read(params.onlyInStock) !== 'false'
  const simulationConfig = isSimulation ? { strategy, adjustmentPct, maxChangePct, minimumSignalPct, onlyInStock } : {}
  const { recommendations } = await profileStep(
    '/prijsstrategie',
    'recommendations',
    () => getPricingRecommendations(actor.companyId, simulationConfig, 200, !isSimulation),
    { companyId: actor.companyId, mode: isSimulation ? 'simulation' : 'rules' },
    600,
  )
  const actionable = recommendations.filter((item) => item.action === 'LOWER' || item.action === 'RAISE')
  const raises = recommendations.filter((item) => item.action === 'RAISE').length
  const lowers = recommendations.filter((item) => item.action === 'LOWER').length
  const noData = recommendations.filter((item) => item.action === 'NO_DATA').length
  const guarded = recommendations.filter((item) => item.costPrice !== null || item.minimumAllowedPrice !== null || item.maximumAllowedPrice !== null).length
  const guardedCoverage = recommendations.length ? Math.round((guarded / recommendations.length) * 100) : 0

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <div className="surface-card p-5 sm:p-6">
          <p className="eyebrow">Prijsstrategie</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Van marktdata naar gecontroleerd prijsadvies</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#697386]">Adviezen worden per land berekend. Kostprijs, minimale marge, minimum en maximum verkoopprijs, afronding en concurrentiedekking worden bewaakt voordat een prijswijziging kan worden aangevraagd.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/prijsregels" className="secondary-action">Beheer prijsregels</Link><Link href="/prijswijzigingen" className="primary-action">Open goedkeuringscentrum</Link>{isSimulation ? <Link href="/prijsstrategie" className="secondary-action">Terug naar opgeslagen regels</Link> : null}</div>
        </div>
        <div className="surface-card p-5">
          <p className="text-[12px] font-semibold text-[#252a37]">Veiligheidsstatus</p>
          <div className="mt-3 rounded-[12px] border border-[#cfeadf] bg-[#f4fbf7] p-3.5"><div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[#246f50]">Guardrails en goedkeuring actief</p><span className="ps-chip ps-chip-green">{guardedCoverage}% gedekt</span></div><p className="mt-1 text-[11px] leading-5 text-[#5f766b]">Kostprijs en harde prijsgrenzen worden opnieuw gecontroleerd voordat een wijziging kan worden aangevraagd.</p></div>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.06em] text-[#6f7b91]">Modus</p><p className="mt-1 text-[12px] font-semibold text-[#111827]">{isSimulation ? 'Tijdelijke simulatie' : 'Opgeslagen prijsregels'}</p>
        </div>
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 className="text-[14px] font-semibold text-[#252a37]">Los scenario simuleren</h2><p className="mt-1 text-[11px] text-[#7d8698]">Een simulatie overschrijft tijdelijk de opgeslagen prijsregels, maar kan nooit als externe prijswijziging worden gepubliceerd.</p></div>
          <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input type="hidden" name="simulate" value="1" />
            <select name="strategy" defaultValue={strategy} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input name="adjustmentPct" type="number" step="0.1" defaultValue={adjustmentPct} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]" aria-label="Correctie percentage" />
            <input name="maxChangePct" type="number" step="0.1" min="0" defaultValue={maxChangePct} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]" aria-label="Maximale wijziging percentage" />
            <select name="onlyInStock" defaultValue={String(onlyInStock)} className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[11px] text-[#566071]"><option value="true">Alleen op voorraad</option><option value="false">Alle actieve aanbiedingen</option></select>
            <button className="focus-ring h-9 rounded-xl border border-[#bfd0eb] bg-[#edf3fb] px-4 text-[11px] font-semibold text-[#355a91]">Simuleer</button>
            <input type="hidden" name="minimumSignalPct" value={minimumSignalPct} />
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Actieadviezen', actionable.length, 'Prijsbeweging groter dan signaaldrempel'],
          ['Ruimte omhoog', raises, 'Mogelijke margeverbetering'],
          ['Prijsdruk', lowers, 'Markt vraagt mogelijk om verlaging'],
          ['Onvoldoende data', noData, 'Eigen prijs, marktdata of minimale dekking ontbreekt'],
          ['Guardrail dekking', `${guardedCoverage}%`, 'Marktadviezen met commerciële bescherming'],
        ].map(([title, value, helper]) => <div key={String(title)} className="surface-card-flat p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6f7b91]">{title}</p><p className="mt-2 text-[27px] font-semibold tracking-[-0.03em] text-[#171b28]">{String(value)}</p><p className="mt-1 text-[11px] leading-5 text-[#8790a2]">{helper}</p></div>)}
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3"><h2 className="text-[14px] font-semibold text-[#252a37]">Prijsadviezen per markt</h2><p className="mt-1 text-[11px] text-[#8a93a5]">Iedere rij is één product in één markt. Concurrentprijzen uit andere landen tellen niet mee.</p></div>
        <DataTable
          emptyText="Nog geen producten met voldoende marktdata."
          columns={[
            { key: 'product', header: 'Product' },
            { key: 'markt', header: 'Markt' },
            { key: 'eigen', header: 'Eigen prijs' },
            { key: 'kost', header: 'Kostprijs' },
            { key: 'marge', header: 'Marge nu' },
            { key: 'laagste', header: 'Laagste markt' },
            { key: 'advies', header: 'Advies' },
            { key: 'margeNa', header: 'Marge advies' },
            { key: 'regel', header: 'Regel' },
            { key: 'actie', header: 'Actie' },
            { key: 'uitvoering', header: 'Uitvoering' },
          ]}
          rows={recommendations.map((item) => ({
            product: `${item.articleNumber} · ${item.productName}`,
            markt: item.countryCode ?? item.countryName ?? 'Algemeen',
            eigen: money(item.ownPrice),
            kost: money(item.costPrice),
            marge: pct(item.marginBeforePct),
            laagste: money(item.marketLowest),
            advies: money(item.recommendedPrice),
            margeNa: pct(item.marginAfterPct),
            regel: item.appliedRuleName ?? (isSimulation ? 'Simulatie' : 'Standaard'),
            actie: item.action === 'RAISE' ? 'Verhogen' : item.action === 'LOWER' ? 'Verlagen' : item.action === 'KEEP' ? 'Behouden' : item.reason,
            uitvoering: !isSimulation && item.recommendedPrice !== null && (item.action === 'RAISE' || item.action === 'LOWER') ? <form action={createPriceChangeRequestAction}><input type="hidden" name="productId" value={item.productId} /><input type="hidden" name="countryId" value={item.countryId ?? ''} /><input type="hidden" name="recommendedPrice" value={item.recommendedPrice} /><input type="hidden" name="reason" value={item.reason} /><button className="rounded-[8px] border border-[#bfd0eb] bg-[#edf3fb] px-2.5 py-1.5 text-[10px] font-semibold text-[#355a91]">Aanvragen</button></form> : <span className="text-[10px] text-[#98a1b0]">—</span>,
          }))}
        />
      </section>
    </div>
  )
}
