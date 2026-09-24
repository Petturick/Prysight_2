export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { deletePricingRuleAction, savePricingRuleAction, saveProductGuardrailAction } from '@/app/actions/pricingActions'
import { requirePermission } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { getPersistedPricingRules, getProductPricingGuardrails } from '@/lib/pricing-rules'
import { prisma } from '@/lib/prisma'
import { productGroupLabel } from '@/lib/product-groups'

const strategyLabels: Record<string, string> = {
  LOWEST_MATCH: 'Laagste marktprijs volgen',
  LOWEST_MINUS: 'Onder laagste marktprijs',
  SECOND_LOWEST: 'Tweede laagste volgen',
  MARKET_MEDIAN: 'Marktmediaan volgen',
  MARKET_AVERAGE: 'Marktgemiddelde volgen',
}

const roundingLabels: Record<string, string> = {
  CENT: 'Normaal op centen',
  WHOLE: 'Hele euro',
  END_95: 'Eindigen op ,95',
  END_99: 'Eindigen op ,99',
}

function read(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function fieldClass() {
  return 'h-10 w-full rounded-[8px] border border-[#dce3eb] bg-white px-3 text-[12px] font-medium text-[#33445d] outline-none transition focus:border-[#8cb1f3] focus:ring-2 focus:ring-[#dbe8fb]'
}

function money(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

export default async function PricingRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission('pricing.manage')
  const params = await searchParams
  const selectedProductId = read(params.productId) ?? ''
  const editRuleId = read(params.editRuleId) ?? ''

  const [countries, productGroups, products, rules] = await Promise.all([
    getActiveCompanyCountries(actor.companyId),
    prisma.productGroup.findMany({ where: { companyId: actor.companyId, isActive: true }, select: { id: true, name: true, description: true }, orderBy: { name: 'asc' } }),
    prisma.product.findMany({ where: { companyId: actor.companyId, isActive: true }, select: { id: true, articleNumber: true, name: true, productGroupId: true }, orderBy: { name: 'asc' }, take: 1000 }),
    getPersistedPricingRules(actor.companyId),
  ])

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null
  const guardrails = selectedProduct ? await getProductPricingGuardrails(actor.companyId, [selectedProduct.id]) : new Map()
  const selectedGuardrail = selectedProduct ? guardrails.get(selectedProduct.id) ?? null : null
  const editRule = rules.find((rule) => rule.id === editRuleId) ?? null
  const countryById = new Map(countries.map((country) => [country.id, country.name]))
  const groupById = new Map(productGroups.map((group) => [group.id, productGroupLabel(group)]))
  const productById = new Map(products.map((product) => [product.id, `${product.articleNumber} · ${product.name}`]))

  return (
    <div className="space-y-5">
      <section className="ps-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Pricing governance</p>
            <h1 className="mt-2">Prijsregels en commerciële guardrails</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#4b5870]">Leg vast hoe PrySight mag adviseren. Productgrenzen zijn hard, prijsregels bepalen de strategie per organisatie, land, productgroep of product.</p>
          </div>
          <Link href="/prijsstrategie" className="primary-action">Bekijk prijsadviezen</Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="surface-card overflow-hidden">
          <div className="border-b border-[var(--border-strong)] bg-[#f8fafc] px-5 py-4">
            <h2 className="text-[15px] font-semibold">{editRule ? 'Prijsregel bewerken' : 'Nieuwe prijsregel'}</h2>
            <p className="mt-1 text-[11px] font-medium text-[#718096]">Een specifiekere regel wint van een algemene regel. Bij gelijke specificiteit wint de hoogste prioriteit.</p>
          </div>
          <form action={savePricingRuleAction} className="grid gap-4 p-5 sm:grid-cols-2">
            {editRule ? <input type="hidden" name="ruleId" value={editRule.id} /> : null}
            <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Naam</span><input name="name" required defaultValue={editRule?.name ?? ''} placeholder="Bijvoorbeeld Nederland palletboxen" className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Land</span><select name="countryId" defaultValue={editRule?.countryId ?? ''} className={fieldClass()}><option value="">Alle landen</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Productgroep</span><select name="productGroupId" defaultValue={editRule?.productGroupId ?? ''} className={fieldClass()}><option value="">Alle productgroepen</option>{productGroups.filter((group) => productGroupLabel(group) !== 'Nog niet ingedeeld').map((group) => <option key={group.id} value={group.id}>{productGroupLabel(group)}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Specifiek product</span><select name="productId" defaultValue={editRule?.productId ?? ''} className={fieldClass()}><option value="">Geen specifiek product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.articleNumber} · {product.name}</option>)}</select></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Strategie</span><select name="strategy" defaultValue={editRule?.strategy ?? 'MARKET_MEDIAN'} className={fieldClass()}>{Object.entries(strategyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Prijsafronding</span><select name="roundingMode" defaultValue={editRule?.roundingMode ?? 'CENT'} className={fieldClass()}>{Object.entries(roundingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Correctie procent</span><input name="adjustmentPct" type="number" step="0.1" defaultValue={editRule?.adjustmentPct ?? 0} className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Max wijziging procent</span><input name="maxChangePct" type="number" min="0" max="100" step="0.1" defaultValue={editRule?.maxChangePct ?? 5} className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Signaaldrempel procent</span><input name="minimumSignalPct" type="number" min="0" max="100" step="0.1" defaultValue={editRule?.minimumSignalPct ?? 1} className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Minimaal concurrenten</span><input name="minimumCompetitors" type="number" min="1" step="1" defaultValue={editRule?.minimumCompetitors ?? 2} className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Minimale marge procent</span><input name="minimumMarginPct" type="number" min="0" max="99.9" step="0.1" defaultValue={money(editRule?.minimumMarginPct)} placeholder="Optioneel" className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Minimumprijs</span><input name="minimumPrice" type="number" min="0" step="0.01" defaultValue={money(editRule?.minimumPrice)} placeholder="Optioneel" className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Maximumprijs</span><input name="maximumPrice" type="number" min="0" step="0.01" defaultValue={money(editRule?.maximumPrice)} placeholder="Optioneel" className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Prioriteit</span><input name="priority" type="number" step="1" defaultValue={editRule?.priority ?? 0} className={fieldClass()} /></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Voorraadfilter</span><select name="onlyInStock" defaultValue={String(editRule?.onlyInStock ?? true)} className={fieldClass()}><option value="true">Alleen op voorraad</option><option value="false">Alle actieve aanbiedingen</option></select></label>
            <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Goedkeuring</span><select name="requireApproval" defaultValue={String(editRule?.requireApproval ?? true)} className={fieldClass()}><option value="true">Altijd goedkeuren</option><option value="false">Mag later automatisch</option></select></label>
            <div className="flex gap-2 sm:col-span-2"><button className="primary-action" type="submit">{editRule ? 'Wijzigingen opslaan' : 'Prijsregel opslaan'}</button>{editRule ? <Link href="/prijsregels" className="secondary-action">Annuleren</Link> : null}</div>
          </form>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="border-b border-[var(--border-strong)] bg-[#f8fafc] px-5 py-4"><h2 className="text-[15px] font-semibold">Productguardrails</h2><p className="mt-1 text-[11px] font-medium text-[#718096]">Deze waarden zijn harder dan iedere prijsregel. Kostprijs is netto, exclusief btw.</p></div>
          <form className="border-b border-[var(--border)] p-5"><label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Product laden</span><div className="flex gap-2"><select name="productId" defaultValue={selectedProductId} className={fieldClass()}><option value="">Kies een product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.articleNumber} · {product.name}</option>)}</select><button className="secondary-action" type="submit">Laden</button></div></label></form>
          {selectedProduct ? (
            <form action={saveProductGuardrailAction} className="grid gap-4 p-5 sm:grid-cols-2">
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div className="sm:col-span-2 rounded-xl border border-[#d5dce7] bg-[#f5f7fa] px-4 py-3"><p className="text-[12px] font-semibold text-[#172033]">{selectedProduct.articleNumber} · {selectedProduct.name}</p></div>
              <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Kostprijs netto</span><input name="costPrice" type="number" min="0" step="0.01" defaultValue={money(selectedGuardrail?.costPrice)} className={fieldClass()} /></label>
              <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Minimale marge procent</span><input name="minimumMarginPct" type="number" min="0" max="99.9" step="0.1" defaultValue={money(selectedGuardrail?.minimumMarginPct)} className={fieldClass()} /></label>
              <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Minimumprijs</span><input name="minimumPrice" type="number" min="0" step="0.01" defaultValue={money(selectedGuardrail?.minimumPrice)} className={fieldClass()} /></label>
              <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Maximumprijs</span><input name="maximumPrice" type="number" min="0" step="0.01" defaultValue={money(selectedGuardrail?.maximumPrice)} className={fieldClass()} /></label>
              <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Doelmarge procent</span><input name="targetMarginPct" type="number" min="0" max="99.9" step="0.1" defaultValue={money(selectedGuardrail?.targetMarginPct)} className={fieldClass()} /></label>
              <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68758a]">Productafronding</span><select name="priceRoundingMode" defaultValue={selectedGuardrail?.priceRoundingMode ?? 'CENT'} className={fieldClass()}>{Object.entries(roundingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <button className="primary-action sm:col-span-2" type="submit">Guardrails opslaan</button>
            </form>
          ) : <div className="p-5 text-[12px] font-semibold text-[#68758a]">Kies eerst een product om de commerciële grenzen te beheren.</div>}
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-[var(--border-strong)] bg-[#f8fafc] px-5 py-4"><h2 className="text-[15px] font-semibold">Actieve prijsregels</h2><p className="mt-1 text-[11px] font-medium text-[#718096]">{rules.length} regel{rules.length === 1 ? '' : 's'} actief voor deze organisatie.</p></div>
        {rules.length === 0 ? <div className="p-5 text-[12px] font-semibold text-[#68758a]">Nog geen prijsregels. Zonder regel gebruikt PrySight de veilige standaardstrategie.</div> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead className="border-b border-[var(--border)] bg-[#f4f6f9] text-[#5d687d]"><tr><th className="px-4 py-3 font-semibold">Regel</th><th className="px-4 py-3 font-semibold">Scope</th><th className="px-4 py-3 font-semibold">Strategie</th><th className="px-4 py-3 font-semibold">Guardrails</th><th className="px-4 py-3 font-semibold">Goedkeuring</th><th className="px-4 py-3 font-semibold">Acties</th></tr></thead><tbody>{rules.map((rule) => {
            const scope = [rule.countryId ? countryById.get(rule.countryId) : null, rule.productGroupId ? groupById.get(rule.productGroupId) : null, rule.productId ? productById.get(rule.productId) : null].filter(Boolean).join(' · ') || 'Hele organisatie'
            return <tr key={rule.id} className="border-b border-[var(--border)] align-top last:border-0"><td className="px-4 py-3"><p className="font-semibold text-[#111827]">{rule.name}</p><p className="mt-1 text-[10px] text-[#738096]">Prioriteit {rule.priority}</p></td><td className="max-w-[280px] px-4 py-3 font-semibold text-[#4b5870]">{scope}</td><td className="px-4 py-3"><p className="font-bold text-[#111827]">{strategyLabels[rule.strategy]}</p><p className="mt-1 text-[10px] text-[#738096]">Min {rule.minimumCompetitors} concurrenten, max {rule.maxChangePct}% wijziging</p></td><td className="px-4 py-3 font-semibold text-[#4b5870]">{rule.minimumMarginPct !== null ? `Marge ≥ ${rule.minimumMarginPct}%` : 'Geen regelmarge'}{rule.minimumPrice !== null ? ` · min € ${rule.minimumPrice}` : ''}{rule.maximumPrice !== null ? ` · max € ${rule.maximumPrice}` : ''}</td><td className="px-4 py-3 font-bold text-[#4b5870]">{rule.requireApproval ? 'Verplicht' : 'Later automatiseerbaar'}</td><td className="px-4 py-3"><div className="flex gap-2"><Link href={`/prijsregels?editRuleId=${encodeURIComponent(rule.id)}`} className="secondary-action">Bewerken</Link><form action={deletePricingRuleAction.bind(null, rule.id)}><button type="submit" className="secondary-action">Verwijderen</button></form></div></td></tr>
          })}</tbody></table></div>
        )}
      </section>
    </div>
  )
}
