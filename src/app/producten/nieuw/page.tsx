import Link from 'next/link'
import { createSmartProductAction } from '@/app/actions/smartProductActions'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  const user = await requireAuthenticatedUser()
  const canManagePricing = user.role === 'SUPER_ADMIN' || user.permissions.includes('pricing.manage')
  const [countries, productGroups] = await Promise.all([
    getActiveCompanyCountries(user.companyId),
    prisma.productGroup.findMany({ where: { companyId: user.companyId, isActive: true }, orderBy: { name: 'asc' } }),
  ])
  const defaultCountry = countries.find((country) => country.code === 'NL') ?? countries[0]

  return <div className="space-y-5">
    <section className="strong-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div><p className="eyebrow">Smart product onboarding</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Product toevoegen</h1><p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Voer de bekende productdata in. PrySight gebruikt EAN, GTIN of MPN daarna zelf voor competitor discovery, meet gevonden kandidaten en zet alleen betrouwbare matches door naar pricing.</p></div>
        <Link href="/producten" className="secondary-action">Terug naar producten</Link>
      </div>

      <form action={createSmartProductAction} className="p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <div className="space-y-5">
            <section><h2 className="text-[14px] font-semibold text-[#252a37]">Basis en automatische herkenning</h2><p className="mt-1 text-[11px] text-[#8790a2]">Artikelnummer en naam zijn verplicht. Eén goede identifier is meestal genoeg om het automatische onderzoek te starten.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-[11px] font-semibold text-[#4f5869]">Artikelnummer *<input name="articleNumber" required className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Productnaam *<input name="name" required className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">EAN<input name="ean" inputMode="numeric" className="toolbar-control mt-1.5 w-full" placeholder="871..." /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">GTIN<input name="gtin" inputMode="numeric" className="toolbar-control mt-1.5 w-full" placeholder="GTIN-13 of GTIN-14" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">MPN<input name="mpn" className="toolbar-control mt-1.5 w-full" placeholder="Manufacturer part number" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Merk<input name="brand" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Model<input name="model" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Productgroep<input name="productGroup" list="product-groups" className="toolbar-control mt-1.5 w-full" /><datalist id="product-groups">{productGroups.map((group) => <option key={group.id} value={group.name} />)}</datalist></label>
              </div>
            </section>

            <section className="border-t border-[var(--border)] pt-5"><h2 className="text-[14px] font-semibold text-[#252a37]">Verkoop en markt</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#4f5869]">Land<select name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full"><option value="">Algemeen</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Eigen prijs<input name="ownPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="0,00" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Valuta<select name="currency" defaultValue={defaultCountry?.currency ?? 'EUR'} className="toolbar-control mt-1.5 w-full"><option>EUR</option><option>GBP</option><option>DKK</option><option>USD</option></select></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Voorraadstatus<input name="stockStatus" className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Eenheid<input name="packagingUnit" defaultValue="stuks" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Aantal per verpakking<input name="packagingQty" type="number" min="1" defaultValue="1" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869] md:col-span-2">Eigen product URL<input name="ownUrl" type="url" className="toolbar-control mt-1.5 w-full" /></label>
            </div></section>

            {canManagePricing ? <section className="border-t border-[var(--border)] pt-5"><h2 className="text-[14px] font-semibold text-[#252a37]">Kosten en commerciële guardrails</h2><p className="mt-1 text-[11px] text-[#8790a2]">Deze grenzen blijven altijd leidend, ook wanneer het product later op Automatic staat.</p><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-[11px] font-semibold text-[#4f5869]">Kostprijs excl. btw<input name="costPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Minimale marge %<input name="minimumMarginPct" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Doelmarge %<input name="targetMarginPct" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Minimumprijs<input name="minimumPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Maximumprijs<input name="maximumPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
            </div></section> : null}
          </div>

          <aside className="rounded-[14px] bg-[#f6f8fb] p-4 sm:p-5">
            <h2 className="text-[13px] font-semibold text-[#252a37]">Wat PrySight daarna doet</h2>
            <ol className="mt-4 space-y-3 text-[10px] leading-5 text-[#667388]"><li><strong>1.</strong> Identifier en productkenmerken normaliseren.</li><li><strong>2.</strong> Zelf concurrentkandidaten zoeken.</li><li><strong>3.</strong> Kandidaten meten en betrouwbaarheid controleren.</li><li><strong>4.</strong> Alleen CERTAIN matches gebruiken voor prijsadvies.</li><li><strong>5.</strong> Marge en prijsgrenzen bewaken.</li></ol>
            {canManagePricing ? <div className="mt-5 border-t border-[#dde3ec] pt-4"><label className="block text-[11px] font-semibold text-[#4f5869]">Pricingmodus<select name="pricingMode" defaultValue="INHERIT" className="toolbar-control mt-1.5 w-full"><option value="INHERIT">Overnemen van productgroep</option><option value="MONITOR">Monitor</option><option value="ADVISE">Advise</option><option value="APPROVE">Approve</option><option value="AUTOMATIC">Automatic</option></select></label><label className="mt-3 block text-[11px] font-semibold text-[#4f5869]">Cooldown uren<input name="pricingCooldownHours" type="number" min="1" max="720" defaultValue="24" className="toolbar-control mt-1.5 w-full" /></label><p className="mt-3 text-[9px] leading-4 text-[#8790a2]">Automatic publiceert nooit buiten de ingestelde guardrails en gebruikt de bestaande verificatie- en rollbackketen.</p></div> : null}
          </aside>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5"><p className="text-[10px] text-[#8a93a5]">Je hoeft na opslaan niet eerst zelf concurrent-URLs te zoeken.</p><button type="submit" className="primary-action">Opslaan en automatisch onderzoeken</button></div>
      </form>
    </section>
  </div>
}
