export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { deleteSelectedProductsAction } from '@/app/actions/productBulkActions'
import { refreshSelectedProductPricesAction } from '@/app/actions/productPriceBulkActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { ProductSelectionControls } from '@/components/ProductSelectionControls'
import { requirePermission } from '@/lib/authz'
import { deriveProductMetrics, getFilterOptions } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isOutOfStock(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('out of stock') || normalized.includes('niet op voorraad') || normalized.includes('uitverkocht') || normalized.includes('unavailable') || normalized.includes('sold out')
}

function stockLabel(value: string | null | undefined) {
  if (!value) return 'Voorraad onbekend'
  return isOutOfStock(value) ? 'Uit voorraad' : 'Op voorraad'
}

export default async function ProductenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission('products.read')
  const params = await searchParams
  const deletedCount = Math.max(Number(readParam(params.verwijderd) ?? '0') || 0, 0)
  const selectionState = readParam(params.selectie)
  const crawlResult = readParam(params.crawl)
  const crawlSources = Math.max(Number(readParam(params.bronnen) ?? '0') || 0, 0)
  const crawlProducts = Math.max(Number(readParam(params.producten) ?? '0') || 0, 0)
  const crawlLimited = readParam(params.limiet) === '1'
  const filters = {
    q: readParam(params.q),
    productGroupId: readParam(params.productgroep),
    countryId: readParam(params.land),
    competitorId: readParam(params.concurrent),
    identifierStatus: readParam(params.identificatie),
  }
  const page = Math.max(Number(readParam(params.pagina) ?? '1') || 1, 1)
  const pageSize = 12

  const where = {
    companyId: actor.companyId,
    isActive: true,
    productGroupId: filters.productGroupId || undefined,
    AND: [
      filters.q ? { OR: [
        { articleNumber: { contains: filters.q, mode: 'insensitive' as const } },
        { name: { contains: filters.q, mode: 'insensitive' as const } },
        { ean: { contains: filters.q } },
        { gtin: { contains: filters.q } },
      ] } : {},
      filters.countryId ? { OR: [
        { productMarkets: { some: { companyId: actor.companyId, countryId: filters.countryId, isActive: true } } },
        { matches: { some: { companyId: actor.companyId, competitorOffer: { competitor: { companyId: actor.companyId, countryId: filters.countryId } } } } },
      ] } : {},
      filters.identifierStatus === 'ontbreekt'
        ? { AND: [{ ean: null }, { gtin: null }] }
        : filters.identifierStatus === 'aanwezig'
          ? { OR: [{ ean: { not: null } }, { gtin: { not: null } }] }
          : {},
    ],
  }

  const result = await safeDatabaseQuery(async () => {
    const [products, totalCount, filterOptions] = await Promise.all([
      prisma.product.findMany({
        relationLoadStrategy: 'join',
        where,
        include: {
          productGroup: true,
          productMarkets: { where: { companyId: actor.companyId }, include: { country: true } },
          feedLinks: {
            where: { companyId: actor.companyId },
            orderBy: { lastSeenAt: 'desc' },
            take: 3,
            select: { feedSource: { select: { name: true } } },
          },
          matches: {
            where: {
              companyId: actor.companyId,
              competitorOffer: {
                isActive: true,
                competitorId: filters.competitorId || undefined,
                competitor: filters.countryId ? { companyId: actor.companyId, countryId: filters.countryId } : undefined,
              },
            },
            include: { competitorOffer: { include: {
              competitor: { include: { country: true } },
              priceHistory: { where: { companyId: actor.companyId }, orderBy: { recordedAt: 'desc' }, take: 2 },
              priceChecks: { where: { companyId: actor.companyId }, orderBy: { checkedAt: 'desc' }, take: 2 },
            } } },
          },
        },
        orderBy: [{ productGroup: { name: 'asc' } }, { articleNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
      getFilterOptions(actor.companyId),
    ])
    return { products, totalCount, filterOptions }
  }, { products: [], totalCount: 0, filterOptions: { countries: [], productGroups: [], competitors: [] } })

  const { products, totalCount, filterOptions } = result.data
  const rows = products.map((product) => deriveProductMetrics(product, filters))
  const sourceByProduct = new Map(products.map((product) => [product.id, [...new Set(product.feedLinks.map((link) => link.feedSource.name))]]))
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1)
  const selectedCountry = filterOptions.countries.find((country) => country.id === filters.countryId)

  const comparableCount = rows.filter((item) => item.lowestPrice !== null && item.ownPrice !== null).length
  const coverage = rows.length ? Math.round((comparableCount / rows.length) * 100) : 0
  const attentionCount = rows.filter((item) => item.reviewMatches > 0 || item.stale || item.lowestPrice === null).length
  const aboveMarket = rows.filter((item) => item.marketPosition === 'Engels duurder').length
  const monitoredOffers = rows.reduce((sum, item) => sum + item.offerCount, 0)
  const staleCount = rows.filter((item) => item.stale).length

  const paginationParams = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)).map(([key, value]) => [key === 'productGroupId' ? 'productgroep' : key === 'countryId' ? 'land' : key === 'competitorId' ? 'concurrent' : key === 'identifierStatus' ? 'identificatie' : key, value as string]))

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}
      {deletedCount > 0 ? <div className="rounded-[13px] bg-[#eaf8f0] px-4 py-3 text-[11px] font-bold text-[#20814d] shadow-[0_6px_16px_rgba(31,48,70,.06)]">{formatNumber(deletedCount)} product{deletedCount === 1 ? '' : 'en'} verwijderd.</div> : null}
      {selectionState === 'leeg' ? <div className="rounded-[13px] bg-[#fff4df] px-4 py-3 text-[11px] font-bold text-[#a36816] shadow-[0_6px_16px_rgba(31,48,70,.06)]">Selecteer eerst één of meerdere producten.</div> : null}
      {selectionState === 'ongeldig' ? <div className="rounded-[13px] bg-[#fff0f1] px-4 py-3 text-[11px] font-bold text-[#a93442] shadow-[0_6px_16px_rgba(31,48,70,.06)]">De geselecteerde producten konden niet worden verwerkt.</div> : null}
      {crawlResult ? <div className="rounded-[13px] bg-[#e8f2ff] px-4 py-3 text-[11px] font-bold text-[#245f9d] shadow-[0_6px_16px_rgba(31,48,70,.06)]">Handmatige prijscontrole afgerond voor {formatNumber(crawlProducts)} product{crawlProducts === 1 ? '' : 'en'} en {formatNumber(crawlSources)} bron{crawlSources === 1 ? '' : 'nen'}. Succesvol en mislukt, {crawlResult}.{crawlLimited ? ' De veiligheidslimiet is bereikt, selecteer de resterende producten opnieuw voor een volgende gecontroleerde batch.' : ''}</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
          <div>
            <p className="eyebrow">Prijsmonitor</p>
            <h1 className="mt-2">Producten</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#66778a]">Werk vanuit één rustig overzicht. Selecteer producten om prijzen direct opnieuw op te halen en open een product voor de volledige prijsanalyse, historie, bronnen en crawlresultaten.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className="ps-button-green">Bulk importeren</Link>
            <Link href="/producten/nieuw" className="primary-action">+ Product toevoegen</Link>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Producten</p><p className="mt-1 text-[27px] font-black">{formatNumber(totalCount)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Prijsdekking</p><p className="mt-1 text-[27px] font-black text-[#1e2d3f]">{coverage}%</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Gemeten bronnen</p><p className="mt-1 text-[27px] font-black text-[#1e2d3f]">{formatNumber(monitoredOffers)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Boven markt</p><p className={`mt-1 text-[27px] font-black ${aboveMarket ? 'text-[#b6414d]' : 'text-[#20814d]'}`}>{formatNumber(aboveMarket)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Aandacht</p><p className={`mt-1 text-[27px] font-black ${attentionCount ? 'text-[#a36816]' : 'text-[#20814d]'}`}>{formatNumber(attentionCount)}</p></div>
        </div>
      </section>

      <form className="ps-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[15px] font-black text-[#1e2d3f]">Zoeken en filteren</h2><p className="mt-1 text-[10px] font-semibold text-[#748296]">Filter eerst de markt of productgroep, selecteer daarna alleen wat je wilt controleren.</p></div>
          {(filters.q || filters.productGroupId || filters.countryId || filters.competitorId || filters.identifierStatus) ? <Link href="/producten" className="secondary-action min-h-0 px-3 py-2 text-[10px]">Filters wissen</Link> : null}
        </div>
        <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Zoek artikel, EAN, GTIN of productnaam" className="toolbar-control w-full" />
          <select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control w-full"><option value="">Alle productgroepen</option>{filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <select name="land" defaultValue={filters.countryId} className="toolbar-control w-full"><option value="">Alle landen</option>{filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
          <select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control w-full"><option value="">Alle concurrenten</option>{filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select>
          <select name="identificatie" defaultValue={filters.identifierStatus} className="toolbar-control w-full"><option value="">Alle EAN statussen</option><option value="aanwezig">EAN of GTIN aanwezig</option><option value="ontbreekt">EAN en GTIN ontbreken</option></select>
          <button className="primary-action min-w-[112px]">Filter</button>
        </div>
        <p className="mt-3 text-[10px] font-semibold text-[#748296]">{selectedCountry ? `Actieve markt, ${selectedCountry.name}.` : 'Alle actieve markten gecombineerd.'}</p>
      </form>

      <form id="product-bulk-form" action={deleteSelectedProductsAction} className="space-y-4">
        <div className="ps-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[15px] font-black text-[#1e2d3f]">Productselectie</h2>
            <p className="mt-1 text-[10px] font-semibold text-[#748296]">Handmatig ophalen voert direct een nieuwe crawl uit voor alle gekoppelde concurrentbronnen van de geselecteerde producten.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProductSelectionControls formId="product-bulk-form" />
            <button type="submit" formAction={refreshSelectedProductPricesAction} className="primary-action min-h-[39px] px-4 py-2 text-[10px]">Prijzen ophalen</button>
            <button type="submit" className="ps-button-danger min-h-[39px] px-4 py-2 text-[10px]">Verwijder geselecteerd</button>
          </div>
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? <div className="ps-panel px-6 py-16 text-center"><p className="text-[14px] font-black text-[#34495f]">Geen producten gevonden</p><p className="mt-2 text-[11px] font-semibold text-[#7b8999]">Pas je filters aan, voeg een product toe of importeer een bestand.</p><div className="mt-5 flex justify-center gap-2"><Link href="/import" className="ps-button-green">Importeren</Link><Link href="/producten/nieuw" className="primary-action">Product toevoegen</Link></div></div> : null}

          {rows.map((item) => {
            const pctDiff = item.difference.pctDiff !== null && item.difference.pctDiff !== undefined ? Number(item.difference.pctDiff) : null
            const cheapestCompetitor = item.lowestOffer?.competitorOffer.competitor.name ?? null
            const sourceNames = sourceByProduct.get(item.product.id) ?? []

            return (
              <article key={item.product.id} className="ps-panel overflow-hidden">
                <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <input type="checkbox" name="productIds" value={item.product.id} aria-label={`Selecteer ${item.product.name}`} className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer rounded" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/producten/${item.product.id}`} className="text-[16px] font-black text-[#24384f] hover:text-[#2f7edb]">{item.product.name}</Link>
                        {item.stale ? <span className="ps-chip ps-chip-amber">Prijsdata vernieuwen</span> : <span className="ps-chip ps-chip-green">Actueel</span>}
                        {item.reviewMatches > 0 ? <span className="ps-chip ps-chip-amber">{item.reviewMatches} match{item.reviewMatches === 1 ? '' : 'es'} controleren</span> : null}
                      </div>
                      <div className="ps-product-meta mt-2">
                        <span className="ps-chip">Artikel {item.product.articleNumber}</span>
                        {item.product.ean || item.product.gtin ? <span className="ps-chip ps-chip-blue">EAN {item.product.ean ?? item.product.gtin}</span> : <Link href={`/producten/${item.product.id}`} className="ps-chip ps-chip-amber">EAN ontbreekt</Link>}
                        <span className="ps-chip">{item.product.productGroup.name}</span>
                        <span className="ps-chip">{sourceNames.join(', ') || 'Handmatig'}</span>
                        <span className={`ps-chip ${item.product.stockStatus ? (isOutOfStock(item.product.stockStatus) ? 'ps-chip-red' : 'ps-chip-green') : ''}`}>{stockLabel(item.product.stockStatus)}</span>
                      </div>
                    </div>
                  </div>
                  <Link href={`/producten/${item.product.id}`} className="primary-action min-h-[38px] shrink-0 px-4 py-2 text-[10px]">Open prijsanalyse</Link>
                </div>

                <div className="grid border-t border-[#e7edf3] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Eigen prijs</p><p className="mt-1 text-[15px] font-black text-[#24384f]">{formatCurrency(item.ownPrice, item.ownCurrency)}</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Laagste markt</p><p className="mt-1 text-[15px] font-black text-[#24384f]">{formatCurrency(item.lowestPrice)}</p><p className="mt-1 truncate text-[9px] font-semibold text-[#8190a1]">{cheapestCompetitor ?? 'Nog geen bron'}</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Gemiddelde markt</p><p className="mt-1 text-[15px] font-black text-[#24384f]">{formatCurrency(item.averagePrice)}</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Verschil</p><p className={`mt-1 text-[15px] font-black ${pctDiff !== null && pctDiff > 0 ? 'text-[#b6414d]' : pctDiff !== null && pctDiff < 0 ? 'text-[#20814d]' : 'text-[#24384f]'}`}>{pctDiff !== null ? `${pctDiff > 0 ? '+' : ''}${formatNumber(pctDiff, 1)}%` : '—'}</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Positie</p><p className="mt-1 text-[13px] font-black text-[#24384f]">{item.marketPosition}</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Bronnen</p><p className="mt-1 text-[15px] font-black text-[#24384f]">{formatNumber(item.sourceCount)}</p><p className="mt-1 text-[9px] font-semibold text-[#8190a1]">{item.offerCount} met geldige prijs</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.06em] text-[#7a8898]">Laatste crawl</p><p className="mt-1 text-[12px] font-black text-[#24384f]">{item.lastCheckedAt ? formatDate(item.lastCheckedAt) : 'Nog niet gemeten'}</p></div>
                </div>
              </article>
            )
          })}
        </div>
      </form>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="ps-panel p-4"><p className="text-[10px] font-black uppercase tracking-[.06em] text-[#7a8898]">Verouderde prijsdata</p><p className="mt-2 text-[22px] font-black text-[#a36816]">{formatNumber(staleCount)}</p><p className="mt-1 text-[10px] font-semibold text-[#748296]">Selecteer deze producten en gebruik Prijzen ophalen.</p></div>
        <div className="ps-panel p-4"><p className="text-[10px] font-black uppercase tracking-[.06em] text-[#7a8898]">Boven markt</p><p className="mt-2 text-[22px] font-black text-[#b6414d]">{formatNumber(aboveMarket)}</p><p className="mt-1 text-[10px] font-semibold text-[#748296]">Open een product om te zien welke concurrent de laagste prijs voert.</p></div>
        <div className="ps-panel p-4"><p className="text-[10px] font-black uppercase tracking-[.06em] text-[#7a8898]">Te controleren matches</p><p className="mt-2 text-[22px] font-black text-[#5b2be8]">{formatNumber(rows.reduce((sum, item) => sum + item.reviewMatches, 0))}</p><Link href="/productmatches" className="mt-2 inline-flex text-[10px] font-black text-[#2f7edb]">Matches controleren →</Link></div>
      </section>

      <div className="flex items-center justify-between rounded-[15px] bg-white px-4 py-3 text-[11px] font-bold text-[#607187] shadow-[0_8px_20px_rgba(31,48,70,.07)]">
        <p>Pagina {page} van {totalPages}</p>
        <div className="flex gap-2"><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.max(page - 1, 1)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Vorige</Link><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.min(page + 1, totalPages)) }).toString()}`} className="primary-action min-h-0 px-3 py-2">Volgende</Link></div>
      </div>
    </div>
  )
}
