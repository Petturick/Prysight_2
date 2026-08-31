export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { deriveProductMetrics, getFilterOptions, getFilteredProducts } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ProductenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const filters = {
    q: readParam(params.q),
    productGroupId: readParam(params.productgroep),
    countryId: readParam(params.land),
    competitorId: readParam(params.concurrent),
  }
  const page = Math.max(Number(readParam(params.pagina) ?? '1') || 1, 1)
  const pageSize = 12

  const result = await safeDatabaseQuery(
    async () => {
      const [products, filterOptions] = await Promise.all([getFilteredProducts(filters), getFilterOptions()])
      return { products, filterOptions }
    },
    { products: [], filterOptions: { countries: [], productGroups: [], competitors: [] } },
  )
  const { products, filterOptions } = result.data
  const rows = products.map((product) => deriveProductMetrics(product, filters))
  const paged = rows.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.max(Math.ceil(rows.length / pageSize), 1)
  const sourceResult = await safeDatabaseQuery(
    () => prisma.productFeedLink.findMany({
      where: { productId: { in: paged.map((item) => item.product.id) } },
      include: { feedSource: true },
      orderBy: { lastSeenAt: 'desc' },
    }),
    [],
  )
  const sourceByProduct = new Map<string, string[]>()
  for (const link of sourceResult.data) {
    const current = sourceByProduct.get(link.productId) ?? []
    if (!current.includes(link.feedSource.name)) current.push(link.feedSource.name)
    sourceByProduct.set(link.productId, current)
  }

  const selectedCountry = filterOptions.countries.find((country) => country.id === filters.countryId)
  const comparableCount = rows.filter((item) => item.lowestPrice !== null && item.ownPrice !== null).length
  const coverage = rows.length ? Math.round((comparableCount / rows.length) * 100) : 0
  const attentionCount = rows.filter((item) => item.reviewMatches > 0 || item.lowestPrice === null).length

  const paginationParams = Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => [key === 'productGroupId' ? 'productgroep' : key === 'countryId' ? 'land' : key === 'competitorId' ? 'concurrent' : key, value as string]),
  )

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Productonderzoek</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Vergelijk eigen prijzen met actuele concurrentieprijzen, per product, markt en databron.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/feeds" className="secondary-action">Feeds beheren</Link>
            <Link href="/producten/nieuw" className="primary-action"><span className="text-base leading-none">+</span> Product toevoegen</Link>
          </div>
        </div>
        <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Producten in selectie</p><p className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#202536]">{formatNumber(rows.length)}</p></div>
          <div className="border-y border-[var(--border)] px-5 py-4 sm:border-x sm:border-y-0 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Prijsdekking</p><div className="mt-1 flex items-end gap-2"><p className="text-[23px] font-semibold tracking-[-0.03em] text-[#202536]">{coverage}%</p><p className="pb-1 text-[10px] text-[#8a93a5]">{formatNumber(comparableCount)} vergelijkbaar</p></div></div>
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Aandacht nodig</p><p className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#202536]">{formatNumber(attentionCount)}</p></div>
        </div>
      </section>

      <form className="strong-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Zoek op artikel, EAN of productnaam" className="toolbar-control w-full" />
          <select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control w-full"><option value="">Alle productgroepen</option>{filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <select name="land" defaultValue={filters.countryId} className="toolbar-control w-full"><option value="">Alle landen</option>{filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
          <select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control w-full"><option value="">Alle concurrenten</option>{filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select>
          <button className="primary-action min-w-[112px]">Toepassen</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8790a2]">
          <p>{selectedCountry ? `Onderzoek actief voor ${selectedCountry.name}. Eigen marktprijzen en concurrenten worden op dit land gefilterd.` : 'Alle markten worden gecombineerd. Kies een land voor een zuivere lokale prijsvergelijking.'}</p>
          {(filters.q || filters.productGroupId || filters.countryId || filters.competitorId) ? <Link href="/producten" className="font-semibold text-[var(--blue)]">Filters wissen</Link> : null}
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div><h2 className="text-[14px] font-semibold text-[#252a37]">Prijsvergelijking</h2><p className="mt-1 text-[10px] text-[#8a93a5]">Open een product voor prijsverloop, gekoppelde concurrent URLs en handmatige prijscontroles.</p></div>
          <Link href="/productmatches" className="text-[11px] font-semibold text-[var(--blue)]">Productmatches controleren</Link>
        </div>
        <DataTable
          emptyText="Nog geen producten in deze selectie. Voeg een product toe of koppel een feed."
          columns={[
            { key: 'artikelnummer', header: 'Artikel' }, { key: 'productnaam', header: 'Product' }, { key: 'groep', header: 'Groep' }, { key: 'bron', header: 'Bron' }, { key: 'eigenPrijs', header: 'Eigen prijs' }, { key: 'laagste', header: 'Laagste marktprijs' }, { key: 'gemiddeld', header: 'Gem. marktprijs' }, { key: 'verschilEuro', header: 'Verschil €' }, { key: 'verschilPct', header: 'Verschil %' }, { key: 'positie', header: 'Positie' }, { key: 'aantalConcurrenten', header: 'Bronnen' }, { key: 'laatsteControle', header: 'Controle' },
          ]}
          rows={paged.map((item) => ({
            artikelnummer: <Link href={`/producten/${item.product.id}`} className="font-semibold text-[var(--blue)]">{item.product.articleNumber}</Link>,
            productnaam: <Link href={`/producten/${item.product.id}`} className="font-medium text-[#252a37]">{item.product.name}</Link>,
            groep: item.product.productGroup.name,
            bron: sourceByProduct.get(item.product.id)?.join(', ') ?? 'Handmatig',
            eigenPrijs: formatCurrency(item.ownPrice, item.ownCurrency),
            laagste: formatCurrency(item.lowestPrice),
            gemiddeld: formatCurrency(item.averagePrice),
            verschilEuro: formatCurrency(item.difference.diff),
            verschilPct: item.difference.pctDiff ? `${formatNumber(Number(item.difference.pctDiff), 1)}%` : '—',
            positie: <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.marketPosition === 'Engels laagste' ? 'bg-[var(--green-soft)] text-[var(--green)]' : item.marketPosition === 'Engels duurder' ? 'bg-[var(--amber-soft)] text-[var(--amber)]' : item.marketPosition === 'Geen concurrentieprijs' ? 'bg-[#f1f3f6] text-[#717b8e]' : 'bg-[var(--blue-soft)] text-[var(--blue)]'}`}>{item.marketPosition}</span>,
            aantalConcurrenten: formatNumber(item.offerCount),
            laatsteControle: formatDate(item.lastCheckedAt),
          }))}
        />
      </section>

      <div className="flex items-center justify-between rounded-[14px] bg-white px-4 py-3 text-[11px] font-medium text-[#697386] shadow-[0_1px_2px_rgba(20,29,48,0.05)]">
        <p>Pagina {page} van {totalPages}</p>
        <div className="flex gap-2">
          <Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.max(page - 1, 1)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Vorige</Link>
          <Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.min(page + 1, totalPages)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Volgende</Link>
        </div>
      </div>
    </div>
  )
}
