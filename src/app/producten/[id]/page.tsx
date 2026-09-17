export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, discoverCompetitorUrlsAction, runProductResearchAction } from '@/app/actions/productActions'
import { ProductCheckHistoryPanel } from '@/components/ProductCheckHistoryPanel'
import { ProductPriceHistoryPanel } from '@/components/ProductPriceHistoryPanel'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function numberValue(value: unknown) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function isStalePriceSource(value: Date | null | undefined, hours = 72) {
  if (!value) return true
  return Date.now() - value.getTime() > hours * 60 * 60 * 1000
}

function AnalyticsFallback({ label }: { label: string }) {
  return (
    <section className="surface-card p-5" aria-busy="true">
      <div className="h-4 w-36 animate-pulse rounded bg-[#e5ebf0]" />
      <div className="mt-4 h-56 animate-pulse rounded-[10px] bg-[#f1f5f9]" />
      <p className="mt-3 text-[12px] text-[#8aa0b4]">{label} wordt geladen zonder de productpagina te blokkeren.</p>
    </section>
  )
}

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser()
  const { id } = await params
  const query = await searchParams

  const [product, countries] = await Promise.all([
    prisma.product.findFirst({
      relationLoadStrategy: 'join',
      where: { id, companyId: user.companyId },
      include: {
        productGroup: true,
        productMarkets: { include: { country: true }, orderBy: { country: { name: 'asc' } } },
        matches: {
          include: {
            competitorOffer: {
              include: {
                competitor: { include: { country: true } },
                priceHistory: { where: { companyId: user.companyId }, orderBy: { recordedAt: 'desc' }, take: 3 },
                priceChecks: { where: { companyId: user.companyId }, orderBy: { checkedAt: 'desc' }, take: 3 },
              },
            },
          },
        },
      },
    }),
    getActiveCompanyCountries(user.companyId),
  ])

  if (!product) notFound()

  const defaultCountry = countries.find((country) => product.productMarkets.some((market) => market.countryId === country.id)) ?? countries.find((country) => country.code === 'NL') ?? countries[0]
  const confirmedMatches = product.matches.filter((match) => match.matchStatus === 'CERTAIN' && match.competitorOffer.isActive)
  const reviewMatches = product.matches.filter((match) => match.matchStatus === 'REVIEW' && match.competitorOffer.isActive)
  const pricedMatches = confirmedMatches.filter((match) => numberValue(match.competitorOffer.normalizedPrice) !== null)
    .sort((a, b) => Number(a.competitorOffer.normalizedPrice) - Number(b.competitorOffer.normalizedPrice))

  const prices = pricedMatches.map((match) => Number(match.competitorOffer.normalizedPrice))
  const lowestPrice = prices.length ? Math.min(...prices) : null
  const highestPrice = prices.length ? Math.max(...prices) : null
  const averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null
  const spread = lowestPrice !== null && highestPrice !== null ? highestPrice - lowestPrice : null
  const spreadPct = lowestPrice !== null && lowestPrice > 0 && spread !== null ? (spread / lowestPrice) * 100 : null
  const latestCheck = confirmedMatches.map((match) => match.competitorOffer.lastCheckedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const ownPrice = product.ownPrice ? Number(product.ownPrice) : null
  const difference = ownPrice !== null && lowestPrice !== null ? ownPrice - lowestPrice : null
  const differencePct = ownPrice !== null && lowestPrice !== null && lowestPrice > 0 ? ((ownPrice - lowestPrice) / lowestPrice) * 100 : null
  const averageDifferencePct = ownPrice !== null && averagePrice !== null && averagePrice > 0 ? ((ownPrice - averagePrice) / averagePrice) * 100 : null
  const staleSources = confirmedMatches.filter((match) => isStalePriceSource(match.competitorOffer.lastCheckedAt)).length
  const failedLatestChecks = confirmedMatches.filter((match) => match.competitorOffer.priceChecks[0] && !match.competitorOffer.priceChecks[0].isSuccess).length
  const lowestMatch = pricedMatches[0] ?? null
  const highestMatch = pricedMatches[pricedMatches.length - 1] ?? null

  const controlMessage = readParam(query.controle)
  const discovered = Number(readParam(query.suggesties) ?? '0') || 0
  const found = Number(readParam(query.gevonden) ?? '0') || 0

  return (
    <div className="space-y-5">
      {(readParam(query.toegevoegd) || readParam(query.bron) || controlMessage || readParam(query.suggesties)) ? (
        <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e3f4ea] px-4 py-3 text-[11px] font-semibold text-[#075d38]">
          {readParam(query.toegevoegd)
            ? `Product toegevoegd. ${discovered > 0 ? `${discovered} EAN suggesties zijn automatisch gevonden en staan klaar voor controle.` : product.ean ? 'EAN onderzoek is uitgevoerd, er zijn nog geen betrouwbare nieuwe suggesties gevonden.' : 'Voeg een EAN toe om automatisch concurrent URLs te laten zoeken.'}`
            : readParam(query.bron)
              ? 'Concurrent URL gekoppeld. Je kunt de prijs nu direct ophalen.'
              : controlMessage
                ? `Prijscontrole afgerond. Succesvol en mislukt, ${controlMessage}.`
                : `${discovered} nieuwe suggesties opgeslagen uit ${found} bruikbare EAN zoekresultaten.`}
        </div>
      ) : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">Prijsanalyse</p>
              <span className="rounded-full bg-[#e4e8f0] px-2.5 py-1 text-[9px] font-black text-[#4b5870]">{product.articleNumber}</span>
              {product.ean ? <span className="rounded-full bg-[#e4dcff] px-2.5 py-1 text-[9px] font-black text-[#4320b8]">EAN {product.ean}</span> : null}
              {staleSources > 0 ? <span className="ps-chip ps-chip-amber">{staleSources} bron{staleSources === 1 ? '' : 'nen'} vernieuwen</span> : confirmedMatches.length > 0 ? <span className="ps-chip ps-chip-green">Prijsdata actueel</span> : null}
            </div>
            <h1 className="mt-2 text-[29px] font-black tracking-[-0.035em] text-[#161a26]">{product.name}</h1>
            <p className="mt-2 text-[12px] font-medium text-[#697386]">{product.productGroup.name} · {product.packagingQty} {product.packagingUnit ?? 'stuks'} · {product.stockStatus ?? 'Voorraad onbekend'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/producten" className="secondary-action">Terug naar producten</Link>
            <form action={runProductResearchAction}><input type="hidden" name="productId" value={product.id} /><button type="submit" disabled={confirmedMatches.length === 0} className="primary-action disabled:cursor-not-allowed disabled:opacity-45">Prijzen nu ophalen</button></form>
          </div>
        </div>

        <div className="grid border-t border-[#e5eaf0] sm:grid-cols-2 xl:grid-cols-6">
          <div className="px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#697386]">Eigen prijs</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatCurrency(product.ownPrice, product.currency)}</p></div>
          <div className="px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#697386]">Laagste markt</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatCurrency(lowestPrice)}</p><p className="mt-1 truncate text-[9px] font-semibold text-[#7e8b9b]">{lowestMatch?.competitorOffer.competitor.name ?? 'Geen prijsbron'}</p></div>
          <div className="px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#697386]">Gemiddelde markt</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatCurrency(averagePrice)}</p></div>
          <div className="px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#697386]">Hoogste markt</p><p className="mt-1 text-[22px] font-black text-[#202536]">{formatCurrency(highestPrice)}</p><p className="mt-1 truncate text-[9px] font-semibold text-[#7e8b9b]">{highestMatch?.competitorOffer.competitor.name ?? 'Geen prijsbron'}</p></div>
          <div className="px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#697386]">Vs. laagste</p><p className={`mt-1 text-[22px] font-black ${difference !== null && difference > 0 ? 'text-[#b6414d]' : difference !== null && difference < 0 ? 'text-[#20814d]' : 'text-[#202536]'}`}>{differencePct === null ? '—' : `${differencePct > 0 ? '+' : ''}${formatNumber(differencePct, 1)}%`}</p></div>
          <div className="px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#697386]">Laatste crawl</p><p className="mt-1 text-[15px] font-black text-[#202536]">{latestCheck ? formatDate(latestCheck) : 'Nog niet gemeten'}</p><p className="mt-1 text-[9px] font-semibold text-[#7e8b9b]">{confirmedMatches.length} bevestigde bron{confirmedMatches.length === 1 ? '' : 'nen'}</p></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="ps-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[16px] font-black text-[#24384f]">Concurrentieprijzen</h2>
              <p className="mt-1 text-[10px] font-semibold text-[#748296]">Volledige actuele prijsvergelijking. Klik op een bron om de gemeten productpagina te openen.</p>
            </div>
            <span className="ps-chip ps-chip-blue">{pricedMatches.length} gemeten</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[10px]">
              <thead className="bg-[#f6f8fb] text-left text-[9px] font-black uppercase tracking-[.06em] text-[#758396]"><tr><th className="px-4 py-3">Concurrent</th><th className="px-4 py-3">Prijs</th><th className="px-4 py-3">Vs. eigen</th><th className="px-4 py-3">Wijziging</th><th className="px-4 py-3">Voorraad</th><th className="px-4 py-3">Laatste crawl</th><th className="px-4 py-3">Controle</th><th className="px-4 py-3">Bron</th></tr></thead>
              <tbody>
                {pricedMatches.map((match, index) => {
                  const offer = match.competitorOffer
                  const price = numberValue(offer.normalizedPrice)
                  const ownDeltaPct = ownPrice !== null && price !== null && ownPrice > 0 ? ((price - ownPrice) / ownPrice) * 100 : null
                  const [latestHistory, previousHistory] = offer.priceHistory
                  const latestHistoryPrice = latestHistory ? numberValue(latestHistory.normalizedPrice ?? latestHistory.price) : price
                  const previousHistoryPrice = previousHistory ? numberValue(previousHistory.normalizedPrice ?? previousHistory.price) : null
                  const movement = latestHistoryPrice !== null && previousHistoryPrice !== null ? latestHistoryPrice - previousHistoryPrice : null
                  const latestSourceCheck = offer.priceChecks[0]

                  return (
                    <tr key={match.id} className={`border-t border-[#edf1f5] ${index === 0 ? 'bg-[#eef9f3]' : 'bg-white'}`}>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><span className={`inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-1 text-[8px] font-black ${index === 0 ? 'bg-[#20814d] text-white' : 'bg-[#e9eef4] text-[#66778a]'}`}>{index + 1}</span><div><p className="font-black text-[#2d4057]">{offer.competitor.name}</p><p className="mt-0.5 text-[9px] font-semibold text-[#8a98a9]">{offer.competitor.country.name}</p></div></div></td>
                      <td className="px-4 py-3 font-black text-[#24384f]">{formatCurrency(price)}</td>
                      <td className={`px-4 py-3 font-black ${ownDeltaPct !== null && ownDeltaPct < 0 ? 'text-[#b6414d]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'text-[#20814d]' : 'text-[#708095]'}`}>{ownDeltaPct === null ? '—' : `${ownDeltaPct > 0 ? '+' : ''}${formatNumber(ownDeltaPct, 1)}%`}</td>
                      <td className={`px-4 py-3 font-black ${movement !== null && movement > 0 ? 'text-[#b6414d]' : movement !== null && movement < 0 ? 'text-[#20814d]' : 'text-[#708095]'}`}>{movement === null || movement === 0 ? '—' : `${movement > 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(movement))}`}</td>
                      <td className="px-4 py-3"><span className="ps-chip">{offer.stockStatus ?? 'Onbekend'}</span></td>
                      <td className="px-4 py-3"><p className="font-bold text-[#44576d]">{offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Nog niet gemeten'}</p><p className="mt-0.5 text-[8px] font-semibold text-[#8a98a9]">{latestSourceCheck?.checkMethod ?? 'Geen methode'}</p></td>
                      <td className="px-4 py-3">{latestSourceCheck ? <span className={`ps-chip ${latestSourceCheck.isSuccess ? 'ps-chip-green' : 'ps-chip-red'}`}>{latestSourceCheck.isSuccess ? 'Geslaagd' : 'Mislukt'}</span> : <span className="ps-chip">Nog geen controle</span>}{latestSourceCheck?.errorMessage ? <p className="mt-1 max-w-[180px] truncate text-[8px] font-semibold text-[#a93442]" title={latestSourceCheck.errorMessage}>{latestSourceCheck.errorMessage}</p> : null}</td>
                      <td className="px-4 py-3"><a href={offer.url} target="_blank" rel="noreferrer" className="font-black text-[#2f7edb]">Open URL</a></td>
                    </tr>
                  )
                })}
                {pricedMatches.length === 0 ? <tr><td colSpan={8} className="px-6 py-12 text-center"><p className="font-black text-[#42566d]">Nog geen gemeten concurrentieprijzen</p><p className="mt-2 text-[10px] font-semibold text-[#8190a1]">Koppel een concurrent URL of gebruik EAN discovery en haal daarna de prijzen op.</p></td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="ps-panel p-4">
            <p className="text-[10px] font-black uppercase tracking-[.07em] text-[#778699]">Marktbeeld</p>
            <div className="mt-3 space-y-3">
              <div><p className="text-[9px] font-bold text-[#8492a2]">Prijsrange</p><p className="mt-1 text-[16px] font-black text-[#24384f]">{lowestPrice === null || highestPrice === null ? '—' : `${formatCurrency(lowestPrice)} tot ${formatCurrency(highestPrice)}`}</p></div>
              <div><p className="text-[9px] font-bold text-[#8492a2]">Marktspreiding</p><p className="mt-1 text-[16px] font-black text-[#24384f]">{spreadPct === null ? '—' : `${formatNumber(spreadPct, 1)}%`}</p><p className="mt-1 text-[9px] font-semibold text-[#8492a2]">{spread === null ? 'Geen spreiding berekend' : formatCurrency(spread)}</p></div>
              <div><p className="text-[9px] font-bold text-[#8492a2]">Eigen prijs vs. gemiddelde</p><p className={`mt-1 text-[16px] font-black ${averageDifferencePct !== null && averageDifferencePct > 0 ? 'text-[#b6414d]' : averageDifferencePct !== null && averageDifferencePct < 0 ? 'text-[#20814d]' : 'text-[#24384f]'}`}>{averageDifferencePct === null ? '—' : `${averageDifferencePct > 0 ? '+' : ''}${formatNumber(averageDifferencePct, 1)}%`}</p></div>
            </div>
          </div>
          <div className="ps-panel p-4">
            <p className="text-[10px] font-black uppercase tracking-[.07em] text-[#778699]">Datakwaliteit</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[#69798a]">Bevestigde bronnen</span><strong className="text-[12px] text-[#24384f]">{confirmedMatches.length}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[#69798a]">Met prijs</span><strong className="text-[12px] text-[#24384f]">{pricedMatches.length}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[#69798a]">Verouderd</span><strong className={staleSources ? 'text-[12px] text-[#a36816]' : 'text-[12px] text-[#20814d]'}>{staleSources}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[#69798a]">Laatste crawl mislukt</span><strong className={failedLatestChecks ? 'text-[12px] text-[#b6414d]' : 'text-[12px] text-[#20814d]'}>{failedLatestChecks}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[#69798a]">Review matches</span><strong className={reviewMatches.length ? 'text-[12px] text-[#5b2be8]' : 'text-[12px] text-[#24384f]'}>{reviewMatches.length}</strong></div>
            </div>
          </div>
        </aside>
      </section>

      <Suspense fallback={<AnalyticsFallback label="Prijsverloop" />}>
        <ProductPriceHistoryPanel companyId={user.companyId} productId={product.id} />
      </Suspense>

      <Suspense fallback={<AnalyticsFallback label="Controlehistorie" />}>
        <ProductCheckHistoryPanel companyId={user.companyId} productId={product.id} />
      </Suspense>

      <section className={`rounded-[16px] border p-5 shadow-[0_10px_24px_rgba(20,31,55,.07)] ${reviewMatches.length ? 'border-[#c3b7f7] bg-[#f5f2ff]' : 'border-[#dce3ea] bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[.09em] text-[#4320b8]">Concurrent discovery</p><span className="rounded-full bg-[#5b2be8] px-2.5 py-1 text-[9px] font-black text-white">{reviewMatches.length} suggesties</span></div>
            <h2 className="mt-2 text-[17px] font-black text-[#182238]">Nieuwe concurrentbronnen vinden</h2>
            <p className="mt-1 text-[11px] font-medium leading-5 text-[#59667d]">Gebruik EAN discovery om nieuwe product URLs te vinden. Nieuwe kandidaten komen eerst in Review en tellen pas mee nadat ze zijn bevestigd.</p>
          </div>
          {product.ean && defaultCountry ? (
            <form action={discoverCompetitorUrlsAction} className="flex shrink-0 flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <select name="countryId" defaultValue={defaultCountry.id} className="toolbar-control min-w-[150px]">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <button type="submit" className="primary-action">EAN suggesties ophalen</button>
            </form>
          ) : <div className="rounded-[10px] border border-[#d6b45b] bg-[#fff4d5] px-4 py-3 text-[11px] font-bold text-[#805000]">{product.ean ? 'Geen actieve markt beschikbaar.' : 'EAN ontbreekt bij dit product.'}</div>}
        </div>
        {reviewMatches.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{reviewMatches.map((match) => <a key={match.id} href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="rounded-[12px] border border-[#c3b7f7] bg-white p-3 transition hover:border-[#5b2be8]"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black text-[#253149]">{match.competitorOffer.competitor.name}</p><p className="mt-1 max-w-[260px] truncate text-[9px] font-medium text-[#697386]">{match.competitorOffer.url}</p></div><span className="rounded-full bg-[#e4dcff] px-2 py-1 text-[9px] font-black text-[#4320b8]">{formatNumber(match.confidenceScore)}%</span></div><p className="mt-2 text-[10px] font-bold text-[#2457d6]">Open kandidaat URL</p></a>)}</div> : null}
        {reviewMatches.length ? <div className="mt-4 flex justify-end"><Link href="/productmatches" className="secondary-action">Suggesties beoordelen</Link></div> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-black text-[#252a37]">Concurrent product URL toevoegen</h2><p className="mt-1 text-[11px] leading-5 text-[#697386]">Gebruik dit wanneer discovery de juiste bron niet vindt.</p></div><span className="rounded-full bg-[var(--blue-soft)] px-2.5 py-1 text-[9px] font-black text-[var(--blue)]">Handmatig</span></div>
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
          <div className="mt-4 space-y-2">{product.productMarkets.length === 0 ? <p className="rounded-[12px] bg-[#eef1f7] px-3 py-4 text-[10px] text-[#697386]">Nog geen landspecifieke productdata.</p> : product.productMarkets.map((market) => <div key={market.id} className="flex items-center justify-between gap-3 rounded-[11px] border border-[#d8dde7] bg-[#f4f6fa] px-3 py-3"><div><p className="text-[11px] font-black text-[#303647]">{market.country.name}</p><p className="mt-0.5 text-[9px] text-[#697386]">{market.stockStatus ?? 'Voorraad onbekend'}</p></div><div className="text-right"><p className="text-[11px] font-black text-[#303647]">{formatCurrency(market.ownPrice, market.currency)}</p>{market.ownUrl ? <a href={market.ownUrl} target="_blank" rel="noreferrer" className="mt-0.5 block text-[9px] font-black text-[var(--blue)]">Open webshop</a> : null}</div></div>)}</div>
        </div>
      </section>
    </div>
  )
}
