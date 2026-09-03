export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { deriveProductMetrics, getFilterOptions } from '@/lib/dashboard'
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

  const where = {
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
        { productMarkets: { some: { countryId: filters.countryId, isActive: true } } },
        { matches: { some: { competitorOffer: { competitor: { countryId: filters.countryId } } } } },
      ] } : {},
    ],
  }

  const result = await safeDatabaseQuery(async () => {
    const [products, totalCount, filterOptions] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          productGroup: true,
          productMarkets: { include: { country: true } },
          ownPriceHistory: { orderBy: { recordedAt: 'desc' }, take: 1 },
          matches: { include: { competitorOffer: { include: {
            competitor: { include: { country: true } },
            priceHistory: { orderBy: { recordedAt: 'desc' }, take: 2 },
            priceChecks: { orderBy: { checkedAt: 'desc' }, take: 2 },
          } } } },
        },
        orderBy: [{ productGroup: { name: 'asc' } }, { articleNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
      getFilterOptions(),
    ])
    return { products, totalCount, filterOptions }
  }, { products: [], totalCount: 0, filterOptions: { countries: [], productGroups: [], competitors: [] } })

  const { products, totalCount, filterOptions } = result.data
  const rows = products.map((product) => deriveProductMetrics(product, filters))
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1)

  const sourceResult = await safeDatabaseQuery(() => prisma.productFeedLink.findMany({
    where: { productId: { in: rows.map((item) => item.product.id) } },
    include: { feedSource: true },
    orderBy: { lastSeenAt: 'desc' },
  }), [])
  const sourceByProduct = new Map<string, string[]>()
  for (const link of sourceResult.data) {
    const current = sourceByProduct.get(link.productId) ?? []
    if (!current.includes(link.feedSource.name)) current.push(link.feedSource.name)
    sourceByProduct.set(link.productId, current)
  }

  const selectedCountry = filterOptions.countries.find((country) => country.id === filters.countryId)
  const comparableCount = rows.filter((item) => item.lowestPrice !== null && item.ownPrice !== null).length
  const coverage = rows.length ? Math.round((comparableCount / rows.length) * 100) : 0
  const expensiveCount = rows.filter((item) => item.marketPosition === 'Engels duurder').length
  const attentionCount = rows.filter((item) => item.reviewMatches > 0 || item.lowestPrice === null).length

  const paginationParams = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)).map(([key, value]) => [key === 'productGroupId' ? 'productgroep' : key === 'countryId' ? 'land' : key === 'competitorId' ? 'concurrent' : key, value as string]))

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2">Producten</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#4b5870]">Vind direct producten zonder marktprijs, producten boven de markt en records die handmatige controle vragen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className="secondary-action">Bulk importeren</Link>
            <Link href="/producten/nieuw" className="primary-action">Product toevoegen</Link>
          </div>
        </div>
        <div className="grid border-t-2 border-[var(--border-strong)] sm:grid-cols-4">
          <div className="bg-[#111827] px-5 py-4 text-white sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#cbd5e1]">Producten</p><p className="mt-1 text-[27px] font-black">{formatNumber(totalCount)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Prijsdekking</p><p className="mt-1 text-[27px] font-black text-[#111827]">{coverage}%</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Boven markt</p><p className={`mt-1 text-[27px] font-black ${expensiveCount ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{formatNumber(expensiveCount)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Aandacht</p><p className={`mt-1 text-[27px] font-black ${attentionCount ? 'text-[#9a5b00]' : 'text-[#0d7a49]'}`}>{formatNumber(attentionCount)}</p></div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/productmatches" className={`rounded-[14px] border-2 p-4 ${attentionCount ? 'border-[#9a5b00] bg-[#f8e4bd]' : 'border-[#0d7a49] bg-[#d9f0e4]'}`}><p className="text-[10px] font-black uppercase tracking-[0.08em]">Matchcontrole</p><h2 className="mt-1 text-[15px] font-black text-[#111827]">{formatNumber(attentionCount)} producten vragen aandacht</h2><p className="mt-1 text-[11px] font-semibold text-[#4b5870]">Controleer ontbrekende marktprijzen en open matches.</p></Link>
        <Link href="/feeds" className="rounded-[14px] border-2 border-[#2457d6] bg-[#dfe8ff] p-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#1b43a6]">Databronnen</p><h2 className="mt-1 text-[15px] font-black text-[#111827]">Feeds en productdata beheren</h2><p className="mt-1 text-[11px] font-semibold text-[#4b5870]">Ga naar de bron wanneer productdata of eigen prijzen ontbreken.</p></Link>
        <Link href="/concurrenten" className="rounded-[14px] border-2 border-[#5b2be8] bg-[#e4dcff] p-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#4320b8]">Concurrentdekking</p><h2 className="mt-1 text-[15px] font-black text-[#111827]">Concurrent URLs en frequentie</h2><p className="mt-1 text-[11px] font-semibold text-[#4b5870]">Beheer meetbare URLs en controleplanning.</p></Link>
      </section>

      <form className="strong-panel p-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-[14px] font-black text-[#111827]">Filter productonderzoek</h2><p className="mt-1 text-[10px] font-semibold text-[#6f7b91]">Filter eerst op markt, daarna op productgroep of concurrent voor een zuivere vergelijking.</p></div>{(filters.q || filters.productGroupId || filters.countryId || filters.competitorId) ? <Link href="/producten" className="secondary-action min-h-0 px-3 py-2 text-[10px]">Filters wissen</Link> : null}</div>
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Zoek op artikel, EAN, GTIN of productnaam" className="toolbar-control w-full" />
          <select name="productgroep" defaultValue={filters.productGroupId} className="toolbar-control w-full"><option value="">Alle productgroepen</option>{filterOptions.productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <select name="land" defaultValue={filters.countryId} className="toolbar-control w-full"><option value="">Alle landen</option>{filterOptions.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
          <select name="concurrent" defaultValue={filters.competitorId} className="toolbar-control w-full"><option value="">Alle concurrenten</option>{filterOptions.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}</select>
          <button className="primary-action min-w-[112px]">Toepassen</button>
        </div>
        <p className="mt-3 text-[10px] font-semibold text-[#6f7b91]">{selectedCountry ? `Actief voor ${selectedCountry.name}, eigen marktprijzen en concurrenten zijn op dit land gefilterd.` : 'Alle markten gecombineerd, kies een land voor lokale prijsvergelijking.'}</p>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1"><div><h2 className="text-[15px] font-black text-[#111827]">Prijsvergelijking</h2><p className="mt-1 text-[11px] font-semibold text-[#647087]">EAN of GTIN uit de feed staat direct naast het artikelnummer, prijsverschil en marktpositie blijven centraal staan.</p></div></div>
        <DataTable
          emptyText="Nog geen producten in deze selectie. Voeg een product toe of koppel een feed."
          columns={[
            { key: 'artikelnummer', header: 'Artikel' }, { key: 'ean', header: 'EAN / GTIN' }, { key: 'productnaam', header: 'Product' }, { key: 'eigenPrijs', header: 'Eigen prijs' }, { key: 'laagste', header: 'Laagste markt' }, { key: 'verschilPct', header: 'Verschil %' }, { key: 'positie', header: 'Positie' }, { key: 'aantalConcurrenten', header: 'Bronnen' }, { key: 'laatsteControle', header: 'Controle' }, { key: 'groep', header: 'Groep' }, { key: 'bron', header: 'Databron' },
          ]}
          rows={rows.map((item) => ({
            artikelnummer: <Link href={`/producten/${item.product.id}`} className="font-black text-[var(--blue)]">{item.product.articleNumber}</Link>,
            ean: item.product.ean || item.product.gtin ? <span className="whitespace-nowrap font-mono text-[11px] font-black text-[#27364f]">{item.product.ean ?? item.product.gtin}</span> : <span className="text-[10px] font-bold text-[#9a5b00]">Niet aangeleverd</span>,
            productnaam: <Link href={`/producten/${item.product.id}`} className="font-bold text-[#111827]">{item.product.name}</Link>,
            eigenPrijs: <span className="font-black text-[#111827]">{formatCurrency(item.ownPrice, item.ownCurrency)}</span>,
            laagste: formatCurrency(item.lowestPrice),
            verschilPct: item.difference.pctDiff ? <span className={`font-black ${Number(item.difference.pctDiff) > 0 ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{formatNumber(Number(item.difference.pctDiff), 1)}%</span> : '—',
            positie: <span className={`inline-flex rounded-[7px] px-2.5 py-1 text-[9px] font-black ${item.marketPosition === 'Engels laagste' ? 'bg-[#0d7a49] text-white' : item.marketPosition === 'Engels duurder' ? 'bg-[#b4233d] text-white' : item.marketPosition === 'Geen concurrentieprijs' ? 'bg-[#dfe4ee] text-[#334155]' : 'bg-[#2457d6] text-white'}`}>{item.marketPosition}</span>,
            aantalConcurrenten: formatNumber(item.offerCount),
            laatsteControle: formatDate(item.lastCheckedAt),
            groep: item.product.productGroup.name,
            bron: sourceByProduct.get(item.product.id)?.join(', ') ?? 'Handmatig',
          }))}
        />
      </section>

      <div className="flex items-center justify-between rounded-[14px] border-2 border-[var(--border)] bg-white px-4 py-3 text-[11px] font-bold text-[#4b5870]">
        <p>Pagina {page} van {totalPages}</p>
        <div className="flex gap-2"><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.max(page - 1, 1)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Vorige</Link><Link href={`?${new URLSearchParams({ ...paginationParams, pagina: String(Math.min(page + 1, totalPages)) }).toString()}`} className="secondary-action min-h-0 px-3 py-2">Volgende</Link></div>
      </div>
    </div>
  )
}
