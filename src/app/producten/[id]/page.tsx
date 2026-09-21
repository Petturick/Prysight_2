export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, discoverCompetitorUrlsAction, removeCompetitorOfferAction, runCompetitorOfferResearchAction, updateCompetitorOfferAction, updateProductOwnPriceAction } from '@/app/actions/productActions'
import { refreshSingleProductPriceAction } from '@/app/actions/productPriceBulkActions'
import { ProductCheckHistoryPanel } from '@/components/ProductCheckHistoryPanel'
import { ProductPriceHistoryPanel } from '@/components/ProductPriceHistoryPanel'
import { PriceFetchSubmitButton } from '@/components/PriceFetchSubmitButton'
import { RemoveCompetitorButton } from '@/components/RemoveCompetitorButton'
import { MarketPriceFields } from '@/components/MarketPriceFields'
import { MarketProfileSelector } from '@/components/MarketProfileSelector'
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

function controlSummary(value: string | undefined) {
  if (!value) return null
  const [successfulRaw, failedRaw] = value.split('-')
  const successful = Number(successfulRaw)
  const failed = Number(failedRaw)
  if (!Number.isFinite(successful) || !Number.isFinite(failed)) return 'Prijscontrole afgerond'
  if (successful === 0 && failed > 0) return 'Geen prijs opgehaald'
  if (failed > 0) return `${successful} bijgewerkt, ${failed} mislukt`
  return successful === 1 ? 'Prijs bijgewerkt' : `${successful} prijzen bijgewerkt`
}

