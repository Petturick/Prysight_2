export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, discoverCompetitorUrlsAction, runCompetitorOfferResearchAction } from '@/app/actions/productActions'
import { refreshSingleProductPriceAction } from '@/app/actions/productPriceBulkActions'
import { ProductCheckHistoryPanel } from '@/components/ProductCheckHistoryPanel'
import { ProductPriceHistoryPanel } from '@/components/ProductPriceHistoryPanel'
import { PriceFetchSubmitButton } from '@/components/PriceFetchSubmitButton'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { getPricingRecommendations } from '@/lib/pricing-engine'
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
      <p className="mt-3 text-[12px] text-[#8aa0b4]">{label} wordt geladen.</p>
    </section>
  )
}

function actionLabel(action: 'LOWER' | 'RAISE' | 'KEEP' | 'NO_DATA' | undefined) {
  if (action === 'LOWER') return 'Prijs verlagen'
  if (action === 'RAISE') return 'Prijs verhogen'
  if (action === 'KEEP') return 'Prijs behouden'
  return 'Nog geen advies'
}

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser()
  const { id } = await params
  const query = await searchParams

  const [product, countries, pricing] = await Promise.all([
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
    getPricingRecommendations(user.companyId, {}, 5, true, [id]).catch((error) => {
      console.error('Pricing cockpit recommendation failed', { companyId: user.companyId, productId: id, error })
      return { recommendations: [] }
    }),
  ])

  if (!product) notFound()

  const defaultCountry = countries.find((country) => product.productMarkets.some((market) => market.countryId === country.id)) ?? countries.find((country) => country.code === 'NL') ?? countries[0]
  const confirmedMatches = product.matches.filter((match) => match.matchStatus === 'CERTAIN' && match.competitorOffer.isActive)
  const reviewMatches = product.matches.filter((match) => match.matchStatus === 'REVIEW' && match.competitorOffer.isActive)
  const crawlableMatches = product.matches.filter((match) => (match.matchStatus === 'CERTAIN' || match.matchStatus === 'REVIEW') && match.competitorOffer.isActive)
  const pricedMatches = confirmedMatches.filter((match) => numberValue(match.competitorOffer.normalizedPrice) !== null)
    .sort((a, b) => Number(a.competitorOffer.normalizedPrice) - Number(b.competitorOffer.normalizedPrice))
  const comparisonMatches = [...confirmedMatches].sort((a, b) => {
    const aPrice = numberValue(a.competitorOffer.normalizedPrice)
    const bPrice = numberValue(b.competitorOffer.normalizedPrice)
    if (aPrice === null) return bPrice === null ? a.competitorOffer.competitor.name.localeCompare(b.competitorOffer.competitor.name) : 1
    if (bPrice === null) return -1
    return aPrice - bPrice
  })

  const prices = pricedMatches.map((match) => Number(match.competitorOffer.normalizedPrice))
  const lowestPrice = prices.length ? Math.min(...prices) : null
  const highestPrice = prices.length ? Math.max(...prices) : null
  const averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null
  const spread = lowestPrice !== null && highestPrice !== null ? highestPrice - lowestPrice : null
  const spreadPct = lowestPrice !== null && lowestPrice > 0 && spread !== null ? (spread / lowestPrice) * 100 : null
  const latestCheck = crawlableMatches.map((match) => match.competitorOffer.lastCheckedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const ownPrice = product.ownPrice ? Number(product.ownPrice) : null
  const averageDifferencePct = ownPrice !== null && averagePrice !== null && averagePrice > 0 ? ((ownPrice - averagePrice) / averagePrice) * 100 : null
  const staleSources = crawlableMatches.filter((match) => isStalePriceSource(match.competitorOffer.lastCheckedAt)).length
  const failedLatestChecks = crawlableMatches.filter((match) => match.competitorOffer.priceChecks[0] && !match.competitorOffer.priceChecks[0].isSuccess).length
  const measurementQuality = confirmedMatches.length >= 3 && staleSources === 0 && failedLatestChecks === 0
    ? 'Sterk'
    : confirmedMatches.length >= 2 && failedLatestChecks === 0
      ? 'Redelijk'
      : 'Beperkt'

  const recommendation = pricing.recommendations.find((item) => item.productId === product.id && defaultCountry && item.countryId === defaultCountry.id)
    ?? pricing.recommendations.find((item) => item.productId === product.id)
    ?? null
  const marketBenchmark = recommendation?.marketMedian ?? recommendation?.marketAverage ?? lowestPrice
  const recommendedPrice = recommendation?.recommendedPrice ?? null
  const expectedMargin = recommendation?.marginAfterPct ?? null
  const currentMargin = recommendation?.marginBeforePct ?? null
  const marketPosition = recommendation?.marketPosition ?? (ownPrice !== null && prices.length ? prices.filter((price) => price < ownPrice).length + 1 : null)
  const competitorCount = recommendation?.competitorCount ?? pricedMatches.length
  const guardrailMin = recommendation?.minimumAllowedPrice ?? null
  const guardrailMax = recommendation?.maximumAllowedPrice ?? null
  const adviceChange = recommendation?.changePct ?? null
  const adviceTone = recommendation?.action === 'LOWER' ? 'text-[#b6414d]' : recommendation?.action === 'RAISE' ? 'text-[#20814d]' : 'text-[#24384f]'
  const guardrailText = guardrailMin !== null && guardrailMax !== null
    ? `${formatCurrency(guardrailMin)} tot ${formatCurrency(guardrailMax)}`
    : guardrailMin !== null
      ? `Vanaf ${formatCurrency(guardrailMin)}`
      : guardrailMax !== null
        ? `Tot ${formatCurrency(guardrailMax)}`
        : 'Geen productgrens ingesteld'

  const controlMessage = readParam(query.controle)
  const sourceControlMessage = readParam(query.broncontrole)
  const crawlStatus = readParam(query.crawlstatus)
  const discovered = Number(readParam(query.suggesties) ?? '0') || 0
  const found = Number(readParam(query.gevonden) ?? '0') || 0

  return (
    <div className="space-y-4">
      {crawlStatus === 'geen-bron' ? <div className="rounded-[12px] border border-[#edd9aa] bg-[#fff8e9] px-4 py-3 text-[12px] font-semibold text-[#7b5a1b]">Koppel eerst één concurrent product URL. Daarna kan PrySight dit product met één klik crawlen.</div> : null}
      {crawlStatus === 'mislukt' ? <div className="rounded-[12px] border border-[#efc8cd] bg-[#fff2f3] px-4 py-3 text-[12px] font-semibold text-[#9c3442]">De crawl kon niet worden afgerond. De bestaande prijsdata is niet aangepast. Controleer de bron URL en probeer opnieuw.</div> : null}
      {(readParam(query.toegevoegd) || readParam(query.bron) || controlMessage || sourceControlMessage || readParam(query.suggesties)) ? (
        <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e8f7ee] px-4 py-3 text-[12px] font-semibold text-[#176a42]">
          {readParam(query.toegevoegd)
            ? `Product toegevoegd${discovered > 0 ? `, ${discovered} concurrent suggesties gevonden.` : '.'}`
            : readParam(query.bron)
              ? 'Concurrentbron gekoppeld. Je kunt nu direct crawlen.'
              : sourceControlMessage
                ? `Broncontrole klaar, resultaat ${sourceControlMessage}.`
                : controlMessage
                  ? `Prijscontrole klaar, resultaat ${controlMessage}.`
                  : `${discovered} suggesties opgeslagen uit ${found} resultaten.`}
        </div>
      ) : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#788698]">
              <span>Artikel {product.articleNumber}</span>
              {product.ean ? <span>· EAN {product.ean}</span> : null}
              <span>· {product.productGroup.name}</span>
              <span className={`ps-chip ${measurementQuality === 'Sterk' ? 'ps-chip-green' : measurementQuality === 'Redelijk' ? 'ps-chip-amber' : 'ps-chip-red'}`}>Data {measurementQuality.toLowerCase()}</span>
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-[#18273a]">{product.name}</h1>
            <p className="mt-1 text-[11px] text-[#788698]">{product.packagingQty} {product.packagingUnit ?? 'stuks'} · {product.stockStatus ?? 'Voorraad onbekend'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/producten" className="secondary-action">Terug</Link>
            {crawlableMatches.length > 0 ? (
              <form action={refreshSingleProductPriceAction}>
                <input type="hidden" name="singleProductId" value={product.id} />
                <input type="hidden" name="returnTo" value="detail" />
                <PriceFetchSubmitButton idleLabel="Nu crawlen" pendingLabel="Crawlen…" />
              </form>
            ) : <a href="#concurrent-bron-toevoegen" className="primary-action">Concurrent koppelen</a>}
          </div>
        </div>
      </section>

      <section className="ps-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#21364d]">Pricing cockpit</h2>
            <p className="mt-1 text-[11px] text-[#7a8798]">Actuele marktpositie en prijsadvies binnen je ingestelde grenzen.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {recommendation?.appliedRuleName ? <span className="ps-chip ps-chip-blue">{recommendation.appliedRuleName}</span> : <span className="ps-chip">Standaard prijsstrategie</span>}
            {latestCheck ? <span className="text-[10px] text-[#8793a3]">Gemeten {formatDate(latestCheck)}</span> : null}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-6">
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Huidige prijs</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{formatCurrency(ownPrice, product.currency)}</p>{currentMargin !== null ? <p className="mt-1 text-[10px] text-[#8793a3]">Marge {formatNumber(currentMargin, 1)}%</p> : null}</div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Marktbenchmark</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{formatCurrency(marketBenchmark)}</p><p className="mt-1 text-[10px] text-[#8793a3]">Mediaan, {competitorCount} prijs{competitorCount === 1 ? '' : 'en'}</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Aanbevolen prijs</p><p className={`mt-1 text-[23px] font-semibold ${adviceTone}`}>{formatCurrency(recommendedPrice)}</p><p className={`mt-1 text-[10px] font-medium ${adviceTone}`}>{actionLabel(recommendation?.action)}{adviceChange !== null ? ` · ${adviceChange > 0 ? '+' : ''}${formatNumber(adviceChange, 1)}%` : ''}</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Verwachte marge</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{expectedMargin === null ? '—' : `${formatNumber(expectedMargin, 1)}%`}</p><p className="mt-1 text-[10px] text-[#8793a3]">Na adviesprijs</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Marktpositie</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{marketPosition === null ? '—' : `${marketPosition} / ${competitorCount + 1}`}</p><p className="mt-1 text-[10px] text-[#8793a3]">Inclusief eigen prijs</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Guardrails</p><p className="mt-1 text-[13px] font-semibold text-[#21364d]">{guardrailText}</p><p className="mt-1 text-[10px] text-[#8793a3]">{recommendation?.requiresApproval === false ? 'Automatisch toegestaan' : 'Goedkeuring vereist'}</p></div>
        </div>

        <div className="border-t border-[#e7edf3] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold text-[#33485f]">Waarom dit advies</p>
              <p className="mt-1 text-[12px] leading-5 text-[#6e7d8f]">{recommendation?.reason ?? (crawlableMatches.length === 0 ? 'Er is nog geen concurrentbron gekoppeld. Koppel eerst een bron om een marktadvies te berekenen.' : 'Er is nog onvoldoende betrouwbare prijsdata voor een prijsadvies.')}</p>
              {recommendation?.guardrailNotes?.length ? (
                <details className="mt-2 text-[11px] text-[#66778a]">
                  <summary className="cursor-pointer font-semibold text-[#2f6edb]">Toon berekening en grenzen</summary>
                  <div className="mt-2 space-y-1.5">{recommendation.guardrailNotes.map((note) => <p key={note}>{note}</p>)}</div>
                </details>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2"><Link href="/prijsregels" className="secondary-action min-h-[36px] px-3 py-2 text-[11px]">Prijsregels</Link><Link href="/prijsstrategie" className="primary-action min-h-[36px] px-3 py-2 text-[11px]">Prijsstrategie</Link></div>
          </div>
          {(staleSources > 0 || failedLatestChecks > 0) ? <div className="mt-3 rounded-[10px] bg-[#fff7e8] px-3 py-2.5 text-[11px] font-medium text-[#815d1d]">Ververs eerst de prijsdata voordat je dit advies commercieel gebruikt, {staleSources} verouderde bron{staleSources === 1 ? '' : 'nen'}, {failedLatestChecks} mislukte laatste controle{failedLatestChecks === 1 ? '' : 's'}.</div> : null}
        </div>
      </section>

      <section id="concurrentieprijzen" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="ps-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#e7edf3] px-5 py-4">
            <div><h2 className="text-[15px] font-semibold text-[#24384f]">Concurrentieprijzen</h2><p className="mt-1 text-[11px] text-[#7a8798]">Bronnen die voor dit product worden gemeten.</p></div>
            <span className="ps-chip ps-chip-blue">{pricedMatches.length} gemeten</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[11px]">
              <thead className="bg-[#f6f8fb] text-left text-[10px] font-semibold text-[#758396]"><tr><th className="px-4 py-3">Concurrent</th><th className="px-4 py-3">Prijs</th><th className="px-4 py-3">Vs. eigen</th><th className="px-4 py-3">Wijziging</th><th className="px-4 py-3">Voorraad</th><th className="px-4 py-3">Laatste crawl</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Bron</th><th className="px-4 py-3">Actie</th></tr></thead>
              <tbody>
                {comparisonMatches.map((match, index) => {
                  const offer = match.competitorOffer
                  const price = numberValue(offer.normalizedPrice)
                  const ownDeltaPct = ownPrice !== null && price !== null && ownPrice > 0 ? ((price - ownPrice) / ownPrice) * 100 : null
                  const [latestHistory, previousHistory] = offer.priceHistory
                  const latestHistoryPrice = latestHistory ? numberValue(latestHistory.normalizedPrice ?? latestHistory.price) : price
                  const previousHistoryPrice = previousHistory ? numberValue(previousHistory.normalizedPrice ?? previousHistory.price) : null
                  const movement = latestHistoryPrice !== null && previousHistoryPrice !== null ? latestHistoryPrice - previousHistoryPrice : null
                  const latestSourceCheck = offer.priceChecks[0]

                  return (
                    <tr key={match.id} className={`border-t border-[#edf1f5] ${price !== null && index === 0 ? 'bg-[#f1f8f4]' : 'bg-white'}`}>
                      <td className="px-4 py-3"><p className="font-semibold text-[#2d4057]">{offer.competitor.name}</p><p className="mt-0.5 text-[10px] text-[#8a98a9]">{offer.competitor.country.name}</p></td>
                      <td className="px-4 py-3 font-semibold text-[#24384f]">{price === null ? <span className="text-[#a36816]">Nog niet gemeten</span> : formatCurrency(price)}</td>
                      <td className={`px-4 py-3 font-semibold ${ownDeltaPct !== null && ownDeltaPct < 0 ? 'text-[#b6414d]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'text-[#20814d]' : 'text-[#708095]'}`}>{ownDeltaPct === null ? '—' : `${ownDeltaPct > 0 ? '+' : ''}${formatNumber(ownDeltaPct, 1)}%`}</td>
                      <td className={`px-4 py-3 font-semibold ${movement !== null && movement > 0 ? 'text-[#b6414d]' : movement !== null && movement < 0 ? 'text-[#20814d]' : 'text-[#708095]'}`}>{movement === null || movement === 0 ? '—' : `${movement > 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(movement))}`}</td>
                      <td className="px-4 py-3"><span className="ps-chip">{offer.stockStatus ?? 'Onbekend'}</span></td>
                      <td className="px-4 py-3"><p className="font-medium text-[#44576d]">{offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Nog niet gemeten'}</p></td>
                      <td className="px-4 py-3">{latestSourceCheck ? <span className={`ps-chip ${latestSourceCheck.isSuccess ? 'ps-chip-green' : 'ps-chip-red'}`}>{latestSourceCheck.isSuccess ? 'Geslaagd' : 'Mislukt'}</span> : <span className="ps-chip">Niet gecontroleerd</span>}{latestSourceCheck?.errorMessage ? <p className="mt-1 max-w-[180px] truncate text-[9px] text-[#a93442]" title={latestSourceCheck.errorMessage}>{latestSourceCheck.errorMessage}</p> : null}</td>
                      <td className="px-4 py-3"><a href={offer.url} target="_blank" rel="noreferrer" className="font-semibold text-[#2f6edb]">Open URL</a></td>
                      <td className="px-4 py-3"><form action={runCompetitorOfferResearchAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><PriceFetchSubmitButton compact idleLabel={latestSourceCheck ? 'Opnieuw' : 'Ophalen'} pendingLabel="Bezig…" /></form></td>
                    </tr>
                  )
                })}
                {comparisonMatches.length === 0 ? <tr><td colSpan={9} className="px-6 py-10 text-center"><p className="font-semibold text-[#42566d]">Nog geen concurrentiebron gekoppeld</p><a href="#concurrent-bron-toevoegen" className="mt-2 inline-flex text-[11px] font-semibold text-[#2f6edb]">Concurrent koppelen</a></td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="ps-panel p-4">
            <h3 className="text-[12px] font-semibold text-[#34495f]">Marktbeeld</h3>
            <div className="mt-3 space-y-3 text-[11px]">
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Laagste</span><strong className="font-semibold text-[#24384f]">{formatCurrency(lowestPrice)}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Hoogste</span><strong className="font-semibold text-[#24384f]">{formatCurrency(highestPrice)}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Spreiding</span><strong className="font-semibold text-[#24384f]">{spreadPct === null ? '—' : `${formatNumber(spreadPct, 1)}%`}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Vs. gemiddelde</span><strong className={`font-semibold ${averageDifferencePct !== null && averageDifferencePct > 0 ? 'text-[#b6414d]' : averageDifferencePct !== null && averageDifferencePct < 0 ? 'text-[#20814d]' : 'text-[#24384f]'}`}>{averageDifferencePct === null ? '—' : `${averageDifferencePct > 0 ? '+' : ''}${formatNumber(averageDifferencePct, 1)}%`}</strong></div>
            </div>
          </div>
          <div className="ps-panel p-4">
            <h3 className="text-[12px] font-semibold text-[#34495f]">Datakwaliteit</h3>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Bevestigde bronnen</span><strong>{confirmedMatches.length}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Met prijs</span><strong>{pricedMatches.length}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Verouderd</span><strong className={staleSources ? 'text-[#a36816]' : 'text-[#20814d]'}>{staleSources}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Mislukte controle</span><strong className={failedLatestChecks ? 'text-[#b6414d]' : 'text-[#20814d]'}>{failedLatestChecks}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Matches beoordelen</span><strong>{reviewMatches.length}</strong></div>
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

      <section className={`rounded-[16px] border p-5 shadow-[0_8px_20px_rgba(20,31,55,.06)] ${reviewMatches.length ? 'border-[#c3b7f7] bg-[#f7f5ff]' : 'border-[#dce3ea] bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#253149]">Concurrenten automatisch vinden</h2>
            <p className="mt-1 text-[11px] text-[#6f7d8f]">Gebruik EAN om mogelijke product URLs te vinden. Suggesties worden eerst beoordeeld.</p>
          </div>
          {product.ean && defaultCountry ? (
            <form action={discoverCompetitorUrlsAction} className="flex shrink-0 flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <select name="countryId" defaultValue={defaultCountry.id} className="toolbar-control min-w-[150px]">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <button type="submit" className="secondary-action">EAN zoeken</button>
            </form>
          ) : <span className="text-[11px] font-medium text-[#8a6a2a]">{product.ean ? 'Geen actieve markt beschikbaar.' : 'EAN ontbreekt.'}</span>}
        </div>
        {reviewMatches.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{reviewMatches.map((match) => <a key={match.id} href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="rounded-[12px] border border-[#d8d2f6] bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-[#253149]">{match.competitorOffer.competitor.name}</p><p className="mt-1 max-w-[260px] truncate text-[9px] text-[#697386]">{match.competitorOffer.url}</p></div><span className="ps-chip ps-chip-blue">{formatNumber(match.confidenceScore)}%</span></div></a>)}</div> : null}
        {reviewMatches.length ? <div className="mt-3 flex justify-end"><Link href="/productmatches" className="text-[11px] font-semibold text-[#2f6edb]">Suggesties beoordelen</Link></div> : null}
      </section>

      <section id="concurrent-bron-toevoegen" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-5">
          <h2 className="text-[14px] font-semibold text-[#252a37]">Concurrent koppelen</h2>
          <p className="mt-1 text-[11px] text-[#697386]">Plak de exacte product URL van de concurrent.</p>
          <form action={addCompetitorOfferAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="productId" value={product.id} />
            <label className="text-[11px] font-medium text-[#4f5869]">Concurrent<input required name="competitorName" className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld Manutan" /></label>
            <label className="text-[11px] font-medium text-[#4f5869]">Land<select required name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label className="text-[11px] font-medium text-[#4f5869] md:col-span-2">Product URL<input required type="url" name="offerUrl" className="toolbar-control mt-1.5 w-full" placeholder="https://concurrent.nl/product/..." /></label>
            <div className="md:col-span-2 flex justify-end"><button type="submit" className="primary-action">Koppelen</button></div>
          </form>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-[14px] font-semibold text-[#252a37]">Markten</h2>
          <div className="mt-4 space-y-2">{product.productMarkets.length === 0 ? <p className="rounded-[12px] bg-[#eef1f7] px-3 py-4 text-[11px] text-[#697386]">Nog geen landspecifieke productdata.</p> : product.productMarkets.map((market) => <div key={market.id} className="flex items-center justify-between gap-3 rounded-[11px] bg-[#f4f6fa] px-3 py-3"><div><p className="text-[11px] font-semibold text-[#303647]">{market.country.name}</p><p className="mt-0.5 text-[10px] text-[#697386]">{market.stockStatus ?? 'Voorraad onbekend'}</p></div><div className="text-right"><p className="text-[11px] font-semibold text-[#303647]">{formatCurrency(market.ownPrice, market.currency)}</p>{market.ownUrl ? <a href={market.ownUrl} target="_blank" rel="noreferrer" className="mt-0.5 block text-[10px] font-semibold text-[#2f6edb]">Webshop</a> : null}</div></div>)}</div>
        </div>
      </section>
    </div>
  )
}
