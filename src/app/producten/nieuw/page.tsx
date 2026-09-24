import Link from 'next/link'
import { selectedMarketCode } from '@/lib/market-context'
import { createSmartProductAction } from '@/app/actions/smartProductActions'
import { ProductUrlQuickStart } from '@/components/ProductUrlQuickStart'
import { EanDiscoveryField } from '@/components/EanDiscoveryField'
import { ProductCreateSubmitButton } from '@/components/ProductCreateSubmitButton'
import { ProductGroupField } from '@/components/ProductGroupField'
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
  const marketCode = await selectedMarketCode(user.companyId)
  const defaultCountry = countries.find((country) => country.code.toUpperCase() === marketCode) ?? countries.find((country) => country.code === 'NL') ?? countries[0]

  return (
    <div className="mx-auto max-w-[1050px] space-y-3 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] pb-3">
        <div>
          <Link href="/producten" className="text-[12px] font-medium text-[#416b9d] hover:underline">← Producten</Link>
          <h1 className="mt-1 text-[22px] font-semibold text-[#20344b]">Product toevoegen</h1>
        </div>
        <nav aria-label="Andere manieren om producten toe te voegen" className="flex flex-wrap gap-3 text-[12px] font-medium text-[#416b9d]">
          <Link href="/import/bulk" className="hover:underline">Excel of CSV</Link>
          <Link href="/feeds" className="hover:underline">Productfeed koppelen</Link>
        </nav>
      </header>

      <ProductUrlQuickStart formId="new-product-form" markets={countries.map((country) => ({ id: country.id, code: country.code, name: country.name, currency: country.currency, vatRate: Number(country.vatRate) }))} />

      <form id="new-product-form" action={createSmartProductAction} className="space-y-3">
        <section className="ps-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7edf3] px-5 py-3 sm:px-6">
            <h2 className="text-[14px] font-semibold text-[#21364d]">Productgegevens</h2>
            <span className="text-[11px] text-[#738298]">* Verplicht</span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <label className="text-[11px] font-semibold text-[#4f5869]">Artikelnummer *<input name="articleNumber" required className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld PB-121076" /></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Productnaam *<input name="name" required className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld Palletbox 1200 x 1000" /></label>
            <EanDiscoveryField markets={countries.map((country) => ({ id: country.id, code: country.code, vatRate: Number(country.vatRate), currency: country.currency }))} />
            <ProductGroupField formId="new-product-form" groups={productGroups.map((group) => ({ name: group.name, description: group.description }))} />
            <details className="rounded-lg border border-[#e2e9f2] bg-[#fafcff] sm:col-span-2">
              <summary className="cursor-pointer px-4 py-3 text-[12px] font-medium text-[#416b9d]">Overige productgegevens (optioneel)</summary>
              <div className="grid gap-3 border-t border-[#e2e9f2] p-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-[11px] font-semibold text-[#4f5869]">GTIN<input name="gtin" inputMode="numeric" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">MPN<input name="mpn" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Merk<input name="brand" className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Model<input name="model" className="toolbar-control mt-1.5 w-full" /></label>
              </div>
            </details>
          </div>
        </section>

        <section className="ps-panel overflow-hidden" id="prijs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7edf3] px-5 py-3 sm:px-6">
            <div>
              <h2 className="text-[14px] font-semibold text-[#21364d]">Prijs en markt</h2>
              <p className="mt-0.5 text-[10px] text-[#7b8999]">Voer de consumentenprijs in. Prysight gebruikt de gekozen markt voor de btw berekening.</p>
            </div>
            <span className="text-[11px] text-[#738298]">Je eigen verkoopprijs</span>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#4f5869]">Markt<select name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full"><option value="">Algemeen</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Valuta<select name="currency" defaultValue={defaultCountry?.currency ?? 'EUR'} className="toolbar-control mt-1.5 w-full"><option>EUR</option><option>GBP</option><option>DKK</option><option>USD</option></select></label>
            </div>

            <input type="hidden" name="vatIncluded" value="true" />
            <input type="hidden" name="ownShippingVatIncluded" value="true" />

            <div className="grid gap-4 lg:grid-cols-[1.08fr_.92fr]">
              <div className="rounded-[12px] border border-[#dce5ef] bg-[#fbfcfe] p-4">
                <div className="mb-3">
                  <p className="text-[12px] font-semibold text-[#30465d]">Verkoopprijs</p>
                  <p className="mt-1 text-[10px] leading-4 text-[#7b8999]">De prijs inclusief btw is leidend. De exclusieve prijs kun je eronder controleren of handmatig invullen.</p>
                </div>

                <div className="space-y-3">
                  <label className="block text-[11px] font-semibold text-[#4f5869]">
                    Prijs inclusief btw *
                    <input name="ownPrice" required inputMode="decimal" className="toolbar-control mt-1.5 w-full text-[14px] font-semibold" placeholder="0,00" />
                  </label>
                  <label className="block text-[11px] font-semibold text-[#4f5869]">
                    Prijs exclusief btw <span className="font-normal text-[#8b98a8]">(optioneel)</span>
                    <input name="ownPriceOther" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Wordt automatisch berekend als je dit leeg laat" />
                    <span className="mt-1.5 block text-[10px] font-normal leading-4 text-[#7b8999]">Vul dit alleen in wanneer je beide bedragen wilt controleren. Prysight valideert het bedrag met het btw tarief van de gekozen markt.</span>
                  </label>
                </div>
              </div>

              <div className="rounded-[12px] border border-[#dce5ef] bg-white p-4">
                <div className="mb-3">
                  <p className="text-[12px] font-semibold text-[#30465d]">Verzendkosten</p>
                  <p className="mt-1 text-[10px] leading-4 text-[#7b8999]">Verzendkosten worden als bedrag inclusief btw vastgelegd en meegenomen in de totale prijsvergelijking.</p>
                </div>

                <label className="block text-[11px] font-semibold text-[#4f5869]">
                  Verzendkosten inclusief btw <span className="font-normal text-[#8b98a8]">(optioneel)</span>
                  <input name="ownShippingCost" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld 6,95" />
                </label>

                <div className="mt-3 rounded-[9px] bg-[#f4f7fb] px-3 py-2.5 text-[10px] leading-4 text-[#65758a]">
                  Laat leeg als de verzendkosten onbekend zijn. Vul 0 in wanneer verzending gratis is. Prysight berekent de exclusieve verzendkosten automatisch op basis van de markt.
                </div>
              </div>
            </div>
          </div>
        </section>

        <details className="ps-panel overflow-hidden">
          <summary className="cursor-pointer px-5 py-4 text-[12px] font-semibold text-[#40556e] sm:px-6">
            Extra productgegevens, voorraad en verpakking
          </summary>
          <div className="grid gap-4 border-t border-[#e7edf3] p-5 sm:grid-cols-2 sm:p-6">
            <label className="text-[11px] font-semibold text-[#4f5869] sm:col-span-2">Jouw product URL<input name="ownUrl" type="url" className="toolbar-control mt-1.5 w-full" placeholder="https://jouwwebshop.nl/product/..." /></label>
            <label className="text-[11px] font-semibold text-[#4f5869]">Voorraadstatus<input name="stockStatus" className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
            <div className="grid grid-cols-[1fr_.7fr] gap-3">
              <label className="text-[11px] font-semibold text-[#4f5869]">Eenheid<input name="packagingUnit" defaultValue="stuks" className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[11px] font-semibold text-[#4f5869]">Aantal<input name="packagingQty" type="number" min="1" defaultValue="1" className="toolbar-control mt-1.5 w-full" /></label>
            </div>
          </div>
        </details>

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

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e7edf3] pt-3">
          <Link href="/producten" className="secondary-action">Annuleren</Link>
          <ProductCreateSubmitButton />
        </div>
      </form>
    </div>
  )
}
