export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { selectedMarketCode } from '@/lib/market-context'
import { assignProductGroupAction, deleteSelectedProductsAction } from '@/app/actions/productBulkActions'
import { refreshSelectedProductPricesAction, refreshSingleProductPriceAction } from '@/app/actions/productPriceBulkActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { ProductOverviewGrid, type ProductGridRow } from '@/components/ProductOverviewGrid'
import { ProductComparisonView } from '@/components/ProductComparisonView'
import { isPlausibleMarketPrice } from '@/lib/price-quality'
import { requirePermission } from '@/lib/authz'
import { deriveProductMetrics, getFilterOptions } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { calculateDeliveredAmounts } from '@/lib/manual-price-input'
import { safeDatabaseQuery } from '@/lib/safe-database'
import { productGroupLabel } from '@/lib/product-groups'
import { profileStep } from '@/lib/performance-profile'
import { comparisonQuality } from '@/lib/comparison-quality'

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
  const [marketCode, activeMarkets] = await Promise.all([selectedMarketCode(actor.companyId), getActiveCompanyCountries(actor.companyId)])
  const activeMarket = activeMarkets.find(market => market.code.toUpperCase() === marketCode)
  const requestedMarket = readParam(params.land)
  const scopedMarket = activeMarkets.find(market => market.id === requestedMarket)
  const selectedCountryId = requestedMarket === '' ? undefined : requestedMarket ? scopedMarket?.id ?? '__unlicensed_market__' : activeMarket?.id
  const canCrawl = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('pricing.manage')
  const canDelete = actor.role === 'SUPER_ADMIN' || actor.permissions.includes('products.write')
  const filters = {
    q: readParam(params.q)?.trim() || undefined,
    productGroupId: readParam(params.productgroep) || undefined,
    countryId: selectedCountryId,
    competitorId: readParam(params.concurrent) || undefined,
    identifierStatus: readParam(params.identificatie) || undefined,
    feedSourceId: readParam(params.feed) || undefined,
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
      filters.feedSourceId ? { feedLinks: { some: { companyId: actor.companyId, feedSourceId: filters.feedSourceId, feedSource: { companyId: actor.companyId } } } } : {},
    ],
  }

  const result = await profileStep('/producten', 'overview-query', () => safeDatabaseQuery(async () => {
    const [products, totalCount, filterOptions, feedOptions] = await Promise.all([
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
      prisma.feedSource.findMany({ where: { companyId: actor.companyId }, select: { id: true, name: true, countryCode: true }, orderBy: [{ countryCode: 'asc' }, { name: 'asc' }] }),
    ])
    return { products, totalCount, filterOptions, feedOptions }
  }, { products: [], totalCount: 0, filterOptions: { countries: [], productGroups: [], competitors: [] }, feedOptions: [] as Array<{ id: string; name: string; countryCode: string }> }), { companyId: actor.companyId, pageSize }, 450)

  const { products, totalCount, filterOptions, feedOptions } = result.data
  const selectedFeed = feedOptions.find((feed) => feed.id === filters.feedSourceId)
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
    const ownShippingAmount = selectedCountry && metrics.selectedMarket
      ? metrics.selectedMarket.ownShippingCost
      : metrics.selectedMarket
        ? metrics.selectedMarket.ownShippingCost
        : product.ownShippingCost
    const ownShipping = ownShippingAmount === null ? null : Number(ownShippingAmount)
    const ownAmounts = calculateDeliveredAmounts({
      price: ownPrice, priceVatIncluded: metrics.vatIncluded, shipping: ownShipping,
      shippingVatIncluded: metrics.selectedMarket?.ownShippingVatIncluded ?? product.ownShippingVatIncluded ?? true,
      vatRate: validOwnRate ? ownVatRate : null,
    })
    const hasOwnPriceInMarket = !selectedCountry || Boolean(metrics.selectedMarket)
    const ownEx = hasOwnPriceInMarket ? ownAmounts.priceEx : null
    const ownInc = hasOwnPriceInMarket ? ownAmounts.priceInc : null
    const lowestOffer = metrics.lowestOffer?.competitorOffer
    const lowestRate = lowestOffer ? Number(lowestOffer.competitor.country.vatRate) : null
    const marketEx = metrics.lowestPrice !== null && lowestRate !== null && Number.isFinite(lowestRate)
      ? metrics.lowestPrice / (1 + lowestRate / 100) : null
    const shipping = lowestOffer?.normalizedShippingCost === null || lowestOffer?.normalizedShippingCost === undefined
      ? null : Number(lowestOffer.normalizedShippingCost)
    const delivered = lowestOffer?.deliveredPrice === null || lowestOffer?.deliveredPrice === undefined
      ? null : Number(lowestOffer.deliveredPrice)
    const deliveryDelta = metrics.ownCurrency === 'EUR' && ownAmounts.totalInc !== null && delivered !== null && delivered > 0
      ? (ownAmounts.totalInc - delivered) / delivered * 100 : null
    const delta = deliveryDelta ?? (metrics.difference.pctDiff === null || metrics.difference.pctDiff === undefined
      ? null : Number(metrics.difference.pctDiff))
    const checked = metrics.lastCheckedAt ? formatDate(metrics.lastCheckedAt) : 'Nog niet'
    const lastCheckFailed = metrics.lowestOffer?.competitorOffer.priceChecks[0]?.isSuccess === false
    const stock = metrics.selectedMarket?.stockStatus ?? product.stockStatus
    const confirmedOffers = filters.countryId && selectedCountry ? product.matches
      .filter((match) => {
        const offer = match.competitorOffer
        const amount = offer.normalizedPrice === null ? null : Number(offer.normalizedPrice)
        return match.matchStatus === 'CERTAIN' && offer.isActive && offer.competitor.isActive
          && offer.competitor.countryId === selectedCountry.id
          && offer.priceHistory.length > 0 && offer.priceChecks[0]?.isSuccess === true
          && isPlausibleMarketPrice(ownAmounts.priceInc, amount)
      })
      .sort((a, b) => Number(a.competitorOffer.normalizedPrice) - Number(b.competitorOffer.normalizedPrice)) : []
    const comparisons = confirmedOffers.map((match) => {
      const offer = match.competitorOffer
      const amount = Number(offer.normalizedPrice)
      const rate = Number(offer.competitor.country.vatRate)
      const shippingAmount = offer.normalizedShippingCost === null ? null : Number(offer.normalizedShippingCost)
      const totalAmount = offer.deliveredPrice === null ? null : Number(offer.deliveredPrice)
      const isStale = !offer.lastCheckedAt || Date.now() - offer.lastCheckedAt.getTime() > 72 * 60 * 60 * 1000
      return {
        id: offer.id,
        name: offer.competitor.name,
        priceInc: price(amount),
        priceEx: Number.isFinite(rate) && rate >= 0 ? price(amount / (1 + rate / 100)) : '—',
        shippingInc: shippingAmount === 0 ? 'Gratis' : price(shippingAmount),
        totalInc: shippingAmount === null ? '—' : price(totalAmount),
        stock: offer.stockStatus,
        checked: isStale ? 'Verouderd' : offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Onbekend',
        detailHref: '/producten/' + encodeURIComponent(product.id) + '?markt=' + encodeURIComponent(selectedCountry.id) + '&concurrent=' + encodeURIComponent(offer.id) + '#concurrentieprijzen',
      }
    })
    const lowestConfirmed = confirmedOffers.length ? Number(confirmedOffers[0].competitorOffer.normalizedPrice) : null
    const comparisonDifference = metrics.ownCurrency === 'EUR' && ownInc !== null && lowestConfirmed !== null && lowestConfirmed > 0
      ? (ownInc - lowestConfirmed) / lowestConfirmed * 100 : null
    const status = lastCheckFailed ? 'Controle mislukt'
      : metrics.reviewMatches > 0 ? 'Beoordelen'
        : metrics.stale ? 'Vernieuwen'
          : metrics.sourceCount > 0 ? 'Actueel'
            : stock && /niet op voorraad|uitverkocht|out of stock|sold out/i.test(stock) ? 'Niet op voorraad' : 'Geen bronnen'
    const quality = comparisonQuality({ verifiedOfferCount: confirmedOffers.length, sourceCount: metrics.sourceCount,
      reviewCount: metrics.reviewMatches, stale: metrics.stale, lastCheckFailed })
    return {
      id: product.id,
      articleNumber: product.articleNumber,
      name: product.name,
      ean: product.ean || product.gtin || '',
      group: productGroupLabel(product.productGroup),
      markets: product.productMarkets.map((market) => market.country.code).join(', ') || '—',
      ownEx: price(ownEx, metrics.ownCurrency),
      ownInc: price(ownInc, metrics.ownCurrency),
      ownShipping: hasOwnPriceInMarket ? (ownShipping === 0 ? 'Gratis' : price(ownAmounts.shippingInc, metrics.ownCurrency)) : '—',
      ownDelivered: price(hasOwnPriceInMarket ? ownAmounts.totalInc : null, metrics.ownCurrency),
      marketEx: price(marketEx),
      marketInc: price(metrics.lowestPrice),
      shipping: shipping === 0 ? 'Gratis' : price(shipping),
      delivered: price(delivered),
      difference: percent(delta),
      comparisonDifference: percent(comparisonDifference),
      comparisonLowest: price(lowestConfirmed),
      quality: quality.code, qualityLabel: quality.label, qualityDetail: quality.detail,
      comparisons,
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
  if (filters.feedSourceId) queryParams.set('feed', filters.feedSourceId)
  queryParams.set('aantal', String(pageSize))
  function pageHref(nextPage: number) {
    const copy = new URLSearchParams(queryParams)
    copy.set('pagina', String(nextPage))
    return '/producten?' + copy.toString()
  }
  const view = readParam(params.weergave) === 'tabel' ? 'tabel' : 'vergelijking'
  queryParams.set('weergave', view)
  const comparisonParams = new URLSearchParams(queryParams)
  comparisonParams.set('weergave', 'vergelijking')
  const tableParams = new URLSearchParams(queryParams)
  tableParams.set('weergave', 'tabel')
  const comparisonHref = '/producten?' + comparisonParams.toString()
  const tableHref = '/producten?' + tableParams.toString()
  const resultMessage = readParam(params.crawlstatus)
  const selectionMessage = readParam(params.selectie)
  const deleted = Number(readParam(params.verwijderd) || '0')

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 px-1 pt-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em] text-[#17233a]">Producten</h1>
          <p className="mt-1 text-[11px] text-[#7b899a]">Vergelijk prijzen en beheer alleen wat aandacht nodig heeft.</p>
        </div>
        <Link href="/producten/nieuw" className="primary-action self-start sm:self-auto">Product toevoegen</Link>
      </header>

      {!result.available ? <DatabaseNotice /> : null}
      {Number(readParam(params.groepBijgewerkt) || '0') > 0 ? <p role="status" className="rounded-lg bg-[#eaf8f0] px-4 py-2.5 text-[11px] font-semibold text-[#20814d]">Productgroep aangepast voor {readParam(params.groepBijgewerkt)} producten.</p> : null}
      {deleted > 0 ? <p role="status" className="rounded-lg bg-[#eaf8f0] px-4 py-2.5 text-[11px] font-semibold text-[#20814d]">{deleted} producten verwijderd.</p> : null}
      {selectionMessage === 'leeg' || selectionMessage === 'ongeldig' ? <p role="alert" className="rounded-lg bg-[#fff4df] px-4 py-2.5 text-[11px] text-[#92641f]">Selecteer één of meerdere geldige producten.</p> : null}
      {resultMessage === 'klaar' ? <p role="status" className="rounded-lg bg-[#eaf8f0] px-4 py-2.5 text-[11px] text-[#20814d]">Prijscontrole afgerond. {readParam(params.bronnen) || '0'} bronnen gecontroleerd, resultaat {readParam(params.crawl) || 'onbekend'}.{readParam(params.limiet) === '1' ? ' De maximale batchgrootte is bereikt.' : ''}</p> : null}
      {resultMessage === 'mislukt' ? <p role="alert" className="rounded-lg bg-[#fff0f1] px-4 py-2.5 text-[11px] text-[#a93442]">Prijscontrole mislukt. Controleer de gekoppelde bronnen.</p> : null}
      {resultMessage === 'geen-bron' || resultMessage === 'geen-bronnen-selectie' ? <p role="status" className="rounded-lg bg-[#fff4df] px-4 py-2.5 text-[11px] text-[#92641f]">Voor de selectie zijn nog geen concurrentbronnen gekoppeld. Open een product om een bron toe te voegen.</p> : null}

      <section className="ps-panel p-3 sm:p-4">
        <form method="get" action="/producten" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="weergave" value={view} />
          <input
            name="q"
            defaultValue={filters.q || ''}
            placeholder="Zoek product, artikelnummer of EAN"
            aria-label="Zoek producten"
            className="toolbar-control min-w-[220px] flex-[2_1_320px]"
          />
          <select name="land" aria-label="Markt" defaultValue={filters.countryId || ''} className="toolbar-control min-w-[150px] flex-1">
            <option value="">Alle markten</option>
            {activeMarkets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
          </select>

          <details className="relative">
            <summary className="secondary-action cursor-pointer list-none font-medium">Filters</summary>
            <div className="absolute right-0 top-full z-30 mt-2 grid w-[280px] gap-3 rounded-xl border border-[#dce3ea] bg-white p-3 shadow-xl">
              <label className="text-[10px] font-medium text-[#64758a]">Productgroep
                <select name="productgroep" defaultValue={filters.productGroupId || ''} className="toolbar-control mt-1 w-full">
                  <option value="">Alle productgroepen</option>
                  {filterOptions.productGroups.filter((group) => productGroupLabel(group) !== 'Nog niet ingedeeld').map((group) => <option key={group.id} value={group.id}>{productGroupLabel(group)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64758a]">Productfeed
                <select name="feed" defaultValue={filters.feedSourceId || ''} className="toolbar-control mt-1 w-full">
                  <option value="">Alle feeds</option>
                  {feedOptions.map((feed) => <option key={feed.id} value={feed.id}>{feed.countryCode} · {feed.name}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64758a]">Concurrent
                <select name="concurrent" defaultValue={filters.competitorId || ''} className="toolbar-control mt-1 w-full">
                  <option value="">Alle concurrenten</option>
                  {filterOptions.competitors.filter((competitor) => !filters.countryId || competitor.countryId === filters.countryId).map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64758a]">EAN status
                <select name="identificatie" defaultValue={filters.identifierStatus || ''} className="toolbar-control mt-1 w-full">
                  <option value="">Alle statussen</option>
                  <option value="aanwezig">EAN aanwezig</option>
                  <option value="ontbreekt">EAN ontbreekt</option>
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64758a]">Resultaten per pagina
                <select name="aantal" defaultValue={String(pageSize)} className="toolbar-control mt-1 w-full">
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </label>
            </div>
          </details>

          <button type="submit" className="primary-action">Toepassen</button>
          {(filters.q || filters.productGroupId || filters.competitorId || filters.identifierStatus || filters.feedSourceId || requestedMarket) ? (
            <Link href="/producten" className="px-2 text-[11px] text-[#6e7f92] hover:text-[#315fa7]">Wissen</Link>
          ) : null}
        </form>

        {selectedFeed ? (
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#edf1f5] pt-2 text-[10px] text-[#6f8093]">
            <span>Feed, {selectedFeed.name} · {selectedFeed.countryCode}</span>
            <Link href="/instellingen/feedbeheer" className="text-[#315fa7] hover:underline">Beheer feed</Link>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
        <span className="text-[11px] text-[#718096]">{formatNumber(totalCount)} producten{selectedCountry ? ` · ${selectedCountry.name}` : ''}</span>
        <div role="group" aria-label="Weergave" className="inline-flex gap-1 rounded-lg bg-[#edf2f8] p-1 text-[11px] font-semibold">
          <Link href={comparisonHref} aria-current={view === 'vergelijking' ? 'page' : undefined} className={'rounded-md px-3 py-2 font-medium ' + (view === 'vergelijking' ? 'bg-white text-[#244976] shadow-sm' : 'text-[#68798f]')}>Prijzen</Link>
          <Link href={tableHref} aria-current={view === 'tabel' ? 'page' : undefined} className={'rounded-md px-3 py-2 font-medium ' + (view === 'tabel' ? 'bg-white text-[#244976] shadow-sm' : 'text-[#68798f]')}>Beheer</Link>
        </div>
      </div>
      {view === 'vergelijking' ? (
        selectedCountry ? <ProductComparisonView rows={rows} canCrawl={canCrawl} refreshSinglePriceAction={refreshSingleProductPriceAction} />
          : <section className="rounded-xl border border-[#e2e8f0] bg-white px-6 py-9 text-center"><h3 className="text-[14px] font-medium text-[#253a50]">Kies een markt om prijzen te vergelijken</h3><p className="mt-1 text-[11px] text-[#7a899b]">Of open Beheer voor alle producten.</p><Link href={tableHref} className="secondary-action mt-4 inline-flex">Open beheer</Link></section>
      ) : <ProductOverviewGrid
        rows={rows}
        totalCount={totalCount}
        countryId={selectedCountry?.id}
        canCrawl={canCrawl}
        canDelete={canDelete}
        deleteAction={deleteSelectedProductsAction}
        assignGroupAction={assignProductGroupAction}
        productGroups={filterOptions.productGroups.filter((group) => productGroupLabel(group) !== 'Nog niet ingedeeld').map((group) => ({ id: group.id, name: productGroupLabel(group) }))}
        refreshPricesAction={refreshSelectedProductPricesAction}
        refreshSinglePriceAction={refreshSingleProductPriceAction}
        filters={filters}
      />}

      <nav aria-label="Pagina's" className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-[10px] text-[#7b899a]">
        <span>Pagina {page} van {totalPages}, {formatNumber(totalCount)} producten</span>
        <div className="flex gap-2">
          <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1} className={'secondary-action min-h-[32px] px-3 py-1.5 ' + (page <= 1 ? 'pointer-events-none opacity-40' : '')}>Vorige</Link>
          <Link href={pageHref(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages} className={'primary-action min-h-[32px] px-3 py-1.5 ' + (page >= totalPages ? 'pointer-events-none opacity-40' : '')}>Volgende</Link>
        </div>
      </nav>
    </div>
  )
}
