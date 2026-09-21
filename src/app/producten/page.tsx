export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { deleteSelectedProductsAction } from '@/app/actions/productBulkActions'
import { refreshSelectedProductPricesAction, refreshSingleProductPriceAction } from '@/app/actions/productPriceBulkActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { MarketProfileSelector } from '@/components/MarketProfileSelector'
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
  return normalized.includes('out of stock')
    || normalized.includes('niet op voorraad')
    || normalized.includes('uitverkocht')
    || normalized.includes('unavailable')
    || normalized.includes('sold out')
}

function stockLabel(value: string | null | undefined) {
  if (!value) return 'Onbekend'
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
  const pageSize = 16

  const where = {
    companyId: actor.companyId,
    isActive: true,
    productGroupId: filters.productGroupId || undefined,
    AND: [
      filters.q ? {
        OR: [
          { articleNumber: { contains: filters.q, mode: 'insensitive' as const } },
          { name: { contains: filters.q, mode: 'insensitive' as const } },
          { ean: { contains: filters.q } },
          { gtin: { contains: filters.q } },
        ],
      } : {},
      filters.countryId ? {
        productMarkets: { some: { companyId: actor.companyId, countryId: filters.countryId, isActive: true } },
      } : {},
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
          productMarkets: { where: { companyId: actor.companyId, isActive: true }, include: { country: true } },
          matches: {
            where: {
              companyId: actor.companyId,
              competitorOffer: {
                isActive: true,
                competitorId: filters.competitorId || undefined,
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

  const paginationParams = Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => [
        key === 'productGroupId' ? 'productgroep'
          : key === 'countryId' ? 'land'
            : key === 'competitorId' ? 'concurrent'
              : key === 'identifierStatus' ? 'identificatie'
                : key,
        value as string,
      ]),
  )

  const activeFilterCount = [filters.productGroupId, filters.competitorId, filters.identifierStatus].filter(Boolean).length

  return (
    <div className="space-y-3">
      {!result.available && <DatabaseNotice />}

      {deletedCount > 0 ? <div className="rounded-[10px] bg-[#eaf8f0] px-4 py-3 text-[11px] font-semibold text-[#20814d]">{formatNumber(deletedCount)} product{deletedCount === 1 ? '' : 'en'} verwijderd.</div> : null}
      {selectionState === 'leeg' ? <div className="rounded-[10px] bg-[#fff4df] px-4 py-3 text-[11px] font-semibold text-[#8b611d]">Selecteer eerst één of meerdere producten.</div> : null}
      {selectionState === 'ongeldig' ? <div className="rounded-[10px] bg-[#fff0f1] px-4 py-3 text-[11px] font-semibold text-[#a93442]">De selectie kon niet worden verwerkt.</div> : null}
      {crawlStatus === 'geen-bron' ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[#edd9aa] bg-[#fff8e9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold text-[#7b5a1b]">{crawlProduct ? `Artikel ${crawlProduct} heeft` : 'Dit product heeft'} nog geen concurrentbron.</p>
          {openProduct ? <Link href={`/producten/${openProduct}#concurrent-bron-toevoegen`} className="secondary-action min-h-0 px-3 py-2 text-[10px]">Bron koppelen</Link> : null}
        </div>
      ) : null}
      {crawlStatus === 'geen-bronnen-selectie' ? <div className="rounded-[10px] border border-[#edd9aa] bg-[#fff8e9] px-4 py-3 text-[11px] font-semibold text-[#7b5a1b]">De selectie bevat nog geen gekoppelde concurrentbronnen.</div> : null}
      {crawlStatus === 'mislukt' ? <div className="rounded-[10px] border border-[#efc8cd] bg-[#fff2f3] px-4 py-3 text-[11px] font-semibold text-[#9c3442]">De prijscontrole is mislukt{crawlProduct ? ` voor artikel ${crawlProduct}` : ''}.</div> : null}
      {crawlStatus === 'klaar' && crawlResult ? <div className="rounded-[10px] bg-[#eaf8f0] px-4 py-3 text-[11px] font-semibold text-[#1e7448]">Prijscontrole klaar, {formatNumber(crawlSources)} bron{crawlSources === 1 ? '' : 'nen'} gecontroleerd, resultaat {crawlResult}.{crawlLimited ? ' De batchlimiet is bereikt.' : ''}</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h1>Producten</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium text-[#748296]">
              <span>{formatNumber(totalCount)} producten</span>
              <span>{coverage}% prijsdekking</span>
              <span>{formatNumber(monitoredOffers)} bronnen</span>
              <span className={attentionCount ? 'text-[#a36816]' : 'text-[#20814d]'}>{formatNumber(attentionCount)} aandacht</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MarketProfileSelector
              countries={filterOptions.countries.map((country) => ({ id: country.id, name: country.name }))}
              value={filters.countryId}
              allowAll
              compact
            />
            <Link href="/import/bulk" className="secondary-action">Importeren</Link>
            <Link href="/producten/nieuw" className="primary-action">Product toevoegen</Link>
          </div>
        </div>
      </section>

      <section className="ps-panel p-3.5">
        <form className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {filters.countryId ? <input type="hidden" name="land" value={filters.countryId} /> : null}
          <input name="q" defaultValue={filters.q} placeholder="Zoek product, artikelnummer of EAN" className="toolbar-control min-w-0 flex-1" />
          <select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control lg:w-[190px]">
            <option value="">Alle productgroepen</option>
            {filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <button className="primary-action min-w-[84px]">Zoeken</button>
          <details className="relative">
            <summary className="secondary-action cursor-pointer list-none">
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </summary>
            <div className="mt-2 grid gap-2 rounded-[12px] border border-[#dce3ea] bg-white p-3 lg:absolute lg:right-0 lg:z-20 lg:w-[280px] lg:shadow-[0_12px_30px_rgba(31,49,77,.12)]">
              <select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control w-full">
                <option value="">Alle concurrenten</option>
                {filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
              </select>
              <select name="identificatie" defaultValue={filters.identifierStatus} className="toolbar-control w-full">
                <option value="">Alle EAN statussen</option>
                <option value="aanwezig">EAN aanwezig</option>
                <option value="ontbreekt">EAN ontbreekt</option>
              </select>
              <div className="flex justify-between gap-2">
                <Link href={filters.countryId ? `/producten?land=${filters.countryId}` : '/producten'} className="secondary-action min-h-0 px-3 py-2 text-[10px]">Wissen</Link>
                <button className="primary-action min-h-0 px-3 py-2 text-[10px]">Toepassen</button>
              </div>
            </div>
          </details>
        </form>
        {selectedCountry ? <p className="mt-2 px-1 text-[9px] font-medium text-[#788698]">Actief marktprofiel, {selectedCountry.name}</p> : null}
      </section>

      <form id="product-bulk-form" action={deleteSelectedProductsAction} className="space-y-2.5">
        <div className="ps-panel flex flex-col gap-2.5 p-3 lg:flex-row lg:items-center lg:justify-between">
          <ProductSelectionControls formId="product-bulk-form" />
          <div className="flex flex-wrap gap-2">
            {canCrawl ? <button type="submit" formAction={refreshSelectedProductPricesAction} className="secondary-action min-h-[34px] px-3 py-2 text-[10px]">Prijzen ophalen</button> : null}
            <button type="submit" className="ps-button-danger min-h-[34px] px-3 py-2 text-[10px]">Verwijderen</button>
          </div>
        </div>

        <div className="ps-panel overflow-hidden">
          <div className="hidden grid-cols-[36px_minmax(270px,1.5fr)_minmax(145px,.8fr)_minmax(135px,.75fr)_90px_90px_150px] items-center gap-3 border-b border-[#e7edf3] bg-[#f7f9fc] px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.05em] text-[#8290a1] lg:grid">
            <span />
            <span>Product</span>
            <span>Eigen prijs</span>
            <span>Laagste markt</span>
            <span>Verschil</span>
            <span>Bronnen</span>
            <span className="text-right">Acties</span>
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-[14px] font-semibold text-[#34495f]">Geen producten gevonden</p>
              <p className="mt-1 text-[10px] text-[#7b8999]">Pas je zoekopdracht of marktprofiel aan.</p>
            </div>
          ) : null}

          <div className="divide-y divide-[#edf1f5]">
            {rows.map((item) => {
              const pctDiff = item.difference.pctDiff !== null && item.difference.pctDiff !== undefined ? Number(item.difference.pctDiff) : null
              const cheapestCompetitor = item.lowestOffer?.competitorOffer.competitor.name ?? null
              const identifier = item.product.ean ?? item.product.gtin
              const detailHref = filters.countryId ? `/producten/${item.product.id}?land=${filters.countryId}` : `/producten/${item.product.id}`
              const marketNames = item.product.productMarkets.map((market) => market.country.code).slice(0, 4)

              return (
                <article key={item.product.id} className="px-4 py-3 transition hover:bg-[#fafcff]">
                  <div className="grid gap-3 lg:grid-cols-[36px_minmax(270px,1.5fr)_minmax(145px,.8fr)_minmax(135px,.75fr)_90px_90px_150px] lg:items-center">
                    <div className="flex items-center">
                      <input type="checkbox" name="productIds" value={item.product.id} aria-label={`Selecteer ${item.product.name}`} className="h-[17px] w-[17px] cursor-pointer rounded" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={detailHref} className="truncate text-[13px] font-semibold text-[#20344b] hover:text-[#2f6edb]">{item.product.name}</Link>
                        {item.stale ? <span className="ps-chip ps-chip-amber">Vernieuwen</span> : item.sourceCount > 0 ? <span className="ps-chip ps-chip-green">Actueel</span> : null}
                        {item.reviewMatches > 0 ? <span className="ps-chip ps-chip-amber">{item.reviewMatches} review</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[#8591a0]">
                        <span>{item.product.articleNumber}</span>
                        <span>{identifier ? `EAN ${identifier}` : 'Geen EAN'}</span>
                        {marketNames.map((code) => <span key={code} className="rounded bg-[#f0f4f8] px-1.5 py-0.5 font-semibold text-[#66778a]">{code}</span>)}
                      </div>
                    </div>

                    <div>
                      {item.ownPrice !== null && item.ownPrice !== undefined ? (
                        <>
                          <p className="text-[12px] font-semibold text-[#24384f]">{formatCurrency(item.ownPriceExVat, item.ownCurrency)} <span className="text-[8px] font-medium text-[#8a98a9]">excl.</span></p>
                          <p className="mt-0.5 text-[10px] font-semibold text-[#53677f]">{formatCurrency(item.ownPriceIncVat, item.ownCurrency)} <span className="text-[8px] font-medium text-[#8a98a9]">incl.</span></p>
                        </>
                      ) : <Link href={`${detailHref}#eigen-prijs`} className="text-[10px] font-semibold text-[#2f6edb]">Prijs toevoegen</Link>}
                    </div>

                    <div>
                      <p className="text-[12px] font-semibold text-[#24384f]">{formatCurrency(item.lowestPrice)}</p>
                      {cheapestCompetitor ? <p className="mt-0.5 truncate text-[9px] text-[#8793a3]">{cheapestCompetitor}</p> : null}
                    </div>

                    <div>
                      <p className={`text-[12px] font-semibold ${pctDiff !== null && pctDiff > 0 ? 'text-[#b6414d]' : pctDiff !== null && pctDiff < 0 ? 'text-[#20814d]' : 'text-[#6f8093]'}`}>
                        {pctDiff !== null ? `${pctDiff > 0 ? '+' : ''}${formatNumber(pctDiff, 1)}%` : '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-[12px] font-semibold text-[#34495f]">{formatNumber(item.sourceCount)}</p>
                      <p className="mt-0.5 text-[8px] text-[#8793a3]">{item.lastCheckedAt ? formatDate(item.lastCheckedAt) : stockLabel(item.product.stockStatus)}</p>
                    </div>

                    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                      {canCrawl ? <button type="submit" name="singleProductId" value={item.product.id} formAction={refreshSingleProductPriceAction} className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[9px]">Ophalen</button> : null}
                      <Link href={detailHref} className="primary-action min-h-[32px] px-3 py-1.5 text-[9px]">Openen</Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between px-1 text-[10px] font-medium text-[#66778a]">
        <span>Pagina {page} van {totalPages}</span>
        <div className="flex gap-2">
          <Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.max(page - 1, 1)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Vorige</Link>
          <Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.min(page + 1, totalPages)) }).toString()}`} className="primary-action min-h-0 px-3 py-2">Volgende</Link>
        </div>
      </div>
    </div>
  )
}
