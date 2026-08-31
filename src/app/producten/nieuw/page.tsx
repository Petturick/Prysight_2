import Link from 'next/link'
import { createProductAction } from '@/app/actions/productActions'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  const user = await requireAuthenticatedUser()
  const [countries, productGroups] = await Promise.all([
    getActiveCompanyCountries(user.companyId),
    prisma.productGroup.findMany({ where: { companyId: user.companyId, isActive: true }, orderBy: { name: 'asc' } }),
  ])
  const defaultCountry = countries.find((country) => country.code === 'NL') ?? countries[0]

  return (
    <div className="space-y-5">
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Product toevoegen</h1>
            <p className="mt-2 max-w-2xl text-[12px] leading-6 text-[#697386]">Voeg één product handmatig toe. Daarna kun je concurrent URLs koppelen en direct prijscontroles uitvoeren.</p>
          </div>
          <Link href="/producten" className="secondary-action">Terug naar producten</Link>
        </div>

        <form action={createProductAction} className="p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-5">
              <div>
                <h2 className="text-[14px] font-semibold text-[#252a37]">Productgegevens</h2>
                <p className="mt-1 text-[11px] text-[#8790a2]">Artikelnummer en productnaam zijn verplicht. De overige velden helpen bij matching en prijsanalyse.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-[11px] font-semibold text-[#4f5869]">Artikelnummer *<input name="articleNumber" required className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld 40.0123" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">EAN<input name="ean" className="toolbar-control mt-1.5 w-full" placeholder="8711111111111" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869] md:col-span-2">Productnaam *<input name="name" required className="toolbar-control mt-1.5 w-full" placeholder="Productnaam zoals in de webshop" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Productgroep<input name="productGroup" list="product-groups" className="toolbar-control mt-1.5 w-full" placeholder="Kies of typ een productgroep" /><datalist id="product-groups">{productGroups.map((group) => <option key={group.id} value={group.name} />)}</datalist></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Land<select name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full"><option value="">Algemeen</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Eigen prijs<input name="ownPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="0,00" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Valuta<select name="currency" defaultValue={defaultCountry?.currency ?? 'EUR'} className="toolbar-control mt-1.5 w-full"><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="DKK">DKK</option><option value="USD">USD</option></select></label>
                <label className="text-[11px] font-semibold text-[#4f5869] md:col-span-2">Eigen product URL<input name="ownUrl" type="url" className="toolbar-control mt-1.5 w-full" placeholder="https://www.engelslogistiek.nl/product/..." /></label>
              </div>
            </div>

            <div className="rounded-[14px] bg-[#f6f8fb] p-4 sm:p-5">
              <h2 className="text-[13px] font-semibold text-[#252a37]">Monitoring instellingen</h2>
              <div className="mt-4 space-y-4">
                <label className="block text-[11px] font-semibold text-[#4f5869]">Voorraadstatus<input name="stockStatus" className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[11px] font-semibold text-[#4f5869]">Eenheid<input name="packagingUnit" defaultValue="stuks" className="toolbar-control mt-1.5 w-full" /></label>
                  <label className="text-[11px] font-semibold text-[#4f5869]">Aantal<input name="packagingQty" type="number" min="1" defaultValue="1" className="toolbar-control mt-1.5 w-full" /></label>
                </div>
              </div>
              <div className="mt-5 rounded-[12px] border border-[#dbe3f4] bg-white p-4">
                <p className="text-[11px] font-semibold text-[#35405a]">Na opslaan</p>
                <p className="mt-1 text-[10px] leading-5 text-[#7b8497]">Open het product en voeg één of meer concurrent product URLs toe. Prysight kan die URLs vervolgens controleren en de prijsontwikkeling bewaren.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
            <p className="text-[10px] text-[#8a93a5]">Handmatig toevoegen gebruikt dezelfde productstructuur als Feedbeheer en Syntrx.</p>
            <button type="submit" className="primary-action">Product opslaan en monitoren</button>
          </div>
        </form>
      </section>
    </div>
  )
}
