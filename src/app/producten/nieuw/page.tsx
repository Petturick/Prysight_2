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

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow">Product toevoegen</p>
            <h1 className="mt-2">Eén product invoeren</h1>
            <p className="mt-2 text-[12px] leading-6 text-[#6f7d90]">Vul alleen in wat je nodig hebt om te starten. Product, jouw verkoopprijs en markt staan voorop. Prysight helpt daarna met concurrenten en prijsmonitoring.</p>
          </div>
          <Link href="/producten" className="secondary-action">Terug naar producten</Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Andere manieren om producten toe te voegen">
        <div className="ps-panel border-[#cfe0fb] bg-[#f7faff] p-4">
          <p className="text-[10px] font-semibold text-[#4f86e8]">Huidige keuze</p>
          <p className="mt-1 text-[14px] font-semibold text-[#20344b]">Eén product</p>
          <p className="mt-1 text-[11px] leading-5 text-[#748296]">Snel handmatig toevoegen en direct een eigen prijs instellen.</p>
        </div>
        <Link href="/import/bulk" className="ps-panel p-4 transition hover:border-[#c7d5e8] hover:shadow-[0_7px_18px_rgba(31,49,77,.06)]">
          <p className="text-[10px] font-semibold text-[#7a8798]">Veel producten</p>
          <p className="mt-1 text-[14px] font-semibold text-[#20344b]">Excel of CSV</p>
          <p className="mt-1 text-[11px] leading-5 text-[#748296]">Importeer een complete lijst met automatische kolomherkenning.</p>
        </Link>
        <Link href="/feeds" className="ps-panel p-4 transition hover:border-[#c7d5e8] hover:shadow-[0_7px_18px_rgba(31,49,77,.06)]">
          <p className="text-[10px] font-semibold text-[#7a8798]">Automatisch bijhouden</p>
          <p className="mt-1 text-[14px] font-semibold text-[#20344b]">Productfeed koppelen</p>
          <p className="mt-1 text-[11px] leading-5 text-[#748296]">Laat productdata en prijzen periodiek synchroniseren vanuit je bron.</p>
        </Link>
      </section>

      <form action={createSmartProductAction} className="space-y-4">
        <section className="ps-panel overflow-hidden">
          <div className="border-b border-[#e7edf3] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#edf4ff] text-[11px] font-bold text-[#3d73d4]">1</span>
              <div>
                <h2 className="text-[15px] font-semibold text-[#21364d]">Welk product wil je volgen?</h2>
                <p className="mt-0.5 text-[11px] text-[#7b8999]">Artikelnummer en productnaam zijn verplicht. Een EAN maakt automatische matching veel sterker.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="text-[11px] font-semibold text-[#4f5869]">Artikelnummer *<input name="articleNumber" required autoFocus className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld PB-121076" /></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Productnaam *<input name="name" required className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld Palletbox 1200 x 1000" /></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">EAN<input name="ean" inputMode="numeric" className="toolbar-control mt-1.5 w-full" placeholder="871..." /></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Productgroep<input name="productGroup" list="product-groups" className="toolbar-control mt-1.5 w-full" placeholder="Kies of typ een productgroep" /><datalist id="product-groups">{productGroups.map((group) => <option key={group.id} value={group.name} />)}</datalist></label>
            <details className="sm:col-span-2">
              <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-[#40556e]">Meer productkenmerken toevoegen</summary>
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[11px] font-semibold text-[#4f5869]">GTIN<input name="gtin" inputMode="numeric" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">MPN<input name="mpn" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Merk<input name="brand" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Model<input name="model" className="toolbar-control mt-1.5 w-full" /></label>
              </div>
            </details>
          </div>
        </section>

        <section className="ps-panel overflow-hidden" id="prijs">
          <div className="border-b border-[#e7edf3] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#edf4ff] text-[11px] font-bold text-[#3d73d4]">2</span>
              <div>
                <h2 className="text-[15px] font-semibold text-[#21364d]">Wat is jouw verkoopprijs?</h2>
                <p className="mt-0.5 text-[11px] text-[#7b8999]">Deze prijs is het referentiepunt waarmee Prysight de markt vergelijkt. Je kunt hem later altijd aanpassen op het product.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1.1fr_.7fr_.55fr]">
            <label className="text-[11px] font-semibold text-[#4f5869]">Jouw verkoopprijs *<div className="mt-1.5 flex items-center rounded-[7px] border border-[#cbd9eb] bg-white shadow-[0_1px_2px_rgba(31,49,77,.02)] focus-within:border-[#8cb1f3] focus-within:shadow-[0_0_0_3px_rgba(79,134,232,.09)]"><span className="px-3 text-[13px] font-semibold text-[#64748b]">{defaultCountry?.currency === 'GBP' ? '£' : '€'}</span><input name="ownPrice" required inputMode="decimal" className="min-h-[46px] flex-1 border-0 bg-transparent px-0 pr-3 text-[16px] font-semibold shadow-none outline-none focus:shadow-none" placeholder="0,00" /></div></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Markt<select name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full"><option value="">Algemeen</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Valuta<select name="currency" defaultValue={defaultCountry?.currency ?? 'EUR'} className="toolbar-control mt-1.5 w-full"><option>EUR</option><option>GBP</option><option>DKK</option><option>USD</option></select></label>
          </div>
        </section>

        <section className="ps-panel overflow-hidden">
          <div className="border-b border-[#e7edf3] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#edf4ff] text-[11px] font-bold text-[#3d73d4]">3</span>
              <div>
                <h2 className="text-[15px] font-semibold text-[#21364d]">Maak monitoring compleet</h2>
                <p className="mt-0.5 text-[11px] text-[#7b8999]">Deze gegevens zijn nuttig, maar niet nodig om te kunnen starten.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="text-[11px] font-semibold text-[#4f5869] sm:col-span-2">Jouw product URL<input name="ownUrl" type="url" className="toolbar-control mt-1.5 w-full" placeholder="https://jouwwebshop.nl/product/..." /></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Voorraadstatus<input name="stockStatus" className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
            <div className="grid grid-cols-[1fr_.7fr] gap-3">
              <label className="text-[11px] font-semibold text-[#4f5869]">Eenheid<input name="packagingUnit" defaultValue="stuks" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Aantal<input name="packagingQty" type="number" min="1" defaultValue="1" className="toolbar-control mt-1.5 w-full" /></label>
            </div>
          </div>
        </section>

        {canManagePricing ? (
          <details className="ps-panel">
            <summary className="cursor-pointer px-5 py-4 text-[12px] font-semibold text-[#40556e] sm:px-6">Geavanceerde prijsinstellingen</summary>
            <div className="border-t border-[#e7edf3] p-5 sm:p-6">
              <p className="mb-4 text-[11px] leading-5 text-[#7b8999]">Alleen nodig wanneer je margegrenzen of automatische prijsbeslissingen wilt instellen. Voor normale prijsmonitoring kun je dit overslaan.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[11px] font-semibold text-[#4f5869]">Kostprijs excl. btw<input name="costPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Minimale marge %<input name="minimumMarginPct" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Doelmarge %<input name="targetMarginPct" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Minimumprijs<input name="minimumPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Maximumprijs<input name="maximumPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Pricingmodus<select name="pricingMode" defaultValue="INHERIT" className="toolbar-control mt-1.5 w-full"><option value="INHERIT">Standaard overnemen</option><option value="MONITOR">Alleen monitoren</option><option value="ADVISE">Prijs adviseren</option><option value="APPROVE">Na goedkeuring</option><option value="AUTOMATIC">Automatisch</option></select></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Cooldown uren<input name="pricingCooldownHours" type="number" min="1" max="720" defaultValue="24" className="toolbar-control mt-1.5 w-full" /></label>
              </div>
            </div>
          </details>
        ) : null}

        <section className="ps-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[12px] font-semibold text-[#2d4058]">Na toevoegen</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#7b8999]">Prysight opent direct het productdetail. Met EAN, GTIN of MPN kan het systeem vervolgens concurrentkandidaten zoeken. Je eigen prijs blijft altijd zichtbaar en aanpasbaar.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/producten" className="secondary-action">Annuleren</Link>
            <button type="submit" className="primary-action min-w-[150px]">Product toevoegen</button>
          </div>
        </section>
      </form>
    </div>
  )
}
