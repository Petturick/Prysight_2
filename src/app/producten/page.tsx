export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { deleteSelectedProductsAction } from '@/app/actions/productBulkActions'
import { refreshSelectedProductPricesAction, refreshSingleProductPriceAction } from '@/app/actions/productPriceBulkActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { ProductOverviewGrid, type ProductGridRow } from '@/components/ProductOverviewGrid'
import { requirePermission } from '@/lib/authz'
import { deriveProductMetrics, getFilterOptions } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
function price(value: number | null | undefined, currency = 'EUR') {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : formatCurrency(value, currency)
}
function percent(value: number | null) {
  return value === null ? '—' : (value > 0 ? '+' : '') + formatNumber(value, 1) + '%'
}

export default async function ProductenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission('products.read')
  const params = await searchParams
  const canCrawl = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('pricing.manage')
  const canDelete = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('products.write')
  const filters = {
    q: readParam(params.q)?.trim() || undefined,
    productGroupId: readParam(params.productgroep) || undefined,
    countryId: readParam(params.land) || undefined,
    competitorId: readParam(params.concurrent) || undefined,
    identifierStatus: readParam(params.identificatie) || undefined,
  }
  const requestedPageSize = Number(readParam(params.aantal) || '25')
  const pageSize = requestedPageSize === 50 ? 50 : 25
  const requestedPage = Number(readParam(params.pagina) || '1')
  const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(requestedPage, 100000)) : 1
  const where = {
    companyId: actor.companyId,
    isActive: true,
    productGroupId: filters.productGroupId,
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
      filters.competitorId ? { matches: { some: { companyId: actor.companyId, competitorOffer: { competitorId: filters.competitorId, isActive: true } } } } : {},
    ],
  }

  const result = await safeDatabaseQuery(async () => {
    const [products, totalCount, filterOptions] = await Promise.all([
      prisma.product.findMany({
        relationLoadStrategy: 'join',
        where,
        include: {
          productGroup: true,
          productMarkets: { where: { companyId: actor.companyId, isActive: true }, include: { country: true } },
          matches: {
            where: {
              companyId: actor.companyId,
              competitorOffer: {
                isActive: true,
                competitorId: filters.competitorId,
                competitor: filters.countryId ? { companyId: actor.companyId, countryId: filters.countryId } : undefined,
              },
            },
            include: {
              competitorOffer: {
                include: {
                  competitor: { include: { country: true } },
                  priceHistory: { where: { companyId: actor.companyId }, orderBy: { recordedAt: 'desc' }, take: 2 },
                  priceChecks: { where: { companyId: actor.companyId }, orderBy: { checkedAt: 'desc' }, take: 2 },
                },
              },
            },
          },
        },
        orderBy: [{ articleNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
      getFilterOptions(actor.companyId),
    ])
    return { products, totalCount, filterOptions }
  }, { products: [], totalCount: 0, filterOptions: { countries: [], productGroups: [], competitors: [] } })

  const { products, totalCount, filterOptions } = result.data
  const selectedCountry = filterOptions.countries.find((country) => country.id === filters.countryId)
  const rows: ProductGridRow[] = products.map((product) => {
    const metrics = deriveProductMetrics(product, filters)
    const ownVatRate = selectedCountry
      ? Number(selectedCountry.vatRate)
      : metrics.selectedMarket
        ? Number(metrics.selectedMarket.country.vatRate)
        : product.productMarkets.length === 1
          ? Number(product.productMarkets[0].country.vatRate)
          : null
    const validOwnRate = ownVatRate !== null && Number.isFinite(ownVatRate)
    const ownPrice = metrics.ownPrice
    const ownEx = ownPrice === null || !validOwnRate
      ? null : metrics.vatIncluded ? ownPrice / (1 + ownVatRate / 100) : ownPrice
    const ownInc = ownPrice === null || !validOwnRate
      ? null : metrics.vatIncluded ? ownPrice : ownPrice * (1 + ownVatRate / 100)
    const lowestOffer = metrics.lowestOffer?.competitorOffer
    const lowestRate = lowestOffer ? Number(lowestOffer.competitor.country.vatRate) : null
    const marketEx = metrics.lowestPrice !== null && lowestRate !== null && Number.isFinite(lowestRate)
      ? metrics.lowestPrice / (1 + lowestRate / 100) : null
    const shipping = lowestOffer?.normalizedShippingCost === null || lowestOffer?.normalizedShippingCost === undefined
      ? null : Number(lowestOffer.normalizedShippingCost)
    const delivered = lowestOffer?.deliveredPrice === null || lowestOffer?.deliveredPrice === undefined
      ? null : Number(lowestOffer.deliveredPrice)
    const delta = metrics.difference.pctDiff === null || metrics.difference.pctDiff === undefined
      ? null : Number(metrics.difference.pctDiff)
    const checked = metrics.lastCheckedAt ? formatDate(metrics.lastCheckedAt) : 'Nog niet'
    const lastCheckFailed = metrics.lowestOffer?.competitorOffer.priceChecks[0]?.isSuccess === false
    const stock = metrics.selectedMarket?.stockStatus ?? product.stockStatus
    const status = lastCheckFailed ? 'Controle mislukt'
      : metrics.reviewMatches > 0 ? 'Beoordelen'
        : metrics.stale ? 'Vernieuwen'
          : metrics.sourceCount > 0 ? 'Actueel'
            : stock && /niet op voorraad|uitverkocht|out of stock|sold out/i.test(stock) ? 'Niet op voorraad' : 'Geen bronnen'
    return {
      id: product.id,
      articleNumber: product.articleNumber,
      name: product.name,
      ean: product.ean || product.gtin || '',
      group: product.productGroup.name,
      markets: product.productMarkets.map((market) => market.country.code).join(', ') || '—',
      ownEx: price(ownEx, metrics.ownCurrency),
      ownInc: price(ownInc, metrics.ownCurrency),
      marketEx: price(marketEx),
      marketInc: price(metrics.lowestPrice),
      shipping: shipping === 0 ? 'Gratis' : price(shipping),
      delivered: price(delivered),
      difference: percent(delta),
      differencePct: delta,
      sources: metrics.sourceCount,
      lastChecked: checked,
      status,
      review: metrics.reviewMatches,
      detailHref: '/producten/' + encodeURIComponent(product.id) + (filters.countryId ? '?markt=' + encodeURIComponent(filters.countryId) : ''),
    }
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const queryParams = new URLSearchParams()
  if (filters.q) queryParams.set('q', filters.q)
  if (filters.productGroupId) queryParams.set('productgroep', filters.productGroupId)
  if (filters.countryId) queryParams.set('land', filters.countryId)
  if (filters.competitorId) queryParams.set('concurrent', filters.competitorId)
  if (filters.identifierStatus) queryParams.set('identificatie', filters.identifierStatus)
  queryParams.set('aantal', String(pageSize))
  function pageHref(nextPage: number) {
    const copy = new URLSearchParams(queryParams)
    copy.set('pagina', String(nextPage))
    return '/producten?' + copy.toString()
  }
  const resultMessage = readParam(params.crawlstatus)
  const selectionMessage = readParam(params.selectie)
  const deleted = Number(readParam(params.verwijderd) || '0')

  return (
    <div className="space-y-3">
      {!result.available ? <DatabaseNotice /> : null}
      {deleted > 0 ? <p role="status" className="rounded-lg bg-[#eaf8f0] px-4 py-2.5 text-[11px] font-semibold text-[#20814d]">{deleted} producten verwijderd.</p> : null}
      {selectionMessage === 'leeg' || selectionMessage === 'ongeldig' ? <p role="alert" className="rounded-lg bg-[#fff4df] px-4 py-2.5 text-[11px] text-[#92641f]">Selecteer één of meerdere geldige producten.</p> : null}
      {resultMessage === 'klaar' ? <p role="status" className="rounded-lg bg-[#eaf8f0] px-4 py-2.5 text-[11px] text-[#20814d]">Prijscontrole afgerond. {readParam(params.bronnen) || '0'} bronnen gecontroleerd, resultaat {readParam(params.crawl) || 'onbekend'}.{readParam(params.limiet) === '1' ? ' De maximale batchgrootte is bereikt.' : ''}</p> : null}
      {resultMessage === 'mislukt' ? <p role="alert" className="rounded-lg bg-[#fff0f1] px-4 py-2.5 text-[11px] text-[#a93442]">Prijscontrole mislukt. Controleer de gekoppelde bronnen.</p> : null}
      {resultMessage === 'geen-bron' || resultMessage === 'geen-bronnen-selectie' ? <p role="status" className="rounded-lg bg-[#fff4df] px-4 py-2.5 text-[11px] text-[#92641f]">Voor de selectie zijn nog geen concurrentbronnen gekoppeld. Open een product om een bron toe te voegen.</p> : null}

      <section className="strong-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <h1>Producten</h1>
          <p className="mt-1 text-[11px] text-[#748296]">{formatNumber(totalCount)} producten, overzicht en prijsvergelijking per markt</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/import/bulk" className="secondary-action">Importeren</Link>
          <Link href="/feeds" className="secondary-action">Feed koppelen</Link>
          <Link href="/producten/nieuw" className="primary-action">Product toevoegen</Link>
        </div>
      </section>

      <section className="ps-panel px-3 py-3 sm:px-4">
        <form method="get" action="/producten" className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={filters.q || ''} placeholder="Zoek op artikelnummer, productnaam of EAN" aria-label="Zoek producten" className="toolbar-control min-w-[210px] flex-[2_1_240px]" />
          <select name="land" aria-label="Markt" defaultValue={filters.countryId || ''} className="toolbar-control min-w-[125px] flex-1">
            <option value="">Alle markten</option>
            {filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
          <select name="productgroep" aria-label="Productgroep" defaultValue={filters.productGroupId || ''} className="toolbar-control min-w-[140px] flex-1">
            <option value="">Alle productgroepen</option>
            {filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <details className="relative">
            <summary className="secondary-action cursor-pointer list-none">Filters</summary>
            <div className="absolute right-0 top-full z-30 mt-2 grid w-[250px] gap-3 rounded-xl border border-[#dce3ea] bg-white p-3 shadow-xl">
              <label className="text-[10px] font-semibold text-[#64758a]">Concurrent
                <select name="concurrent" defaultValue={filters.competitorId || ''} className="toolbar-control mt-1 w-full">
                  <option value="">Alle concurrenten</option>
                  {filterOptions.competitors.filter((competitor) => !filters.countryId || competitor.countryId === filters.countryId).map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-semibold text-[#64758a]">EAN
                <select name="identificatie" defaultValue={filters.identifierStatus || ''} className="toolbar-control mt-1 w-full">
                  <option value="">Alle EAN statussen</option>
                  <option value="aanwezig">EAN aanwezig</option>
                  <option value="ontbreekt">EAN ontbreekt</option>
                </select>
              </label>
              <p className="text-[10px] text-[#8492a1]">Gebruik Toepassen om de filters bij te werken.</p>
            </div>
          </details>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[#66788d]">
            Tonen
            <select name="aantal" defaultValue={String(pageSize)} className="toolbar-control min-w-[75px]">
              <option value="25">25</option><option value="50">50</option>
            </select>
          </label>
          <button type="submit" className="primary-action">Toepassen</button>
          <Link href="/producten" className="secondary-action">Wissen</Link>
        </form>
        {selectedCountry ? <p className="mt-2 text-[10px] text-[#748296]">Marktprofiel, {selectedCountry.name}. Prijzen en concurrenten worden voor dit land weergegeven.</p> : <p className="mt-2 text-[10px] text-[#748296]">Alle markten, selecteer een land voor een landspecifieke prijsvergelijking.</p>}
      </section>

      <ProductOverviewGrid
        rows={rows}
        totalCount={totalCount}
        canCrawl={canCrawl}
        canDelete={canDelete}
        deleteAction={deleteSelectedProductsAction}
        refreshPricesAction={refreshSelectedProductPricesAction}
        refreshSinglePriceAction={refreshSingleProductPriceAction}
      />

      <nav aria-label="Pagina's" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-4 py-3 text-[11px] text-[#66788d]">
        <span>Pagina {page} van {totalPages}, {formatNumber(totalCount)} producten</span>
        <div className="flex gap-2">
          <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1} className={'secondary-action min-h-[32px] px-3 py-1.5 ' + (page <= 1 ? 'pointer-events-none opacity-40' : '')}>Vorige</Link>
          <Link href={pageHref(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages} className={'primary-action min-h-[32px] px-3 py-1.5 ' + (page >= totalPages ? 'pointer-events-none opacity-40' : '')}>Volgende</Link>
        </div>
      </nav>
    </div>
  )
}
