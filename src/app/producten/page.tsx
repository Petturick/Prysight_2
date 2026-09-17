export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { deleteSelectedProductsAction } from '@/app/actions/productBulkActions'
import { refreshSelectedProductPricesAction, refreshSingleProductPriceAction } from '@/app/actions/productPriceBulkActions'
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
  const crawlStatus = readParam(params.crawlstatus)
  const crawlResult = readParam(params.crawl)
  const crawlSources = Math.max(Number(readParam(params.bronnen) ?? '0') || 0, 0)
  const crawlProducts = Math.max(Number(readParam(params.producten) ?? '0') || 0, 0)
  const crawlProduct = readParam(params.crawlproduct)
  const openProduct = readParam(params.openproduct)
  const crawlLimited = readParam(params.limiet) === '1'
  const canCrawl = actor.permissions.includes('pricing.manage')
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
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1)
  const selectedCountry = filterOptions.countries.find((country) => country.id === filters.countryId)
  const comparableCount = rows.filter((item) => item.lowestPrice !== null && item.ownPrice !== null).length
  const coverage = rows.length ? Math.round((comparableCount / rows.length) * 100) : 0
  const attentionCount = rows.filter((item) => item.reviewMatches > 0 || item.stale || item.lowestPrice === null).length
  const monitoredOffers = rows.reduce((sum, item) => sum + item.sourceCount, 0)

  const paginationParams = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)).map(([key, value]) => [key === 'productGroupId' ? 'productgroep' : key === 'countryId' ? 'land' : key === 'competitorId' ? 'concurrent' : key === 'identifierStatus' ? 'identificatie' : key, value as string]))

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}

      {deletedCount > 0 ? <div className="rounded-[12px] bg-[#eaf8f0] px-4 py-3 text-[12px] font-semibold text-[#20814d]">{formatNumber(deletedCount)} product{deletedCount === 1 ? '' : 'en'} verwijderd.</div> : null}
      {selectionState === 'leeg' ? <div className="rounded-[12px] bg-[#fff4df] px-4 py-3 text-[12px] font-semibold text-[#8b611d]">Selecteer eerst één of meerdere producten.</div> : null}
      {selectionState === 'ongeldig' ? <div className="rounded-[12px] bg-[#fff0f1] px-4 py-3 text-[12px] font-semibold text-[#a93442]">De geselecteerde producten konden niet worden verwerkt.</div> : null}
      {crawlStatus === 'geen-bron' ? (
        <div className="flex flex-col gap-3 rounded-[12px] border border-[#edd9aa] bg-[#fff8e9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] font-semibold text-[#7b5a1b]">{crawlProduct ? `Artikel ${crawlProduct} heeft` : 'Dit product heeft'} nog geen gekoppelde concurrentbron. Koppel één product URL, daarna werkt Nu crawlen met één klik.</p>
          {openProduct ? <Link href={`/producten/${openProduct}#concurrent-bron-toevoegen`} className="secondary-action min-h-0 shrink-0 px-3 py-2 text-[11px]">Concurrent koppelen</Link> : null}
        </div>
      ) : null}
      {crawlStatus === 'geen-bronnen-selectie' ? <div className="rounded-[12px] border border-[#edd9aa] bg-[#fff8e9] px-4 py-3 text-[12px] font-semibold text-[#7b5a1b]">De geselecteerde producten hebben nog geen gekoppelde concurrentbronnen. Koppel eerst product URL's en haal daarna de prijzen op.</div> : null}
      {crawlStatus === 'mislukt' ? <div className="rounded-[12px] border border-[#efc8cd] bg-[#fff2f3] px-4 py-3 text-[12px] font-semibold text-[#9c3442]">De prijscontrole kon niet worden afgerond{crawlProduct ? ` voor artikel ${crawlProduct}` : ''}. Er is niets aangepast. Probeer opnieuw, blijft dit terugkomen, controleer dan de gekoppelde bron URL op het product.</div> : null}
      {crawlStatus === 'klaar' && crawlResult ? <div className="rounded-[12px] bg-[#eaf8f0] px-4 py-3 text-[12px] font-semibold text-[#1e7448]">Prijscontrole klaar{crawlProduct ? ` voor artikel ${crawlProduct}` : ''}, {formatNumber(crawlSources)} bron{crawlSources === 1 ? '' : 'nen'} gecontroleerd, resultaat {crawlResult}.{crawlLimited ? ' De batchlimiet is bereikt, voer de resterende selectie nogmaals uit.' : ''}</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h1>Producten</h1>
            <p className="mt-1 text-[12px] text-[#6f7d90]">Monitor, vergelijk en ververs prijzen per product.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className="secondary-action">Bulk importeren</Link>
            <Link href="/producten/nieuw" className="primary-action">Product toevoegen</Link>
          </div>
        </div>
        <div className="grid border-t border-[#e7edf3] sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-3.5 sm:px-6"><p className="text-[11px] font-medium text-[#7a8798]">Producten</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{formatNumber(totalCount)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] font-medium text-[#7a8798]">Prijsdekking</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{coverage}%</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] font-medium text-[#7a8798]">Bronnen op deze pagina</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{formatNumber(monitoredOffers)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] font-medium text-[#7a8798]">Aandacht nodig</p><p className={`mt-1 text-[22px] font-semibold ${attentionCount ? 'text-[#a36816]' : 'text-[#20814d]'}`}>{formatNumber(attentionCount)}</p></div>
        </div>
      </section>

      <form className="ps-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-[#23364d]">Filter</h2>
          {(filters.q || filters.productGroupId || filters.countryId || filters.competitorId || filters.identifierStatus) ? <Link href="/producten" className="text-[11px] font-semibold text-[#2f6edb]">Wissen</Link> : null}
        </div>
        <div className="grid gap-2.5 xl:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Zoek artikel, EAN of productnaam" className="toolbar-control w-full" />
          <select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control w-full"><option value="">Alle productgroepen</option>{filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <select name="land" defaultValue={filters.countryId} className="toolbar-control w-full"><option value="">Alle landen</option>{filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
          <select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control w-full"><option value="">Alle concurrenten</option>{filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select>
          <select name="identificatie" defaultValue={filters.identifierStatus} className="toolbar-control w-full"><option value="">Alle EAN statussen</option><option value="aanwezig">EAN aanwezig</option><option value="ontbreekt">EAN ontbreekt</option></select>
          <button className="primary-action min-w-[96px]">Filter</button>
        </div>
        {selectedCountry ? <p className="mt-2 text-[10px] text-[#8793a3]">Markt, {selectedCountry.name}</p> : null}
      </form>

      <form id="product-bulk-form" action={deleteSelectedProductsAction} className="space-y-3">
        <div className="ps-panel flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold text-[#33465c]">Bulk</span>
            <ProductSelectionControls formId="product-bulk-form" />
          </div>
          <div className="flex flex-wrap gap-2">
            {canCrawl ? <button type="submit" formAction={refreshSelectedProductPricesAction} className="primary-action min-h-[36px] px-3.5 py-2 text-[11px]">Prijzen ophalen</button> : null}
            <button type="submit" className="ps-button-danger min-h-[36px] px-3.5 py-2 text-[11px]">Verwijderen</button>
          </div>
        </div>

        <div className="space-y-2.5">
          {rows.length === 0 ? <div className="ps-panel px-6 py-14 text-center"><p className="text-[14px] font-semibold text-[#34495f]">Geen producten gevonden</p><p className="mt-1 text-[11px] text-[#7b8999]">Pas je filters aan of voeg een product toe.</p></div> : null}

          {rows.map((item) => {
            const pctDiff = item.difference.pctDiff !== null && item.difference.pctDiff !== undefined ? Number(item.difference.pctDiff) : null
            const cheapestCompetitor = item.lowestOffer?.competitorOffer.competitor.name ?? null
            const identifier = item.product.ean ?? item.product.gtin

            return (
              <article key={item.product.id} className="ps-panel overflow-hidden">
                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <input type="checkbox" name="productIds" value={item.product.id} aria-label={`Selecteer ${item.product.name}`} className="mt-1 h-[17px] w-[17px] shrink-0 cursor-pointer rounded" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/producten/${item.product.id}`} className="text-[15px] font-semibold text-[#20344b] hover:text-[#2f6edb]">{item.product.name}</Link>
                        {item.stale ? <span className="ps-chip ps-chip-amber">Vernieuwen</span> : item.sourceCount > 0 ? <span className="ps-chip ps-chip-green">Actueel</span> : null}
                        {item.reviewMatches > 0 ? <span className="ps-chip ps-chip-amber">{item.reviewMatches} match{item.reviewMatches === 1 ? '' : 'es'}</span> : null}
                      </div>
                      <p className="mt-1.5 truncate text-[11px] text-[#788698]">Artikel {item.product.articleNumber}{identifier ? ` · EAN ${identifier}` : ' · EAN ontbreekt'} · {item.product.productGroup.name}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 lg:pl-0">
                    <span className={`text-[10px] font-medium ${isOutOfStock(item.product.stockStatus) ? 'text-[#b6414d]' : 'text-[#20814d]'}`}>{stockLabel(item.product.stockStatus)}</span>
                    {canCrawl ? <button type="submit" name="singleProductId" value={item.product.id} formAction={refreshSingleProductPriceAction} className="secondary-action min-h-[36px] px-3.5 py-2 text-[11px]">Nu crawlen</button> : null}
                    <Link href={`/producten/${item.product.id}`} className="primary-action min-h-[36px] px-3.5 py-2 text-[11px]">Analyse</Link>
                  </div>
                </div>

                <div className="grid border-t border-[#edf1f5] sm:grid-cols-2 lg:grid-cols-5">
                  <div className="px-4 py-3"><p className="text-[10px] font-medium text-[#8591a0]">Eigen prijs</p><p className="mt-1 text-[16px] font-semibold text-[#24384f]">{formatCurrency(item.ownPrice, item.ownCurrency)}</p></div>
                  <div className="px-4 py-3"><p className="text-[10px] font-medium text-[#8591a0]">Laagste markt</p><p className="mt-1 text-[16px] font-semibold text-[#24384f]">{formatCurrency(item.lowestPrice)}</p>{cheapestCompetitor ? <p className="mt-0.5 truncate text-[10px] text-[#8793a3]">{cheapestCompetitor}</p> : null}</div>
                  <div className="px-4 py-3"><p className="text-[10px] font-medium text-[#8591a0]">Verschil</p><p className={`mt-1 text-[16px] font-semibold ${pctDiff !== null && pctDiff > 0 ? 'text-[#b6414d]' : pctDiff !== null && pctDiff < 0 ? 'text-[#20814d]' : 'text-[#24384f]'}`}>{pctDiff !== null ? `${pctDiff > 0 ? '+' : ''}${formatNumber(pctDiff, 1)}%` : '—'}</p></div>
                  <div className="px-4 py-3"><p className="text-[10px] font-medium text-[#8591a0]">Bronnen</p><p className="mt-1 text-[16px] font-semibold text-[#24384f]">{formatNumber(item.sourceCount)}</p></div>
                  <div className="px-4 py-3"><p className="text-[10px] font-medium text-[#8591a0]">Laatste meting</p><p className="mt-1 text-[12px] font-semibold text-[#24384f]">{item.lastCheckedAt ? formatDate(item.lastCheckedAt) : 'Nog niet gemeten'}</p></div>
                </div>
              </article>
            )
          })}
        </div>
      </form>

      <div className="flex items-center justify-between rounded-[14px] bg-white px-4 py-3 text-[11px] font-medium text-[#607187] shadow-[0_8px_20px_rgba(31,48,70,.06)]">
        <p>Pagina {page} van {totalPages}</p>
        <div className="flex gap-2"><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.max(page - 1, 1)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Vorige</Link><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.min(page + 1, totalPages)) }).toString()}`} className="primary-action min-h-0 px-3 py-2">Volgende</Link></div>
      </div>
    </div>
  )
}
