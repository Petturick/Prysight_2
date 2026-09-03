export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, discoverCompetitorUrlsAction, runProductResearchAction } from '@/app/actions/productActions'
import { DataTable } from '@/components/DataTable'
import { PriceChart } from '@/components/PriceChart'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser()
  const { id } = await params
  const query = await searchParams
  const product = await prisma.product.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      productGroup: true,
      productMarkets: { include: { country: true }, orderBy: { country: { name: 'asc' } } },
      ownPriceHistory: { orderBy: { recordedAt: 'asc' } },
      matches: {
        include: {
          competitorOffer: {
            include: {
              competitor: { include: { country: true } },
              priceHistory: { orderBy: { recordedAt: 'asc' } },
              priceChecks: { orderBy: { checkedAt: 'desc' }, take: 5 },
            },
          },
        },
      },
    },
  })

  if (!product) notFound()
  const countries = await getActiveCompanyCountries(user.companyId)
  const defaultCountry = countries.find((country) => product.productMarkets.some((market) => market.countryId === country.id)) ?? countries.find((country) => country.code === 'NL') ?? countries[0]

  const chartData = product.ownPriceHistory.map((entry) => {
    const competitorPoints = product.matches
      .filter((match) => match.matchStatus === 'CERTAIN')
      .flatMap((match) => match.competitorOffer.priceHistory)
      .filter((history) => history.recordedAt.toDateString() === entry.recordedAt.toDateString())
      .map((history) => Number(history.normalizedPrice ?? history.price))
    return {
      date: entry.recordedAt.toLocaleDateString('nl-NL'),
      ownPrice: Number(entry.price),
      competitorPrice: competitorPoints.length ? Math.min(...competitorPoints) : null,
    }
  })

  const confirmedMatches = product.matches.filter((match) => match.matchStatus === 'CERTAIN')
  const reviewMatches = product.matches.filter((match) => match.matchStatus === 'REVIEW')
  const validPrices = confirmedMatches.map((match) => match.competitorOffer.normalizedPrice).filter((price): price is NonNullable<typeof price> => price !== null).map(Number)
  const lowestPrice = validPrices.length ? Math.min(...validPrices) : null
  const averagePrice = validPrices.length ? validPrices.reduce((sum, value) => sum + value, 0) / validPrices.length : null
  const latestCheck = confirmedMatches.map((match) => match.competitorOffer.lastCheckedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const ownPrice = product.ownPrice ? Number(product.ownPrice) : null
  const difference = ownPrice !== null && lowestPrice !== null ? ownPrice - lowestPrice : null
  const controlMessage = readParam(query.controle)
  const discovered = Number(readParam(query.suggesties) ?? '0') || 0
  const found = Number(readParam(query.gevonden) ?? '0') || 0

  return (
    <div className="space-y-5">
      {(readParam(query.toegevoegd) || readParam(query.bron) || controlMessage || readParam(query.suggesties)) ? (
        <div className="rounded-[12px] border-2 border-[#8bc9a7] bg-[#e3f4ea] px-4 py-3 text-[11px] font-semibold text-[#075d38]">
          {readParam(query.toegevoegd)
            ? `Product toegevoegd. ${discovered > 0 ? `${discovered} EAN suggesties zijn automatisch gevonden en staan klaar voor controle.` : product.ean ? 'EAN onderzoek is uitgevoerd, er zijn nog geen betrouwbare nieuwe suggesties gevonden.' : 'Voeg een EAN toe om automatisch concurrent URLs te laten zoeken.'}`
            : readParam(query.bron)
              ? 'Concurrent URL gekoppeld. Je kunt de prijs nu direct controleren.'
              : controlMessage
                ? `Prijscontrole afgerond. Resultaat succesvol en mislukt: ${controlMessage}.`
                : `${discovered} nieuwe suggesties opgeslagen uit ${found} bruikbare EAN zoekresultaten.`}
        </div>
      ) : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Productonderzoek</p><span className="rounded-full bg-[#e4e8f0] px-2.5 py-1 text-[9px] font-black text-[#4b5870]">{product.articleNumber}</span>{product.ean ? <span className="rounded-full bg-[#e4dcff] px-2.5 py-1 text-[9px] font-black text-[#4320b8]">EAN {product.ean}</span> : null}</div>
            <h1 className="mt-2 text-[29px] font-black tracking-[-0.035em] text-[#161a26]">{product.name}</h1>
            <p className="mt-2 text-[12px] font-medium text-[#697386]">{product.productGroup.name} · {product.packagingQty} {product.packagingUnit ?? 'stuks'} · {product.stockStatus ?? 'Voorraad onbekend'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/producten" className="secondary-action">Terug naar producten</Link>
            <form action={runProductResearchAction}><input type="hidden" name="productId" value={product.id} /><button type="submit" disabled={confirmedMatches.length === 0} className="primary-action disabled:cursor-not-allowed disabled:opacity-45">Prijzen nu controleren</button></form>
          </div>
        </div>
        <div className="grid border-t-2 border-[var(--border-strong)] sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#697386]">Eigen prijs</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatCurrency(product.ownPrice, product.currency)}</p></div>
          <div className="border-y-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-y-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#697386]">Laagste marktprijs</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatCurrency(lowestPrice)}</p></div>
          <div className="px-5 py-4 sm:border-l-2 sm:border-[var(--border-strong)]"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#697386]">Bevestigde bronnen</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatNumber(confirmedMatches.length)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#697386]">Verschil met laagste</p><p className={`mt-1 text-[22px] font-black ${difference !== null && difference > 0 ? 'text-[var(--amber)]' : 'text-[var(--green)]'}`}>{difference === null ? '—' : `${difference >= 0 ? '+' : ''}${formatCurrency(difference)}`}</p></div>
        </div>
      </section>

      <section className={`rounded-[16px] border-2 p-5 shadow-[0_10px_24px_rgba(20,31,55,.10)] ${reviewMatches.length ? 'border-[#5b2be8] bg-[#f0edff]' : 'border-[#b8c0cf] bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[.09em] text-[#4320b8]">EAN concurrent discovery</p><span className="rounded-full bg-[#5b2be8] px-2.5 py-1 text-[9px] font-black text-white">{reviewMatches.length} suggesties</span></div>
            <h2 className="mt-2 text-[18px] font-black text-[#182238]">Laat Prysight concurrent URLs vinden op basis van EAN</h2>
            <p className="mt-1 text-[11px] font-medium leading-5 text-[#59667d]">Prysight zoekt alleen echte webresultaten, verwijdert eigen en onbruikbare domeinen en zet gevonden kandidaten eerst op Review. Suggesties tellen pas mee in prijsvergelijkingen nadat ze zijn bevestigd.</p>
          </div>
          {product.ean && defaultCountry ? (
            <form action={discoverCompetitorUrlsAction} className="flex shrink-0 items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <select name="countryId" defaultValue={defaultCountry.id} className="toolbar-control min-w-[150px]">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <button type="submit" className="primary-action">EAN suggesties ophalen</button>
            </form>
          ) : <div className="rounded-[10px] border-2 border-[#d6b45b] bg-[#fff4d5] px-4 py-3 text-[11px] font-bold text-[#805000]">{product.ean ? 'Geen actieve markt beschikbaar.' : 'EAN ontbreekt bij dit product.'}</div>}
        </div>
        {reviewMatches.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{reviewMatches.map((match) => <a key={match.id} href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="rounded-[12px] border-2 border-[#c3b7f7] bg-white p-3 transition hover:border-[#5b2be8]"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black text-[#253149]">{match.competitorOffer.competitor.name}</p><p className="mt-1 max-w-[260px] truncate text-[9px] font-medium text-[#697386]">{match.competitorOffer.url}</p></div><span className="rounded-full bg-[#e4dcff] px-2 py-1 text-[9px] font-black text-[#4320b8]">{formatNumber(match.confidenceScore)}%</span></div><p className="mt-2 text-[10px] font-bold text-[#2457d6]">Open kandidaat URL</p></a>)}</div> : null}
        {reviewMatches.length ? <div className="mt-4 flex justify-end"><Link href="/productmatches" className="secondary-action">Suggesties beoordelen</Link></div> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-black text-[#252a37]">Concurrent product URL toevoegen</h2><p className="mt-1 text-[11px] leading-5 text-[#697386]">Gebruik dit alleen wanneer de EAN suggesties geen goede bron vinden.</p></div><span className="rounded-full bg-[var(--blue-soft)] px-2.5 py-1 text-[9px] font-black text-[var(--blue)]">Handmatig</span></div>
          <form action={addCompetitorOfferAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="productId" value={product.id} />
            <label className="text-[10px] font-bold text-[#4f5869]">Concurrent *<input required name="competitorName" className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld Manutan" /></label>
            <label className="text-[10px] font-bold text-[#4f5869]">Land *<select required name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label className="text-[10px] font-bold text-[#4f5869] md:col-span-2">Exacte product URL *<input required type="url" name="offerUrl" className="toolbar-control mt-1.5 w-full" placeholder="https://concurrent.nl/product/..." /></label>
            <div className="md:col-span-2 flex justify-end"><button type="submit" className="primary-action">Concurrent URL koppelen</button></div>
          </form>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-[14px] font-black text-[#252a37]">Markten</h2>
          <p className="mt-1 text-[11px] text-[#697386]">Eigen prijs en URL kunnen per land uit een feed, Syntrx of handmatige invoer komen.</p>
          <div className="mt-4 space-y-2">{product.productMarkets.length === 0 ? <p className="rounded-[12px] bg-[#eef1f7] px-3 py-4 text-[10px] text-[#697386]">Nog geen landspecifieke productdata.</p> : product.productMarkets.map((market) => <div key={market.id} className="flex items-center justify-between gap-3 rounded-[11px] border-2 border-[#d8dde7] bg-[#f4f6fa] px-3 py-3"><div><p className="text-[11px] font-black text-[#303647]">{market.country.name}</p><p className="mt-0.5 text-[9px] text-[#697386]">{market.stockStatus ?? 'Voorraad onbekend'}</p></div><div className="text-right"><p className="text-[11px] font-black text-[#303647]">{formatCurrency(market.ownPrice, market.currency)}</p>{market.ownUrl ? <a href={market.ownUrl} target="_blank" rel="noreferrer" className="mt-0.5 block text-[9px] font-black text-[var(--blue)]">Open webshop</a> : null}</div></div>)}</div>
        </div>
      </section>

      <PriceChart data={chartData} />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1"><div><h2 className="text-[14px] font-black text-[#252a37]">Bevestigde concurrentieprijzen</h2><p className="mt-1 text-[10px] text-[#697386]">{confirmedMatches.length} bevestigde bron{confirmedMatches.length === 1 ? '' : 'nen'}, laatste controle {formatDate(latestCheck)}.</p></div></div>
        <DataTable
          emptyText="Nog geen bevestigde concurrent URLs. Gebruik EAN discovery of voeg handmatig een bron toe."
          columns={[
            { key: 'concurrent', header: 'Concurrent' }, { key: 'land', header: 'Land' }, { key: 'prijs', header: 'Prijs' }, { key: 'genormaliseerd', header: 'Genormaliseerd' }, { key: 'score', header: 'Score' }, { key: 'voorraad', header: 'Voorraad' }, { key: 'laatsteControle', header: 'Laatste controle' }, { key: 'bron', header: 'Bron' },
          ]}
          rows={confirmedMatches.map((match) => ({
            concurrent: match.competitorOffer.competitor.name,
            land: match.competitorOffer.competitor.country.name,
            prijs: formatCurrency(match.competitorOffer.rawPrice, match.competitorOffer.currency),
            genormaliseerd: formatCurrency(match.competitorOffer.normalizedPrice),
            score: `${formatNumber(match.confidenceScore)} / 100`,
            voorraad: match.competitorOffer.stockStatus ?? '—',
            laatsteControle: formatDate(match.competitorOffer.lastCheckedAt),
            bron: <a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="font-black text-[var(--blue)]">Open URL</a>,
          }))}
        />
      </section>

      <section className="space-y-3">
        <div className="px-1"><h2 className="text-[14px] font-black text-[#252a37]">Controlehistorie</h2><p className="mt-1 text-[10px] text-[#697386]">Technische resultaten van de laatste prijscontroles per bevestigde bron.</p></div>
        <DataTable
          columns={[
            { key: 'tijd', header: 'Controlemoment' }, { key: 'concurrent', header: 'Concurrent' }, { key: 'methode', header: 'Methode' }, { key: 'status', header: 'Status' }, { key: 'prijs', header: 'Prijs' }, { key: 'melding', header: 'Melding' },
          ]}
          rows={confirmedMatches.flatMap((match) =>
            match.competitorOffer.priceChecks.map((check) => ({
              tijd: formatDate(check.checkedAt),
              concurrent: match.competitorOffer.competitor.name,
              methode: check.checkMethod,
              status: check.isSuccess ? 'Succes' : `Fout ${check.statusCode ?? '—'}`,
              prijs: formatCurrency(check.foundPrice, check.currency),
              melding: check.errorMessage ?? '—',
            })),
          )}
        />
      </section>
    </div>
  )
}
