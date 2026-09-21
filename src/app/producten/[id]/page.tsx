export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, discoverCompetitorUrlsAction, removeCompetitorOfferAction, runCompetitorOfferResearchAction, updateCompetitorOfferAction, updateProductOwnPriceAction } from '@/app/actions/productActions'
import { approveMatchAction } from '@/app/actions/matchActions'
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

function frequencyLabel(hours: number) {
  if (hours >= 876000) return 'Alleen handmatig'
  if (hours <= 6) return 'Elke 6 uur'
  if (hours <= 12) return 'Elke 12 uur'
  if (hours <= 24) return 'Dagelijks'
  if (hours <= 48) return 'Elke 2 dagen'
  if (hours <= 168) return 'Wekelijks'
  return `Elke ${hours} uur`
}

function nextCrawlLabel(lastCheckedAt: Date | null | undefined, hours: number) {
  if (hours >= 876000) return 'Alleen handmatig'
  if (!lastCheckedAt) return 'Klaar voor automatische controle'
  const next = new Date(lastCheckedAt.getTime() + hours * 60 * 60 * 1000)
  if (next.getTime() <= Date.now()) return 'Klaar voor automatische controle'
  return `Volgende rond ${next.toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

function isCrawlDue(lastCheckedAt: Date | null | undefined, hours: number) {
  if (hours >= 876000) return false
  if (!lastCheckedAt) return true
  return Date.now() - lastCheckedAt.getTime() >= hours * 60 * 60 * 1000
}

function isOutOfStock(value: string | null | undefined) {
  return /niet op voorraad|out of stock|uitverkocht|sold out/i.test(value ?? '')
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

  const requestedCountryId = readParam(query.markt) ?? readParam(query.land)
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
  const historyOfferId = readParam(query.historie)
  const highlightedHistoryMatch = historyOfferId
    ? comparisonMatches.find((match) => match.competitorOffer.id === historyOfferId) ?? null
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
  const comparisonOwnPriceExVat = ownPrice !== null && vatRate !== null
    ? marketVatIncluded ? ownPrice / (1 + vatRate / 100) : ownPrice
    : ownPrice
  const comparisonOwnPrice = ownPrice !== null && vatRate !== null
    ? marketVatIncluded ? ownPrice : ownPrice * (1 + vatRate / 100)
    : ownPrice
  const averageDifferencePct = comparisonOwnPrice !== null && averagePrice !== null && averagePrice > 0 ? ((comparisonOwnPrice - averagePrice) / averagePrice) * 100 : null
  const automaticMatches = crawlableMatches.filter((match) => match.competitorOffer.competitor.checkFrequencyHours < 876000)
  const automaticDue = automaticMatches.filter((match) => isCrawlDue(
    match.competitorOffer.lastCheckedAt,
    match.competitorOffer.competitor.checkFrequencyHours,
  )).length
  const competitorOutOfStock = confirmedMatches.filter((match) => isOutOfStock(match.competitorOffer.stockStatus)).length
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
            {defaultCountry ? (
              <MarketProfileSelector
                countries={countries.map((country) => ({ id: country.id, name: country.name }))}
                value={defaultCountry.id}
                paramName="markt"
                compact
              />
            ) : null}
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
          </div>
          {defaultCountry ? <span className="ps-chip ps-chip-blue">{defaultCountry.name}</span> : <span className="ps-chip">Algemeen</span>}
        </div>
        <div className="grid gap-0 lg:grid-cols-[.48fr_1.52fr]">
          <div className="border-b border-[#e7edf3] bg-[#f8fbff] px-5 py-4 sm:px-6 lg:border-b-0 lg:border-r">
            <p className="text-[28px] font-semibold tracking-[-0.03em] text-[#1e2d3f]">{formatCurrency(ownPrice, ownCurrency)}</p>
            <p className="mt-1 text-[10px] text-[#7b8999]">{product.vatIncluded ? 'Inclusief btw' : 'Exclusief btw'} · {selectedMarket?.stockStatus ?? product.stockStatus ?? 'Voorraad onbekend'}</p>
            {ownPrice === null ? <p className="mt-3 rounded-[9px] bg-[#fff6e4] px-3 py-2 text-[11px] font-semibold text-[#9a6810]">Voeg eerst je eigen prijs toe om marktverschillen en prijsadvies correct te berekenen.</p> : null}
          </div>
          <div className="p-5 sm:p-6">
            {canEditProduct ? (
              <form action={updateProductOwnPriceAction} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="productId" value={product.id} />
                {defaultCountry ? <input type="hidden" name="countryId" value={defaultCountry.id} /> : null}
                <input type="hidden" name="currency" value={ownCurrency} />
                <label className="text-[11px] font-semibold text-[#4f5869]">Jouw verkoopprijs *
                  <div className="mt-1.5 flex items-center rounded-[7px] border border-[#cbd9eb] bg-white focus-within:border-[#8cb1f3] focus-within:shadow-[0_0_0_3px_rgba(79,134,232,.09)]">
                    <span className="px-3 text-[11px] font-semibold text-[#64748b]">{ownCurrency}</span>
                    <input name="ownPrice" required inputMode="decimal" defaultValue={ownPrice ?? ''} className="min-h-[44px] flex-1 border-0 bg-transparent px-0 pr-3 text-[15px] font-semibold shadow-none outline-none focus:shadow-none" placeholder="0,00" />
                  </div>
                </label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Btw status<select name="vatIncluded" defaultValue={String(product.vatIncluded)} className="toolbar-control mt-1.5 w-full"><option value="true">Inclusief btw</option><option value="false">Exclusief btw</option></select></label>
                <label className="text-[11px] font-semibold text-[#4f5869]">Voorraadstatus<input name="stockStatus" defaultValue={selectedMarket?.stockStatus ?? product.stockStatus ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
                {defaultCountry ? <label className="text-[11px] font-semibold text-[#4f5869] md:col-span-2">Jouw product URL<input name="ownUrl" type="url" defaultValue={selectedMarket?.ownUrl ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="https://jouwwebshop.nl/product/..." /></label> : null}
                <div className="md:col-span-2 flex justify-end">
                  <button type="submit" className="primary-action shrink-0">Opslaan</button>
                </div>
              </form>
            ) : <p className="text-[11px] text-[#7b8999]">Je hebt alleen-lezen toegang tot productprijzen.</p>}
          </div>
        </div>
      </section>

      <section className="ps-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#21364d]">Marktpositie</h2>
            <p className="mt-1 text-[10px] text-[#7f8ea0]">Prijsafstand, positie, voorraad en automatische monitoring in één overzicht.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {defaultCountry ? <span className="ps-chip ps-chip-blue">{defaultCountry.name}</span> : null}
            {latestCheck ? <span className="text-[10px] text-[#8793a3]">Laatste meting {formatDate(latestCheck)}</span> : null}
          </div>
        </div>

        <div className="grid divide-y divide-[#e7edf3] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8391a1]">Jouw prijs</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#21364d]">{formatCurrency(comparisonOwnPrice, ownCurrency)}</p>
            <p className="mt-1 text-[10px] text-[#8793a3]">{comparisonOwnPriceExVat === null ? 'Excl. btw onbekend' : `${formatCurrency(comparisonOwnPriceExVat, ownCurrency)} excl. btw`}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8391a1]">Marktgemiddelde</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#21364d]">{formatCurrency(averagePrice)}</p>
            <p className="mt-1 text-[10px] text-[#8793a3]">Laag {formatCurrency(lowestPrice)} · Hoog {formatCurrency(highestPrice)}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8391a1]">Prijspositie</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#21364d]">{marketPosition === null ? '—' : `#${marketPosition}`}</p>
            <div className="mt-2 flex max-w-[150px] gap-1">
              {Array.from({ length: Math.min(Math.max(competitorCount + 1, 1), 8) }).map((_, index) => (
                <span key={index} className={`h-1.5 flex-1 rounded-full ${marketPosition !== null && index + 1 === Math.min(marketPosition, 8) ? 'bg-[#2f6edb]' : 'bg-[#dce4ed]'}`} />
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-[#8793a3]">{competitorCount} concurrent{competitorCount === 1 ? '' : 'en'} met prijs</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8391a1]">Smart price</p>
            <p className={`mt-1 text-[24px] font-semibold tracking-[-0.02em] ${adviceTone}`}>{formatCurrency(recommendedPrice)}</p>
            <p className={`mt-1 text-[10px] font-medium ${adviceTone}`}>{actionLabel(recommendation?.action)}{adviceChange !== null ? ` · ${adviceChange > 0 ? '+' : ''}${formatNumber(adviceChange, 1)}%` : ''}</p>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8391a1]">Monitoring</p>
              <span className={`h-2 w-2 rounded-full ${automaticMatches.length ? 'bg-[#2a9d63]' : 'bg-[#b8c2ce]'}`} />
            </div>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#21364d]">{automaticMatches.length}</p>
            <p className="mt-1 text-[10px] text-[#8793a3]">{automaticMatches.length ? `${automaticDue} bron${automaticDue === 1 ? '' : 'nen'} nu klaar voor automatische controle` : 'Geen automatische bron ingesteld'}</p>
            {competitorOutOfStock > 0 ? <p className="mt-1 text-[10px] font-semibold text-[#a44a55]">{competitorOutOfStock} concurrent{competitorOutOfStock === 1 ? '' : 'en'} niet op voorraad</p> : null}
          </div>
        </div>

        <div className="border-t border-[#e7edf3] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <details className="max-w-4xl text-[11px] text-[#66778a]">
              <summary className="cursor-pointer font-semibold text-[#2f6edb]">Prijsadvies en margedetails</summary>
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
            <table className="w-full min-w-[1180px] border-collapse text-[11px]">
              <thead className="bg-[#f6f8fb] text-left text-[10px] font-semibold text-[#758396]">
                <tr>
                  <th className="px-4 py-3">Concurrent</th>
                  <th className="px-4 py-3">Incl. btw</th>
                  <th className="px-4 py-3">Excl. btw</th>
                  <th className="px-4 py-3">Afstand tot jouw prijs</th>
                  <th className="px-4 py-3">Positie</th>
                  <th className="px-4 py-3">Voorraad</th>
                  <th className="px-4 py-3">Laatste crawl</th>
                  <th className="px-4 py-3">Acties</th>
                </tr>
              </thead>
              <tbody>
                {comparisonMatches.map((match, index) => {
                  const offer = match.competitorOffer
                  const price = numberValue(offer.normalizedPrice)
                  const competitorVatRate = numberValue(offer.competitor.country.vatRate)
                  const priceExVat = price !== null && competitorVatRate !== null ? price / (1 + competitorVatRate / 100) : null
                  const deltaAmount = comparisonOwnPrice !== null && price !== null ? price - comparisonOwnPrice : null
                  const ownDeltaPct = comparisonOwnPrice !== null && price !== null && comparisonOwnPrice > 0 ? ((price - comparisonOwnPrice) / comparisonOwnPrice) * 100 : null
                  const competitorPosition = price !== null ? prices.filter((candidate) => candidate < price).length + 1 : null
                  const latestSourceCheck = offer.priceChecks[0]
                  const sourceIssue = sourceIssueLabel(latestSourceCheck?.errorMessage)
                  const distanceWidth = ownDeltaPct === null ? 0 : Math.min(Math.abs(ownDeltaPct), 100)
                  const distanceTone = ownDeltaPct !== null && ownDeltaPct < 0 ? 'text-[#b6414d]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'text-[#20814d]' : 'text-[#708095]'
                  const distanceBar = ownDeltaPct !== null && ownDeltaPct < 0 ? 'bg-[#cf5967]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'bg-[#3da16a]' : 'bg-[#91a0b2]'
                  const frequencyHours = offer.competitor.checkFrequencyHours

                  return (
                    <tr key={match.id} className={`border-t border-[#edf1f5] ${price !== null && index === 0 ? 'bg-[#f3faf6]' : 'bg-white'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2d4057]">{canEditCompetitors ? <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&concurrent=${offer.id}#concurrentieprijzen`} className="underline-offset-2 hover:text-[#2f6edb] hover:underline">{offer.competitor.name}</Link> : offer.competitor.name}</p>
                            <p className="mt-0.5 text-[10px] text-[#8a98a9]">{offer.competitor.country.name} · <a href={offer.url} target="_blank" rel="noreferrer" className="font-semibold text-[#2f6edb]">Bron</a></p>
                          </div>
                          {price !== null && index === 0 ? <span className="ps-chip ps-chip-green shrink-0">Laagste</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3"><p className="font-semibold text-[#24384f]">{price === null ? <span className="text-[#a36816]">Nog geen prijs</span> : formatCurrency(price)}</p><p className="mt-0.5 text-[9px] text-[#8a98a9]">Genormaliseerd</p></td>
                      <td className="px-4 py-3"><p className="font-semibold text-[#44576d]">{formatCurrency(priceExVat)}</p><p className="mt-0.5 text-[9px] text-[#8a98a9]">{competitorVatRate === null ? 'Btw onbekend' : `${formatNumber(competitorVatRate, 1)}% btw`}</p></td>
                      <td className="px-4 py-3">
                        <p className={`font-semibold ${distanceTone}`}>{deltaAmount === null || ownDeltaPct === null ? '—' : `${deltaAmount > 0 ? '+' : ''}${formatCurrency(deltaAmount)} · ${ownDeltaPct > 0 ? '+' : ''}${formatNumber(ownDeltaPct, 1)}%`}</p>
                        <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-[#e7edf3]"><div className={`h-full rounded-full ${distanceBar}`} style={{ width: `${distanceWidth}%` }} /></div>
                        {ownDeltaPct !== null ? <p className="mt-1 text-[9px] text-[#8a98a9]">{ownDeltaPct < 0 ? 'Concurrent goedkoper' : ownDeltaPct > 0 ? 'Concurrent duurder' : 'Gelijke prijs'}</p> : null}
                      </td>
                      <td className="px-4 py-3"><p className="font-semibold text-[#33485f]">{competitorPosition === null ? '—' : `#${competitorPosition} / ${pricedMatches.length}`}</p></td>
                      <td className="px-4 py-3"><span className={`ps-chip ${isOutOfStock(offer.stockStatus) ? 'ps-chip-red' : offer.stockStatus ? 'ps-chip-green' : ''}`}>{offer.stockStatus ?? 'Onbekend'}</span></td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#44576d]">{offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Nog niet'}</p>
                        <p className="mt-1 text-[9px] text-[#8793a3]">{frequencyLabel(frequencyHours)}</p>
                        <p className="mt-0.5 text-[9px] font-medium text-[#60758d]">{nextCrawlLabel(offer.lastCheckedAt, frequencyHours)}</p>
                        {sourceIssue ? <p className="mt-1 max-w-[170px] text-[9px] text-[#a93442]">{sourceIssue}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&historie=${offer.id}#historie`} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">Historie</Link>
                          {canEditCompetitors ? <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&concurrent=${offer.id}#concurrentieprijzen`} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">Wijzigen</Link> : null}
                          <form action={runCompetitorOfferResearchAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><PriceFetchSubmitButton compact idleLabel={latestSourceCheck ? 'Nu crawlen' : 'Prijs ophalen'} pendingLabel="Ophalen…" /></form>
                          {canEditCompetitors ? <form action={removeCompetitorOfferAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><RemoveCompetitorButton label={offer.competitor.name} /></form> : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {comparisonMatches.length === 0 ? <tr><td colSpan={8} className="px-6 py-10 text-center"><p className="font-semibold text-[#42566d]">Nog geen concurrent gekoppeld voor deze markt</p><a href="#concurrent-bron-toevoegen" className="mt-2 inline-flex text-[11px] font-semibold text-[#2f6edb]">Concurrent koppelen</a></td></tr> : null}
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
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[12px] font-semibold text-[#34495f]">Automatisch crawlen</h3>
              <span className={`ps-chip ${automaticMatches.length ? 'ps-chip-green' : ''}`}>{automaticMatches.length ? 'Ingesteld' : 'Uit'}</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#7d8b9a]">De monitor controleert elk uur welke bron volgens de ingestelde frequentie aan de beurt is. Handmatig crawlen blijft altijd mogelijk.</p>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Automatische bronnen</span><strong>{automaticMatches.length}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Nu aan de beurt</span><strong className={automaticDue ? 'text-[#a36816]' : 'text-[#20814d]'}>{automaticDue}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[#7d8b9a]">Handmatig</span><strong>{crawlableMatches.length - automaticMatches.length}</strong></div>
            </div>
          </div>
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

      <section id="historie" className="scroll-mt-24 space-y-3">
        {highlightedHistoryMatch ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-[#cbdcf5] bg-[#f5f9ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6f84a0]">Historie focus</p>
              <p className="mt-0.5 text-[12px] font-semibold text-[#2e4661]">{highlightedHistoryMatch.competitorOffer.competitor.name}</p>
            </div>
            <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}#historie`} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">Alle concurrenten tonen</Link>
          </div>
        ) : null}
        <Suspense fallback={<AnalyticsFallback label="Prijsverloop" />}>
          <ProductPriceHistoryPanel companyId={user.companyId} productId={product.id} countryId={defaultCountry?.id ?? null} highlightedCompetitorId={highlightedHistoryMatch?.competitorOffer.competitorId ?? null} />
        </Suspense>
        <details className="ps-panel overflow-hidden">
          <summary className="cursor-pointer px-5 py-4 text-[13px] font-semibold text-[#34495f]">Technische controlehistorie</summary>
          <div className="border-t border-[#e7edf3] p-4">
            <Suspense fallback={<AnalyticsFallback label="Controlehistorie" />}>
              <ProductCheckHistoryPanel companyId={user.companyId} productId={product.id} />
            </Suspense>
          </div>
        </details>
      </section>

      <section id="concurrenten-vinden" className={`scroll-mt-24 rounded-[16px] border p-5 shadow-[0_8px_20px_rgba(20,31,55,.06)] ${reviewMatches.length ? 'border-[#c3b7f7] bg-[#f7f5ff]' : 'border-[#dce3ea] bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#253149]">Concurrenten vinden</h2>
            <p className="mt-1 text-[11px] leading-5 text-[#7b8999]">Bij het opvoeren van een product zoekt Prysight automatisch op EAN binnen de gekozen markt. Hier kun je opnieuw zoeken, een suggestie direct gebruiken of met het kruis verwijderen.</p>
          </div>
          {product.ean && defaultCountry ? (
            <form action={discoverCompetitorUrlsAction} className="flex shrink-0 flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <select name="countryId" defaultValue={defaultCountry.id} className="toolbar-control min-w-[150px]">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <PriceFetchSubmitButton idleLabel="Opnieuw concurrenten zoeken" pendingLabel="Concurrenten zoeken…" />
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

        {reviewMatches.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{reviewMatches.map((match) => <div key={match.id} className="rounded-[12px] border border-[#d8d2f6] bg-white p-3"><div className="flex items-start justify-between gap-3"><a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-[#253149]">{match.competitorOffer.competitor.name}</p><p className="mt-1 text-[9px] font-medium text-[#7d8b9a]">{match.competitorOffer.competitor.country.name}</p><p className="mt-1 max-w-[260px] truncate text-[9px] text-[#697386]">{match.competitorOffer.url}</p></a><div className="flex items-center gap-2"><span className="ps-chip ps-chip-blue">AI {formatNumber(match.confidenceScore)}%</span>{canEditCompetitors ? <form action={removeCompetitorOfferAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={match.competitorOffer.id} /><RemoveCompetitorButton label={match.competitorOffer.competitor.name} /></form> : null}</div></div>{canEditCompetitors ? <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf1f5] pt-3"><a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#60758d] hover:text-[#2f6edb]">Bron bekijken</a><form action={approveMatchAction.bind(null, match.id)}><button type="submit" className="primary-action min-h-[34px] px-3 py-1.5 text-[10px]">Gebruiken en prijs ophalen</button></form></div> : null}</div>)}</div> : null}
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
