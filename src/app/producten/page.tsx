export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { deleteSelectedProductsAction } from '@/app/actions/productBulkActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requirePermission } from '@/lib/authz'
import { deriveProductMetrics, getFilterOptions } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function numberValue(value: unknown) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isOutOfStock(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('out of stock') || normalized.includes('niet op voorraad') || normalized.includes('uitverkocht') || normalized.includes('unavailable') || normalized.includes('sold out')
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
  const filters = {
    q: readParam(params.q),
    productGroupId: readParam(params.productgroep),
    countryId: readParam(params.land),
    competitorId: readParam(params.concurrent),
    identifierStatus: readParam(params.identificatie),
  }
  const page = Math.max(Number(readParam(params.pagina) ?? '1') || 1, 1)
  const pageSize = 8

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
  const sourceByProduct = new Map(products.map((product) => [
    product.id,
    [...new Set(product.feedLinks.map((link) => link.feedSource.name))],
  ]))
  const rows = products.map((product) => deriveProductMetrics(product, filters))
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1)

  type ProductMetricRecord = (typeof rows)[number]['product']
  const visibleMatches = (product: ProductMetricRecord) => product.matches.filter((match) => {
    if (!match.competitorOffer.isActive) return false
    if (filters.competitorId && match.competitorOffer.competitorId !== filters.competitorId) return false
    if (filters.countryId && match.competitorOffer.competitor.countryId !== filters.countryId) return false
    return true
  })

  const selectedCountry = filterOptions.countries.find((country) => country.id === filters.countryId)
  const comparableCount = rows.filter((item) => item.lowestPrice !== null && item.ownPrice !== null).length
  const coverage = rows.length ? Math.round((comparableCount / rows.length) * 100) : 0
  const expensiveCount = rows.filter((item) => item.marketPosition === 'Engels duurder').length
  const lowestCount = rows.filter((item) => item.marketPosition === 'Engels laagste').length
  const equalCount = rows.filter((item) => item.marketPosition === 'Gelijk aan markt').length
  const noPriceCount = rows.filter((item) => item.marketPosition === 'Geen concurrentieprijs').length
  const attentionCount = rows.filter((item) => item.reviewMatches > 0 || item.lowestPrice === null).length
  const identifierCount = rows.filter((item) => Boolean(item.product.ean || item.product.gtin)).length
  const identifierCoverage = rows.length ? Math.round((identifierCount / rows.length) * 100) : 0

  let increasedOffers = 0
  let decreasedOffers = 0
  let outOfStockOffers = 0
  for (const item of rows) {
    for (const match of visibleMatches(item.product)) {
      const offer = match.competitorOffer
      if (isOutOfStock(offer.stockStatus)) outOfStockOffers += 1
      const [latest, previous] = offer.priceHistory
      const latestPrice = latest ? numberValue(latest.normalizedPrice ?? latest.price) : null
      const previousPrice = previous ? numberValue(previous.normalizedPrice ?? previous.price) : null
      if (latestPrice !== null && previousPrice !== null) {
        if (latestPrice > previousPrice) increasedOffers += 1
        if (latestPrice < previousPrice) decreasedOffers += 1
      }
    }
  }

  const paginationParams = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)).map(([key, value]) => [key === 'productGroupId' ? 'productgroep' : key === 'countryId' ? 'land' : key === 'competitorId' ? 'concurrent' : key === 'identifierStatus' ? 'identificatie' : key, value as string]))

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}
      {deletedCount > 0 ? <div className="rounded-[13px] bg-[#eaf8f0] px-4 py-3 text-[11px] font-bold text-[#20814d] shadow-[0_6px_16px_rgba(31,48,70,.06)]">{formatNumber(deletedCount)} product{deletedCount === 1 ? '' : 'en'} verwijderd.</div> : null}
      {selectionState === 'leeg' ? <div className="rounded-[13px] bg-[#fff4df] px-4 py-3 text-[11px] font-bold text-[#a36816] shadow-[0_6px_16px_rgba(31,48,70,.06)]">Selecteer eerst één of meerdere producten.</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsvergelijking</p>
            <h1 className="mt-2">Producten</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#66778a]">Bekijk per product direct je eigen prijs, concurrentprijzen, voorraad, prijsbeweging en marktpositie. Geen losse tabellen meer, maar één werkbaar vergelijkingsscherm.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/producten?identificatie=ontbreekt" className="secondary-action">EAN ontbreekt</Link>
            <Link href="/import" className="ps-button-green">Bulk importeren</Link>
            <Link href="/producten/nieuw" className="primary-action">+ Product toevoegen</Link>
          </div>
        </div>
        <div className="grid sm:grid-cols-5">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Producten</p><p className="mt-1 text-[27px] font-black">{formatNumber(totalCount)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">EAN dekking</p><p className={`mt-1 text-[27px] font-black ${identifierCoverage < 100 ? 'text-[#a36816]' : 'text-[#20814d]'}`}>{identifierCoverage}%</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Prijsdekking</p><p className="mt-1 text-[27px] font-black text-[#1e2d3f]">{coverage}%</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Boven markt</p><p className={`mt-1 text-[27px] font-black ${expensiveCount ? 'text-[#b6414d]' : 'text-[#20814d]'}`}>{formatNumber(expensiveCount)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Aandacht</p><p className={`mt-1 text-[27px] font-black ${attentionCount ? 'text-[#a36816]' : 'text-[#20814d]'}`}>{formatNumber(attentionCount)}</p></div>
        </div>
      </section>

      <form className="ps-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[15px] font-black text-[#1e2d3f]">Zoeken en filteren</h2><p className="mt-1 text-[10px] font-semibold text-[#748296]">Houd alleen de markt en producten in beeld waar je nu aan wilt werken.</p></div>
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
        <p className="mt-3 text-[10px] font-semibold text-[#748296]">{selectedCountry ? `Actieve markt, ${selectedCountry.name}. Eigen prijzen en concurrenten zijn op dit land gefilterd.` : 'Alle actieve markten gecombineerd. Kies een land voor een lokale vergelijking.'}</p>
      </form>

      <form action={deleteSelectedProductsAction} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div><h2 className="text-[16px] font-black text-[#1e2d3f]">Prijsmonitor</h2><p className="mt-1 text-[11px] font-semibold text-[#66778a]">Pagina {page} van {totalPages}, {rows.length} producten in beeld.</p></div>
          <button type="submit" className="ps-button-danger min-h-[39px] px-4 py-2 text-[10px]">Verwijder geselecteerd</button>
        </div>

        <div className="ps-product-layout">
          <div className="space-y-4">
            {rows.length === 0 ? <div className="ps-panel px-6 py-16 text-center"><p className="text-[14px] font-black text-[#34495f]">Geen producten gevonden</p><p className="mt-2 text-[11px] font-semibold text-[#7b8999]">Pas je filters aan, voeg een product toe of importeer een bestand.</p><div className="mt-5 flex justify-center gap-2"><Link href="/import" className="ps-button-green">Importeren</Link><Link href="/producten/nieuw" className="primary-action">Product toevoegen</Link></div></div> : null}

            {rows.map((item) => {
              const competitorRows = visibleMatches(item.product).map((match) => {
                const offer = match.competitorOffer
                const price = numberValue(offer.normalizedPrice)
                const [latest, previous] = offer.priceHistory
                const latestPrice = latest ? numberValue(latest.normalizedPrice ?? latest.price) : price
                const previousPrice = previous ? numberValue(previous.normalizedPrice ?? previous.price) : null
                const delta = latestPrice !== null && previousPrice !== null ? latestPrice - previousPrice : null
                return { match, offer, price, delta }
              }).sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER))

              const numericPrices = [item.ownPrice, ...competitorRows.map((row) => row.price)].filter((value): value is number => value !== null)
              const lowestVisiblePrice = numericPrices.length ? Math.min(...numericPrices) : null
              const highestVisiblePrice = numericPrices.length ? Math.max(...numericPrices) : null
              const scaleWidth = (value: number | null) => {
                if (value === null || highestVisiblePrice === null || highestVisiblePrice <= 0) return 10
                return Math.max(10, Math.min(100, Math.round((value / highestVisiblePrice) * 100)))
              }
              const pctDiff = item.difference.pctDiff !== null && item.difference.pctDiff !== undefined ? Number(item.difference.pctDiff) : null
              const ownStock = item.product.stockStatus

              return <article key={item.product.id} className="ps-product-card">
                <div className="ps-product-card-header">
                  <div className="flex min-w-0 gap-3">
                    <input type="checkbox" name="productIds" value={item.product.id} aria-label={`Selecteer ${item.product.name}`} className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer rounded" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/producten/${item.product.id}`} className="text-[15px] font-black text-[#24384f] hover:text-[#2f7edb]">{item.product.name}</Link>
                        {item.reviewMatches > 0 ? <span className="ps-chip ps-chip-amber">Controle nodig</span> : null}
                      </div>
                      <div className="ps-product-meta">
                        <span className="ps-chip">Artikel {item.product.articleNumber}</span>
                        {item.product.ean || item.product.gtin ? <span className="ps-chip ps-chip-blue">EAN {item.product.ean ?? item.product.gtin}</span> : <Link href={`/producten/${item.product.id}`} className="ps-chip ps-chip-amber">EAN ontbreekt</Link>}
                        <span className="ps-chip">{item.product.productGroup.name}</span>
                        <span className="ps-chip">{sourceByProduct.get(item.product.id)?.join(', ') || 'Handmatig'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`/producten/${item.product.id}`} className="secondary-action min-h-[36px] px-3 py-2 text-[9px]">Beheren</Link>
                    <Link href={`/producten/${item.product.id}`} className="primary-action min-h-[36px] px-3 py-2 text-[9px]">Prijsregels</Link>
                  </div>
                </div>

                <div className="ps-price-strip">
                  <div className="ps-price-metric"><p>Eigen prijs</p><p>{formatCurrency(item.ownPrice, item.ownCurrency)}</p></div>
                  <div className="ps-price-metric"><p>Laagste markt</p><p>{formatCurrency(item.lowestPrice)}</p></div>
                  <div className="ps-price-metric"><p>Verschil</p><p className={pctDiff !== null && pctDiff > 0 ? 'text-[#b6414d]' : pctDiff !== null && pctDiff < 0 ? 'text-[#20814d]' : ''}>{pctDiff !== null ? `${formatNumber(pctDiff, 1)}%` : '—'}</p></div>
                  <div className="ps-price-metric"><p>Positie</p><p>{item.marketPosition}</p></div>
                </div>

                <div className="ps-competitor-wrap">
                  <table className="ps-competitor-table">
                    <thead><tr><th className="text-left">Winkel</th><th className="text-left">Prijs</th><th className="text-left">Wijziging</th><th className="text-left">Positie</th><th className="text-left">Voorraad</th><th className="text-left">Laatste update</th></tr></thead>
                    <tbody>
                      <tr className={item.ownPrice !== null && item.ownPrice === lowestVisiblePrice ? 'ps-best-row' : 'ps-own-row'}>
                        <td><div className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#2f7edb] text-[9px] font-black text-white">Jij</span><span className="font-black text-[#2d4057]">Eigen shop{selectedCountry ? `, ${selectedCountry.name}` : ''}</span></div></td>
                        <td className="font-black text-[#24384f]">{formatCurrency(item.ownPrice, item.ownCurrency)}</td>
                        <td>—</td>
                        <td><div className="ps-position-track"><span className="ps-position-fill" style={{ width: `${scaleWidth(item.ownPrice)}%` }} /></div></td>
                        <td><span className={`ps-chip ${ownStock ? (isOutOfStock(ownStock) ? 'ps-chip-red' : 'ps-chip-green') : ''}`}>{stockLabel(ownStock)}</span></td>
                        <td>{formatDate(item.selectedMarket?.updatedAt ?? item.product.updatedAt)}</td>
                      </tr>
                      {competitorRows.map(({ match, offer, price, delta }) => <tr key={match.id} className={price !== null && price === lowestVisiblePrice ? 'ps-best-row' : ''}>
                        <td><a href={offer.url} target="_blank" rel="noreferrer" className="font-black text-[#2b73c6]">{offer.competitor.name}</a><span className="ml-2 text-[9px] font-semibold text-[#8a98a9]">{offer.competitor.country.code}</span></td>
                        <td className="font-black text-[#24384f]">{formatCurrency(price, offer.currency)}</td>
                        <td><span className={`font-black ${delta !== null && delta > 0 ? 'text-[#b6414d]' : delta !== null && delta < 0 ? 'text-[#20814d]' : 'text-[#708095]'}`}>{delta === null || delta === 0 ? '—' : `${delta > 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(delta), offer.currency)}`}</span></td>
                        <td><div className="ps-position-track"><span className="ps-position-fill" style={{ width: `${scaleWidth(price)}%` }} /></div></td>
                        <td><span className={`ps-chip ${offer.stockStatus ? (isOutOfStock(offer.stockStatus) ? 'ps-chip-red' : 'ps-chip-green') : ''}`}>{stockLabel(offer.stockStatus)}</span></td>
                        <td>{offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Nog niet gemeten'}</td>
                      </tr>)}
                      {competitorRows.length === 0 ? <tr><td colSpan={6} className="py-5 text-center"><span className="font-semibold text-[#7b8999]">Nog geen gemeten concurrentprijs.</span> <Link href={`/producten/${item.product.id}`} className="ml-1 font-black text-[#2f7edb]">Concurrent URL beheren</Link></td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </article>
            })}
          </div>

          <aside className="ps-insight-card sticky top-[96px]">
            <div className="ps-insight-section">
              <div className="flex items-center justify-between"><h3 className="ps-insight-title">Prijswijzigingen</h3><span className="ps-chip ps-chip-blue">Deze pagina</span></div>
              <div className="ps-insight-row"><span>Gestegen</span><strong>{formatNumber(increasedOffers)} prijzen</strong></div>
              <div className="ps-insight-row"><span>Gedaald</span><strong>{formatNumber(decreasedOffers)} prijzen</strong></div>
              <Link href="/prijswijzigingen" className="mt-4 inline-flex text-[10px] font-black text-[#2f7edb]">Alle prijswijzigingen →</Link>
            </div>
            <div className="ps-insight-section">
              <h3 className="ps-insight-title">Voorraad</h3>
              <div className="ps-insight-row"><span>Concurrenten uit voorraad</span><strong>{formatNumber(outOfStockOffers)}</strong></div>
              <div className="ps-insight-row"><span>Producten zonder marktprijs</span><strong>{formatNumber(noPriceCount)}</strong></div>
            </div>
            <div className="ps-insight-section">
              <h3 className="ps-insight-title">Positie</h3>
              <div className="ps-insight-row"><span>Ik ben goedkoopst</span><strong>{formatNumber(lowestCount)}</strong></div>
              <div className="ps-insight-row"><span>Ik ben duurder</span><strong>{formatNumber(expensiveCount)}</strong></div>
              <div className="ps-insight-row"><span>Gelijk aan markt</span><strong>{formatNumber(equalCount)}</strong></div>
              <div className="mt-4 grid gap-2"><Link href="/productmatches" className="secondary-action min-h-[38px] text-[9px]">Matches controleren</Link><Link href="/concurrenten" className="primary-action min-h-[38px] text-[9px]">Concurrenten beheren</Link></div>
            </div>
          </aside>
        </div>
      </form>

      <div className="flex items-center justify-between rounded-[15px] bg-white px-4 py-3 text-[11px] font-bold text-[#607187] shadow-[0_8px_20px_rgba(31,48,70,.07)]">
        <p>Pagina {page} van {totalPages}</p>
        <div className="flex gap-2"><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.max(page - 1, 1)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Vorige</Link><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.min(page + 1, totalPages)) }).toString()}`} className="primary-action min-h-0 px-3 py-2">Volgende</Link></div>
      </div>
    </div>
  )
}