function sourceIssueLabel(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (/empty response|no result returned|geen html|lege productpagina/.test(normalized)) return 'Geen leesbare productpagina'
  if (/\b429\b|too many requests|rate limit/.test(normalized)) return 'Tijdelijk beperkt'
  if (/\b403\b|forbidden|access denied|captcha|robots\.txt|bot protection/.test(normalized)) return 'Bron blokkeert controle'
  if (/timeout|timed out|abort/.test(normalized)) return 'Bron reageert niet'
  if (/geen betrouwbare prijs|prijs niet gevonden|price not found/.test(normalized)) return 'Prijs niet gevonden'
  if (normalized.startsWith('prijs gevonden')) return value
  if (/browser renderer|scraping service|renderer/.test(normalized)) return 'Dynamische pagina niet leesbaar'
  return 'Controle mislukt'
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

  const requestedCountryId = readParam(query.land)
  const defaultCountry = countries.find((country) => country.id === requestedCountryId)
    ?? countries.find((country) => product.productMarkets.some((market) => market.countryId === country.id && market.isActive))
    ?? countries.find((country) => country.code === 'NL')
    ?? countries[0]
  const selectedMarket = defaultCountry ? product.productMarkets.find((market) => market.countryId === defaultCountry.id && market.isActive) ?? null : null
  const canEditProduct = user.role === 'SUPER_ADMIN' || user.permissions.includes('products.write')
  const canEditCompetitors = user.role === 'SUPER_ADMIN' || user.permissions.includes('competitors.write')
  const marketMatches = defaultCountry
    ? product.matches.filter((match) => match.competitorOffer.competitor.countryId === defaultCountry.id)
    : product.matches
  const confirmedMatches = marketMatches.filter((match) => match.matchStatus === 'CERTAIN' && match.competitorOffer.isActive)
  const reviewMatches = marketMatches.filter((match) => match.matchStatus === 'REVIEW' && match.competitorOffer.isActive)
  const crawlableMatches = marketMatches.filter((match) => (match.matchStatus === 'CERTAIN' || match.matchStatus === 'REVIEW') && match.competitorOffer.isActive)
  const pricedMatches = confirmedMatches.filter((match) => numberValue(match.competitorOffer.normalizedPrice) !== null)
    .sort((a, b) => Number(a.competitorOffer.normalizedPrice) - Number(b.competitorOffer.normalizedPrice))
  const comparisonMatches = [...confirmedMatches].sort((a, b) => {
    const aPrice = numberValue(a.competitorOffer.normalizedPrice)
    const bPrice = numberValue(b.competitorOffer.normalizedPrice)
    if (aPrice === null) return bPrice === null ? a.competitorOffer.competitor.name.localeCompare(b.competitorOffer.competitor.name) : 1
    if (bPrice === null) return -1
    return aPrice - bPrice
  })
  const selectedOfferId = readParam(query.concurrent)
  const selectedCompetitorMatch = selectedOfferId
    ? comparisonMatches.find((match) => match.competitorOffer.id === selectedOfferId) ?? null
    : null

  const prices = pricedMatches.map((match) => Number(match.competitorOffer.normalizedPrice))
  const lowestPrice = prices.length ? Math.min(...prices) : null
  const highestPrice = prices.length ? Math.max(...prices) : null
  const averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null
  const spread = lowestPrice !== null && highestPrice !== null ? highestPrice - lowestPrice : null
  const spreadPct = lowestPrice !== null && lowestPrice > 0 && spread !== null ? (spread / lowestPrice) * 100 : null
  const latestCheck = crawlableMatches.map((match) => match.competitorOffer.lastCheckedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const ownPrice = numberValue(selectedMarket?.ownPrice ?? (product.productMarkets.length === 0 ? product.ownPrice : null))
  const ownCurrency = selectedMarket?.currency ?? defaultCountry?.currency ?? product.currency
  const marketVatIncluded = selectedMarket?.vatIncluded ?? product.vatIncluded
  const vatRate = numberValue(defaultCountry?.vatRate)
  const ownPriceExVat = ownPrice !== null && vatRate !== null
    ? marketVatIncluded ? ownPrice / (1 + vatRate / 100) : ownPrice
    : ownPrice
  const ownPriceIncVat = ownPrice !== null && vatRate !== null
    ? marketVatIncluded ? ownPrice : ownPrice * (1 + vatRate / 100)
    : ownPrice
  const comparisonOwnPrice = ownPriceIncVat
  const averageDifferencePct = comparisonOwnPrice !== null && averagePrice !== null && averagePrice > 0 ? ((comparisonOwnPrice - averagePrice) / averagePrice) * 100 : null
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
  const marketPosition = recommendation?.marketPosition ?? (comparisonOwnPrice !== null && prices.length ? prices.filter((price) => price < comparisonOwnPrice).length + 1 : null)
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
  const discoveryFound = Number(readParam(query.gevonden) ?? '0') || 0
  const discoveryAlreadyLinked = Number(readParam(query.algekoppeld) ?? '0') || 0
  const discoveryProvider = readParam(query.zoekbron)
  const discoveryMode = readParam(query.zoekmodus)
  const discoveryReason = readParam(query.reden)
  const discoveryAttempted = query.suggesties !== undefined
  const priceUpdated = readParam(query.prijs) === 'bijgewerkt'
  const sourceUpdated = readParam(query.bron) === 'bijgewerkt'
  const controlSummaryText = controlSummary(controlMessage)
  const sourceControlSummaryText = controlSummary(sourceControlMessage)

  return (
    <div className="space-y-4">
      {priceUpdated ? <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e8f7ee] px-4 py-3 text-[12px] font-semibold text-[#176a42]">Verkoopprijs bijgewerkt.</div> : null}
      {sourceUpdated ? <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e8f7ee] px-4 py-3 text-[12px] font-semibold text-[#176a42]">Concurrentiebron bijgewerkt. Als de product URL is gewijzigd, is de oude prijs gewist en kan de bron opnieuw worden gecontroleerd.</div> : null}
      {crawlStatus === 'geen-bron' ? <div className="rounded-[12px] border border-[#edd9aa] bg-[#fff8e9] px-4 py-3 text-[12px] font-semibold text-[#7b5a1b]">Koppel eerst een concurrentbron.</div> : null}
      {crawlStatus === 'mislukt' ? <div className="rounded-[12px] border border-[#efc8cd] bg-[#fff2f3] px-4 py-3 text-[12px] font-semibold text-[#9c3442]">Prijscontrole mislukt. Controleer de bron en probeer opnieuw.</div> : null}
      {(readParam(query.toegevoegd) || readParam(query.bron) === 'toegevoegd' || controlMessage || sourceControlMessage) ? (
        <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e8f7ee] px-4 py-3 text-[12px] font-semibold text-[#176a42]">
          {readParam(query.toegevoegd)
            ? `Product toegevoegd${discovered > 0 ? `, ${discovered} concurrent suggesties gevonden.` : '.'}`
            : readParam(query.bron) === 'toegevoegd'
              ? 'Concurrentbron gekoppeld. Je kunt nu direct crawlen.'
              : sourceControlMessage
                ? sourceControlSummaryText
                : controlSummaryText}
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
            <p className="mt-1 text-[11px] text-[#788698]">{product.packagingQty} {product.packagingUnit ?? 'stuks'} · {selectedMarket?.stockStatus ?? product.stockStatus ?? 'Voorraad onbekend'}</p>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            {defaultCountry ? <MarketProfileSelector countries={countries.map((country) => ({ id: country.id, name: country.name }))} value={defaultCountry.id} /> : null}
            <div className="flex flex-wrap gap-2">
              <Link href={defaultCountry ? `/producten?land=${defaultCountry.id}` : '/producten'} className="secondary-action">Terug</Link>
              <a href="#eigen-prijs" className="secondary-action">Prijs aanpassen</a>
              {crawlableMatches.length > 0 ? (
                <form action={refreshSingleProductPriceAction}>
                  <input type="hidden" name="singleProductId" value={product.id} />
                  <input type="hidden" name="returnTo" value="detail" />
                  <PriceFetchSubmitButton idleLabel="Prijzen ophalen" pendingLabel="Ophalen…" />
                </form>
              ) : <a href="#concurrent-bron-toevoegen" className="primary-action">Concurrent koppelen</a>}
            </div>
          </div>
        </div>
      </section>

      <section id="eigen-prijs" className="ps-panel scroll-mt-24 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#21364d]">Eigen verkoopprijs</h2>
            <p className="mt-1 text-[10px] text-[#8290a1]">Prijsprofiel per land, exclusief en inclusief btw altijd naast elkaar.</p>
          </div>
          {defaultCountry ? <span className="ps-chip ps-chip-blue">{defaultCountry.name}{selectedMarket ? '' : ' · nieuw profiel'}</span> : <span className="ps-chip">Geen markt</span>}
        </div>

        <div className="grid gap-0 lg:grid-cols-[.58fr_1.42fr]">
          <div className="border-b border-[#e7edf3] bg-[#f8fbff] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8492a3]">Exclusief btw</p>
                <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#1e2d3f]">{formatCurrency(ownPriceExVat, ownCurrency)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8492a3]">Inclusief btw</p>
                <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#1e2d3f]">{formatCurrency(ownPriceIncVat, ownCurrency)}</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-[#7b8999]">
              {defaultCountry ? `Btw tarief ${formatNumber(vatRate, 2)}% · ${defaultCountry.name}` : 'Selecteer een marktprofiel'}
              {' · '}{selectedMarket?.stockStatus ?? product.stockStatus ?? 'Voorraad onbekend'}
            </p>
            {ownPrice === null ? <p className="mt-3 rounded-[9px] bg-[#fff6e4] px-3 py-2 text-[11px] font-semibold text-[#9a6810]">Voor dit land is nog geen eigen prijs opgeslagen. Vul beide prijsvelden in om dit marktprofiel aan te maken.</p> : null}
          </div>

          <div className="p-5 sm:p-6">
            {canEditProduct && defaultCountry ? (
              <form action={updateProductOwnPriceAction} className="space-y-4">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="countryId" value={defaultCountry.id} />
                <MarketPriceFields
                  countries={countries.map((country) => ({ id: country.id, name: country.name, currency: country.currency, vatRate: Number(country.vatRate) }))}
                  defaultCountryId={defaultCountry.id}
                  initialPrice={ownPrice}
                  initialVatIncluded={marketVatIncluded}
                  showCountry={false}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-[11px] font-semibold text-[#4f5869]">Voorraadstatus
                    <input name="stockStatus" defaultValue={selectedMarket?.stockStatus ?? product.stockStatus ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" />
                  </label>
                  <label className="text-[11px] font-semibold text-[#4f5869]">Jouw product URL
                    <input name="ownUrl" type="url" defaultValue={selectedMarket?.ownUrl ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="https://jouwwebshop.nl/product/..." />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="primary-action shrink-0">{selectedMarket ? 'Prijsprofiel opslaan' : 'Marktprofiel aanmaken'}</button>
                </div>
              </form>
            ) : <p className="text-[11px] text-[#7b8999]">Je hebt alleen lezen toegang tot productprijzen.</p>}
          </div>
        </div>
      </section>

      <section className="ps-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#21364d]">Prijspositie</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {recommendation?.appliedRuleName ? <span className="ps-chip ps-chip-blue">{recommendation.appliedRuleName}</span> : <span className="ps-chip">Standaard prijsstrategie</span>}
            {latestCheck ? <span className="text-[10px] text-[#8793a3]">Gemeten {formatDate(latestCheck)}</span> : null}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Eigen prijs incl. btw</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{formatCurrency(comparisonOwnPrice, ownCurrency)}</p><p className="mt-1 text-[9px] text-[#8793a3]">Vergelijkingsbasis voor {defaultCountry?.name ?? 'de markt'}</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Markt</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{formatCurrency(marketBenchmark)}</p><p className="mt-1 text-[10px] text-[#8793a3]">{competitorCount} gemeten</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Advies</p><p className={`mt-1 text-[23px] font-semibold ${adviceTone}`}>{formatCurrency(recommendedPrice)}</p><p className={`mt-1 text-[10px] font-medium ${adviceTone}`}>{actionLabel(recommendation?.action)}{adviceChange !== null ? ` · ${adviceChange > 0 ? '+' : ''}${formatNumber(adviceChange, 1)}%` : ''}</p></div>
          <div className="px-5 py-4"><p className="text-[11px] font-medium text-[#8290a1]">Positie</p><p className="mt-1 text-[23px] font-semibold text-[#21364d]">{marketPosition === null ? '—' : `${marketPosition} / ${competitorCount + 1}`}</p></div>
        </div>

        <div className="border-t border-[#e7edf3] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <details className="max-w-4xl text-[11px] text-[#66778a]">
              <summary className="cursor-pointer font-semibold text-[#2f6edb]">Prijsdetails</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div><span className="text-[#8793a3]">Huidige marge</span><p className="font-semibold text-[#33485f]">{currentMargin === null ? '—' : `${formatNumber(currentMargin, 1)}%`}</p></div>
                <div><span className="text-[#8793a3]">Marge na advies</span><p className="font-semibold text-[#33485f]">{expectedMargin === null ? '—' : `${formatNumber(expectedMargin, 1)}%`}</p></div>
                <div><span className="text-[#8793a3]">Prijsgrenzen</span><p className="font-semibold text-[#33485f]">{guardrailText}</p></div>
              </div>
              <p className="mt-3 leading-5">{recommendation?.reason ?? (crawlableMatches.length === 0 ? 'Koppel een concurrentbron voor een marktadvies.' : 'Nog onvoldoende betrouwbare prijsdata voor een advies.')}</p>
              {recommendation?.guardrailNotes?.length ? <div className="mt-2 space-y-1">{recommendation.guardrailNotes.map((note) => <p key={note}>{note}</p>)}</div> : null}
            </details>
            <div className="flex shrink-0 gap-2"><Link href="/prijsregels" className="secondary-action min-h-[36px] px-3 py-2 text-[11px]">Prijsregels</Link><Link href="/prijsstrategie" className="primary-action min-h-[36px] px-3 py-2 text-[11px]">Prijsstrategie</Link></div>
          </div>
          {(staleSources > 0 || failedLatestChecks > 0) ? <div className="mt-3 rounded-[10px] bg-[#fff7e8] px-3 py-2.5 text-[11px] font-medium text-[#815d1d]">Ververs eerst de prijsdata voordat je dit advies commercieel gebruikt, {staleSources} verouderde bron{staleSources === 1 ? '' : 'nen'}, {failedLatestChecks} mislukte laatste controle{failedLatestChecks === 1 ? '' : 's'}.</div> : null}
        </div>
      </section>

      <section id="concurrentieprijzen" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="ps-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#e7edf3] px-5 py-4">
            <div><h2 className="text-[15px] font-semibold text-[#24384f]">Concurrentieprijzen</h2></div>
            <span className="ps-chip ps-chip-blue">{pricedMatches.length} gemeten</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]">
              <thead className="bg-[#f6f8fb] text-left text-[10px] font-semibold text-[#758396]"><tr><th className="px-4 py-3">Concurrent</th><th className="px-4 py-3">Prijs excl. / incl.</th><th className="px-4 py-3">Vs. eigen</th><th className="px-4 py-3">Voorraad</th><th className="px-4 py-3">Gemeten</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actie</th></tr></thead>
              <tbody>
                {comparisonMatches.map((match, index) => {
                  const offer = match.competitorOffer
                  const price = numberValue(offer.normalizedPrice)
                  const competitorVatRate = numberValue(offer.competitor.country.vatRate)
                  const priceIncVat = price
                  const priceExVat = price !== null && competitorVatRate !== null ? price / (1 + competitorVatRate / 100) : price
                  const ownDeltaPct = comparisonOwnPrice !== null && priceIncVat !== null && comparisonOwnPrice > 0 ? ((priceIncVat - comparisonOwnPrice) / comparisonOwnPrice) * 100 : null
                  const latestSourceCheck = offer.priceChecks[0]
                  const sourceIssue = sourceIssueLabel(latestSourceCheck?.errorMessage)

                  return (
                    <tr key={match.id} className={`border-t border-[#edf1f5] ${price !== null && index === 0 ? 'bg-[#f1f8f4]' : 'bg-white'}`}>
                      <td className="px-4 py-3"><p className="font-semibold text-[#2d4057]">{canEditCompetitors ? <Link href={`/producten/${product.id}?concurrent=${offer.id}#concurrentieprijzen`} className="underline-offset-2 hover:text-[#2f6edb] hover:underline">{offer.competitor.name}</Link> : offer.competitor.name}</p><p className="mt-0.5 text-[10px] text-[#8a98a9]">{offer.competitor.country.name} · <a href={offer.url} target="_blank" rel="noreferrer" className="font-semibold text-[#2f6edb]">Bron</a>{canEditCompetitors ? <> · <Link href={`/producten/${product.id}?concurrent=${offer.id}#concurrentieprijzen`} className="font-semibold text-[#60758d] hover:text-[#2f6edb]">Wijzigen</Link></> : null}</p></td>
                      <td className="px-4 py-3">{price === null ? <span className="font-semibold text-[#a36816]">Nog geen prijs</span> : <><p className="font-semibold text-[#24384f]">{formatCurrency(priceExVat)} <span className="text-[8px] font-medium text-[#8a98a9]">excl.</span></p><p className="mt-0.5 text-[10px] font-semibold text-[#53677f]">{formatCurrency(priceIncVat)} <span className="text-[8px] font-medium text-[#8a98a9]">incl.</span></p></>}</td>
                      <td className={`px-4 py-3 font-semibold ${ownDeltaPct !== null && ownDeltaPct < 0 ? 'text-[#b6414d]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'text-[#20814d]' : 'text-[#708095]'}`}>{ownDeltaPct === null ? '—' : `${ownDeltaPct > 0 ? '+' : ''}${formatNumber(ownDeltaPct, 1)}%`}</td>
                      <td className="px-4 py-3"><span className="ps-chip">{offer.stockStatus ?? 'Onbekend'}</span></td>
                      <td className="px-4 py-3"><p className="font-medium text-[#44576d]">{offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Nog niet'}</p></td>
                      <td className="px-4 py-3">{latestSourceCheck ? <span className={`ps-chip ${latestSourceCheck.isSuccess ? 'ps-chip-green' : 'ps-chip-red'}`}>{latestSourceCheck.isSuccess ? 'Actueel' : 'Probleem'}</span> : <span className="ps-chip">Niet gemeten</span>}{sourceIssue ? <p className="mt-1 max-w-[150px] text-[9px] text-[#a93442]">{sourceIssue}</p> : null}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><form action={runCompetitorOfferResearchAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><PriceFetchSubmitButton compact idleLabel={latestSourceCheck ? 'Opnieuw' : 'Prijs ophalen'} pendingLabel="Ophalen…" /></form>{canEditCompetitors ? <form action={removeCompetitorOfferAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><RemoveCompetitorButton label={offer.competitor.name} /></form> : null}</div></td>
                    </tr>
                  )
                })}
                {comparisonMatches.length === 0 ? <tr><td colSpan={7} className="px-6 py-10 text-center"><p className="font-semibold text-[#42566d]">Nog geen concurrent gekoppeld</p><a href="#concurrent-bron-toevoegen" className="mt-2 inline-flex text-[11px] font-semibold text-[#2f6edb]">Concurrent koppelen</a></td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-3">
          {selectedCompetitorMatch && canEditCompetitors ? (() => {
            const selectedOffer = selectedCompetitorMatch.competitorOffer
            return (
              <div className="ps-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#74869a]">Bron wijzigen</p>
                    <h3 className="mt-1 text-[13px] font-semibold text-[#2b4057]">{selectedOffer.competitor.name}</h3>
                  </div>
                  <Link href={`/producten/${product.id}#concurrentieprijzen`} className="text-[11px] font-semibold text-[#6f8093] hover:text-[#2f6edb]">Sluiten</Link>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[#8290a1]">Pas de bron direct aan zonder het product te verlaten.</p>
                <form action={updateCompetitorOfferAction} className="mt-4 space-y-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="competitorOfferId" value={selectedOffer.id} />
                  <label className="block text-[10px] font-semibold text-[#5f7084]">Concurrent
                    <input required name="competitorName" defaultValue={selectedOffer.competitor.name} className="toolbar-control mt-1.5 w-full" />
                  </label>
                  <label className="block text-[10px] font-semibold text-[#5f7084]">Product URL
                    <input required type="url" name="offerUrl" defaultValue={selectedOffer.url} className="toolbar-control mt-1.5 w-full" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-semibold text-[#5f7084]">Eenheid
                      <input name="packagingUnit" defaultValue={selectedOffer.packagingUnit ?? product.packagingUnit ?? 'stuks'} className="toolbar-control mt-1.5 w-full" />
                    </label>
                    <label className="block text-[10px] font-semibold text-[#5f7084]">Aantal
                      <input name="packagingQty" type="number" min="1" step="1" defaultValue={selectedOffer.packagingQty ?? product.packagingQty ?? 1} className="toolbar-control mt-1.5 w-full" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-semibold text-[#5f7084]">Controlefrequentie
                    <select name="checkFrequencyHours" defaultValue={selectedOffer.competitor.checkFrequencyHours} className="toolbar-control mt-1.5 w-full">
                      <option value="6">Elke 6 uur</option>
                      <option value="12">Elke 12 uur</option>
                      <option value="24">Dagelijks</option>
                      <option value="48">Elke 2 dagen</option>
                      <option value="168">Wekelijks</option>
                      <option value="876000">Alleen handmatig</option>
                    </select>
                  </label>
                  <label className="block text-[10px] font-semibold text-[#5f7084]">Prijs bevat btw
                    <select name="vatIncluded" defaultValue={selectedOffer.vatIncluded ? 'true' : 'false'} className="toolbar-control mt-1.5 w-full">
                      <option value="true">Ja</option>
                      <option value="false">Nee</option>
                    </select>
                  </label>
                  <button type="submit" className="primary-action min-h-[40px] w-full">Wijzigingen opslaan</button>
                </form>
              </div>
            )
          })() : null}
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

      <details className="ps-panel overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 text-[13px] font-semibold text-[#34495f]">Historie en controles</summary>
        <div className="space-y-4 border-t border-[#e7edf3] p-4">
          <Suspense fallback={<AnalyticsFallback label="Prijsverloop" />}>
            <ProductPriceHistoryPanel companyId={user.companyId} productId={product.id} countryId={defaultCountry?.id} />
          </Suspense>
          <Suspense fallback={<AnalyticsFallback label="Controlehistorie" />}>
            <ProductCheckHistoryPanel companyId={user.companyId} productId={product.id} countryId={defaultCountry?.id} />
          </Suspense>
        </div>
      </details>

      <section id="concurrenten-vinden" className={`scroll-mt-24 rounded-[16px] border p-5 shadow-[0_8px_20px_rgba(20,31,55,.06)] ${reviewMatches.length ? 'border-[#c3b7f7] bg-[#f7f5ff]' : 'border-[#dce3ea] bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#253149]">Concurrenten vinden</h2>
            <p className="mt-1 text-[11px] leading-5 text-[#7b8999]">Prysight zoekt eerst op EAN. Als die online niet voorkomt, zoekt het gecontroleerd verder op productnaam, kenmerken en de gekozen markt. Kandidaten worden altijd eerst ter beoordeling klaargezet.</p>
          </div>
          {product.ean && defaultCountry ? (
            <form action={discoverCompetitorUrlsAction} className="flex shrink-0 flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <select name="countryId" defaultValue={defaultCountry.id} className="toolbar-control min-w-[150px]">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <PriceFetchSubmitButton idleLabel="Automatisch EAN zoeken" pendingLabel="Concurrenten zoeken…" />
            </form>
          ) : <span className="text-[11px] font-medium text-[#8a6a2a]">{product.ean ? 'Geen actieve markt beschikbaar.' : 'EAN ontbreekt.'}</span>}
        </div>

        {discoveryAttempted ? (
          <div className={`mt-4 rounded-[12px] border px-4 py-3 text-[11px] ${discovered > 0 ? 'border-[#9ed4b5] bg-[#eef9f2] text-[#246545]' : 'border-[#e8d3a2] bg-[#fff9eb] text-[#76591d]'}`}>
            <p className="font-semibold">
              {discovered > 0
                ? `${discovered} nieuwe concurrent${discovered === 1 ? '' : 'en'} gevonden en klaargezet voor beoordeling.`
                : discoveryAlreadyLinked > 0
                  ? `Geen nieuwe suggesties, ${discoveryAlreadyLinked} gevonden kandidaat${discoveryAlreadyLinked === 1 ? ' was' : 'en waren'} al gekoppeld.`
                  : discoveryReason || 'Geen nieuwe concurrentkandidaten gevonden.'}
            </p>
            <p className="mt-1 text-[10px] opacity-80">
              {discoveryFound} bruikbare zoekresultaten{discoveryProvider ? ` via ${discoveryProvider}` : ''}{discoveryMode === 'PRODUCT' ? ', EAN gaf geen bruikbare resultaten dus productherkenning is als tweede stap gebruikt.' : discoveryMode === 'EAN' ? ', gevonden via EAN.' : '.'}
            </p>
          </div>
        ) : null}

        {reviewMatches.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{reviewMatches.map((match) => <div key={match.id} className="rounded-[12px] border border-[#d8d2f6] bg-white p-3"><div className="flex items-start justify-between gap-3"><a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-[#253149]">{match.competitorOffer.competitor.name}</p><p className="mt-1 max-w-[260px] truncate text-[9px] text-[#697386]">{match.competitorOffer.url}</p></a><div className="flex items-center gap-2"><span className="ps-chip ps-chip-blue">AI {formatNumber(match.confidenceScore)}%</span>{canEditCompetitors ? <form action={removeCompetitorOfferAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={match.competitorOffer.id} /><RemoveCompetitorButton label={match.competitorOffer.competitor.name} /></form> : null}</div></div></div>)}</div> : null}
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-[#252a37]">Marktprofielen</h2>
            <span className="text-[10px] font-semibold text-[#7b8999]">{product.productMarkets.length}</span>
          </div>
          <div className="mt-3 space-y-2">{product.productMarkets.length === 0 ? <p className="rounded-[10px] bg-[#eef1f7] px-3 py-3 text-[10px] text-[#697386]">Nog geen marktprofielen.</p> : product.productMarkets.map((market) => {
            const marketPrice = numberValue(market.ownPrice)
            const marketVatRate = numberValue(market.country.vatRate)
            const marketExVat = marketPrice !== null && marketVatRate !== null
              ? market.vatIncluded ? marketPrice / (1 + marketVatRate / 100) : marketPrice
              : marketPrice
            const marketIncVat = marketPrice !== null && marketVatRate !== null
              ? market.vatIncluded ? marketPrice : marketPrice * (1 + marketVatRate / 100)
              : marketPrice
            return <Link key={market.id} href={`/producten/${product.id}?land=${market.countryId}`} className={`flex items-center justify-between gap-3 rounded-[10px] px-3 py-3 transition ${defaultCountry?.id === market.countryId ? 'bg-[#edf4ff]' : 'bg-[#f4f6fa] hover:bg-[#eef2f7]'}`}><div><p className="text-[11px] font-semibold text-[#303647]">{market.country.name}</p><p className="mt-0.5 text-[9px] text-[#697386]">{market.stockStatus ?? 'Voorraad onbekend'}</p></div><div className="text-right"><p className="text-[10px] font-semibold text-[#303647]">{formatCurrency(marketExVat, market.currency)} <span className="text-[8px] font-medium text-[#8793a3]">excl.</span></p><p className="mt-0.5 text-[10px] font-semibold text-[#53677f]">{formatCurrency(marketIncVat, market.currency)} <span className="text-[8px] font-medium text-[#8793a3]">incl.</span></p></div></Link>
          })}</div>
        </div>
      </section>
    </div>
  )
}
