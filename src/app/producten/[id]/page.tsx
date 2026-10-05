export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addCompetitorOfferAction, discoverCompetitorUrlsAction, removeCompetitorOfferAction, runCompetitorOfferResearchAction, refreshProductIntelligenceAction, verifyBricoPraxisPricesAction, updateCompetitorOfferAction, updateProductIdentifiersAction, updateProductOwnPriceAction } from '@/app/actions/productActions'
import { approveMatchAction } from '@/app/actions/matchActions'
import { ProductCheckHistoryPanel } from '@/components/ProductCheckHistoryPanel'
import { EanPriceSuggestions } from '@/components/EanPriceSuggestions'
import { OwnProductSyncSettings } from '@/components/OwnProductSyncSettings'
import { ownProductSourceKey } from '@/lib/own-product-url-sync'
import { ProductPriceHistoryPanel } from '@/components/ProductPriceHistoryPanel'
import { PriceFetchSubmitButton } from '@/components/PriceFetchSubmitButton'
import { RemoveCompetitorButton } from '@/components/RemoveCompetitorButton'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { selectedMarketCode } from '@/lib/market-context'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { getPricingRecommendations } from '@/lib/pricing-engine'
import { prisma } from '@/lib/prisma'
import { calculateDeliveredAmounts } from '@/lib/manual-price-input'
import { evaluateSourceVerification } from '@/lib/competitor-source-verification'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function numberValue(value: unknown) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function readableProductText(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text || !/[a-zà-ÿ]{2,}/i.test(text)) return null
  return text
}

function feedDisplayName(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  for (const key of ['Nieuwe Titel', 'Product naam', 'Product Name', 'Title', 'Oude titel', 'catalog_product_attribute.meta_title NEW', 'catalog_product_attribute.meta_title']) {
    const candidate = readableProductText(record[key])
    if (candidate) return candidate
  }
  return null
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


function isCrawlDue(nextCheckAt: Date | null | undefined, lastCheckedAt: Date | null | undefined, hours: number) {
  if (hours >= 876000) return false
  if (nextCheckAt) return nextCheckAt.getTime() <= Date.now()
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

  const [product, countries, pricing, feedContext, manualContent] = await Promise.all([
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
    prisma.feedItem.findFirst({
      where: { companyId: user.companyId, importedProductId: id },
      orderBy: { updatedAt: 'desc' },
      select: { rawData: true, mappedData: true },
    }).catch((error) => {
      // Feed enrichment is optional; a failed feed lookup must not take down the product page.
      console.error('Optional product feed context unavailable', { companyId: user.companyId, productId: id, error })
      return null
    }),
    prisma.feedItem.findFirst({
      where: { companyId: user.companyId, importedProductId: id, feedSource: { sourceKey: 'manual:prysight' } },
      orderBy: { updatedAt: 'desc' }, select: { mappedData: true },
    }).catch((error) => {
      console.warn('Optional product content unavailable', { companyId: user.companyId, productId: id, error })
      return null
    }),
  ])

  if (!product) notFound()

  const marketCode = await selectedMarketCode(user.companyId)
  const requestedCountryId = readParam(query.markt)
  const defaultCountry = countries.find((country) => country.id === requestedCountryId && product.productMarkets.some((market) => market.countryId === country.id))
    ?? countries.find((country) => country.code.toUpperCase() === marketCode)
    ?? countries.find((country) => product.productMarkets.some((market) => market.countryId === country.id))
    ?? countries.find((country) => country.code === 'NL')
    ?? countries[0]
  const selectedMarket = defaultCountry ? product.productMarkets.find((market) => market.countryId === defaultCountry.id) ?? null : null
  const ownSyncSource = defaultCountry ? await prisma.feedSource.findUnique({
    where: { companyId_sourceKey: { companyId: user.companyId, sourceKey: ownProductSourceKey(product.id, defaultCountry.id) } },
    select: { id: true, url: true, syncFrequencyHours: true, lastRunStatus: true, lastRunAt: true, syncError: true },
  }) : null
  const canEditProduct = user.role === 'SUPER_ADMIN' || user.permissions.includes('products.write')
  const canEditCompetitors = user.role === 'SUPER_ADMIN' || user.permissions.includes('competitors.write')
  const canVerifySources = user.role === 'SUPER_ADMIN' || user.permissions.includes('pricing.manage')
  const hasReadableProductName = /[a-zà-ÿ]{2,}/i.test(product.name)
  const feedName = feedDisplayName(feedContext?.rawData) ?? feedDisplayName(feedContext?.mappedData)
  const displayProductName = hasReadableProductName ? product.name : feedName ?? `Artikel ${product.articleNumber}`
  const productNameNeedsAttention = !hasReadableProductName && !feedName
  const manualRecord = manualContent?.mappedData && typeof manualContent.mappedData === 'object' && !Array.isArray(manualContent.mappedData)
    ? manualContent.mappedData as Record<string, unknown> : null
  const feedRecord = feedContext?.mappedData && typeof feedContext.mappedData === 'object' && !Array.isArray(feedContext.mappedData)
    ? feedContext.mappedData as Record<string, unknown> : null
  const productDescription = readableProductText(manualRecord?.description) ?? readableProductText(feedRecord?.description)
  const productImageUrl = [manualRecord?.imageUrl, feedRecord?.imageUrl].find((value) => {
    if (typeof value !== 'string') return false
    try { return new URL(value).protocol === 'https:' } catch { return false }
  }) as string | undefined
  const marketMatches = product.matches.filter((match) => match.competitorOffer.competitor.isActive && (!defaultCountry || match.competitorOffer.competitor.countryId === defaultCountry.id))
  const retailerCandidates = [...marketMatches].sort((a, b) =>
    Number(b.matchStatus === 'CERTAIN') - Number(a.matchStatus === 'CERTAIN') ||
    a.competitorOffer.id.localeCompare(b.competitorOffer.id))
  const retailerVerificationMatches = ['brico', 'praxis'].map((retailer) =>
    retailerCandidates.find((match) =>
      match.competitorOffer.isActive &&
      match.competitorOffer.competitor.name.trim().toLowerCase() === retailer &&
      (match.matchStatus === 'CERTAIN' || match.matchStatus === 'REVIEW'),
    ) ?? null,
  )
  const verificationRequested = readParam(query.verificatie)
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
  const latestCheck = crawlableMatches.map((match) => match.competitorOffer.lastCheckedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const ownPrice = numberValue(selectedMarket?.ownPrice ?? product.ownPrice)
  const ownCurrency = selectedMarket?.currency ?? product.currency
  const vatRate = numberValue(defaultCountry?.vatRate)
  const ownVatIncluded = selectedMarket?.vatIncluded ?? product.vatIncluded
  const ownShippingCost = numberValue(selectedMarket ? selectedMarket.ownShippingCost : product.ownShippingCost)
  const ownShippingVatIncluded = selectedMarket?.ownShippingVatIncluded ?? product.ownShippingVatIncluded ?? true
  const ownAmounts = calculateDeliveredAmounts({
    price: ownPrice, priceVatIncluded: ownVatIncluded,
    shipping: ownShippingCost, shippingVatIncluded: ownShippingVatIncluded, vatRate,
  })
  const comparisonOwnPrice = ownAmounts.priceInc
  const comparisonOwnPriceExVat = ownAmounts.priceEx
  const automaticMatches = crawlableMatches.filter((match) => match.competitorOffer.competitor.checkFrequencyHours < 876000)
  const automaticDue = automaticMatches.filter((match) => isCrawlDue(
    match.competitorOffer.nextCheckAt,
    match.competitorOffer.lastCheckedAt,
    match.competitorOffer.competitor.checkFrequencyHours,
  )).length
  const competitorOutOfStock = confirmedMatches.filter((match) => isOutOfStock(match.competitorOffer.stockStatus)).length
  const staleSources = crawlableMatches.filter((match) => isStalePriceSource(match.competitorOffer.lastCheckedAt)).length
  const failedLatestChecks = crawlableMatches.filter((match) => match.competitorOffer.priceChecks[0] && !match.competitorOffer.priceChecks[0].isSuccess).length
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
  const firstPriceCheck = readParam(query.prijscontrole)
  const discoveryAttempted = query.suggesties !== undefined
  const priceUpdated = readParam(query.prijs) === 'bijgewerkt'
  const identifiersUpdated = readParam(query.identiteit) === 'bijgewerkt'
  const duplicateRedirect = readParam(query.dubbel) === '1'
  const sourceUpdated = readParam(query.bron) === 'bijgewerkt'
  const intelligenceUpdated = readParam(query.intelligence) === 'updated'
  const intelligenceCreated = Number(readParam(query.nieuw) ?? '0') || 0
  const intelligencePrices = Number(readParam(query.prijzen) ?? '0') || 0
  const intelligenceErrors = Number(readParam(query.fouten) ?? '0') || 0
  const controlSummaryText = controlSummary(controlMessage)
  const sourceControlSummaryText = controlSummary(sourceControlMessage)
  const pricedComparisonMatches = comparisonMatches.filter((match) => numberValue(match.competitorOffer.normalizedPrice) !== null)
  const missingPriceMatches = comparisonMatches.filter((match) => numberValue(match.competitorOffer.normalizedPrice) === null)
  const sourceProblemMatches = crawlableMatches.filter((match) => {
    const latest = match.competitorOffer.priceChecks[0]
    return isStalePriceSource(match.competitorOffer.lastCheckedAt) || Boolean(latest && !latest.isSuccess)
  })
  const sourceProblemCount = sourceProblemMatches.length
  const adviceReady = sourceProblemCount === 0 && reviewMatches.length === 0 && pricedComparisonMatches.length > 0

  return (
    <div className="space-y-5 pb-10">
      <div className="space-y-2">
        {intelligenceUpdated && (intelligencePrices > 0 || intelligenceCreated > 0 || intelligenceErrors > 0) ? (
          <div className={'rounded-[10px] border px-4 py-2.5 text-[11px] font-medium ' + (intelligencePrices > 0 || intelligenceCreated > 0 ? 'border-[#cce8d9] bg-[#f3fbf7] text-[#176a42]' : 'border-[#f1dfb8] bg-[#fff9ed] text-[#76591d]')}>
            {intelligencePrices > 0 || intelligenceCreated > 0
              ? <>{intelligenceCreated} nieuwe bronnen, {intelligencePrices} prijzen bijgewerkt.</>
              : <>{intelligenceErrors} prijscontroles mislukt.</>}
          </div>
        ) : null}
        {duplicateRedirect ? <div className="rounded-[10px] border border-[#f1dfb8] bg-[#fff9ed] px-4 py-2.5 text-[11px] font-medium text-[#76591d]">Dit product bestond al. Je werkt nu verder in het bestaande product.</div> : null}
        {priceUpdated ? <div className="rounded-[10px] border border-[#cce8d9] bg-[#f3fbf7] px-4 py-2.5 text-[11px] font-medium text-[#176a42]">Verkoopprijs bijgewerkt.</div> : null}
        {identifiersUpdated ? <div className="rounded-[10px] border border-[#cce8d9] bg-[#f3fbf7] px-4 py-2.5 text-[11px] font-medium text-[#176a42]">Productherkenning bijgewerkt en concurrentzoekactie opnieuw uitgevoerd.</div> : null}
        {sourceUpdated ? <div className="rounded-[10px] border border-[#cce8d9] bg-[#f3fbf7] px-4 py-2.5 text-[11px] font-medium text-[#176a42]">Concurrentbron bijgewerkt.</div> : null}
        {crawlStatus === 'geen-bron' ? <div className="rounded-[10px] border border-[#f1dfb8] bg-[#fff9ed] px-4 py-2.5 text-[11px] font-medium text-[#76591d]">Koppel eerst een concurrentbron.</div> : null}
        {crawlStatus === 'mislukt' ? <div className="rounded-[10px] border border-[#efcdd2] bg-[#fff3f4] px-4 py-2.5 text-[11px] font-medium text-[#963845]">Prijscontrole mislukt. De bestaande bevestigde prijs blijft ongewijzigd.</div> : null}
        {(readParam(query.toegevoegd) || readParam(query.bron) === 'toegevoegd' || controlMessage || sourceControlMessage) ? (
          <div className="rounded-[10px] border border-[#cce8d9] bg-[#f3fbf7] px-4 py-2.5 text-[11px] font-medium text-[#176a42]">
            {readParam(query.toegevoegd)
              ? <>Product toegevoegd{discovered > 0 ? <>, {discovered} suggesties gevonden{firstPriceCheck === 'gestart' ? ', eerste prijscontroles gestart' : ''}</> : null}.</>
              : readParam(query.bron) === 'toegevoegd'
                ? 'Concurrentbron gekoppeld.'
                : sourceControlMessage
                  ? sourceControlSummaryText
                  : controlSummaryText}
          </div>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-[18px] border border-[#dfe6ee] bg-white shadow-[0_10px_32px_rgba(31,49,77,.055)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#7c8ba0]">
              <Link href="/producten" className="transition hover:text-[#315fa7]">Producten</Link>
              <span aria-hidden="true">/</span>
              <span>{defaultCountry?.name ?? 'Markt'}</span>
              <span className="h-1 w-1 rounded-full bg-[#c3ccd8]" />
              <span>Artikel {product.articleNumber}</span>
              {product.ean ? <><span className="h-1 w-1 rounded-full bg-[#c3ccd8]" /><span>EAN {product.ean}</span></> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="max-w-5xl text-[25px] font-semibold leading-[1.2] tracking-[-0.025em] text-[#172a42] sm:text-[29px]">{displayProductName}</h1>
              {productNameNeedsAttention ? <span className="ps-chip ps-chip-amber">Naam controleren</span> : null}
            </div>
            {productDescription ? <p className="mt-2 max-w-4xl line-clamp-2 text-[12px] leading-5 text-[#687b91]">{productDescription}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[#6f8095]">
              <span>{selectedMarket?.stockStatus ?? product.stockStatus ?? 'Voorraad onbekend'}</span>
              {latestCheck ? <><span className="h-1 w-1 rounded-full bg-[#c3ccd8]" /><span>Laatste meting {formatDate(latestCheck)}</span></> : null}
              {productImageUrl ? <><span className="h-1 w-1 rounded-full bg-[#c3ccd8]" /><a href={productImageUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#315fa7]">Productafbeelding</a></> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '&instellingen=1#eigen-prijs'} className="secondary-action">Product wijzigen</Link>
            {canEditCompetitors && defaultCountry ? (
              <form action={refreshProductIntelligenceAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="countryId" value={defaultCountry.id} />
                <PriceFetchSubmitButton idleLabel="Prijzen vernieuwen" pendingLabel="Prijzen vernieuwen…" />
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section id="concurrentieprijzen" className="min-w-0 overflow-hidden rounded-[16px] border border-[#dfe6ee] bg-white shadow-[0_6px_22px_rgba(31,49,77,.04)]">
          <div className="flex flex-col gap-3 border-b border-[#e8edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[#21364d]">Prijsvergelijking</h2>
                {defaultCountry ? <span className="ps-chip ps-chip-blue">{defaultCountry.name}</span> : null}
              </div>
              <p className="mt-1 text-[10px] text-[#7c8ba0]">{pricedComparisonMatches.length} bruikbare prijzen, {missingPriceMatches.length} bronnen vragen aandacht</p>
            </div>
            {canEditCompetitors && defaultCountry ? (
              <form action={refreshProductIntelligenceAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="countryId" value={defaultCountry.id} />
                <PriceFetchSubmitButton compact idleLabel="Alles vernieuwen" pendingLabel="Vernieuwen…" />
              </form>
            ) : null}
          </div>

          <div className="grid grid-cols-2 border-b border-[#e8edf3] bg-[#fbfcfe] sm:grid-cols-4">
            <div className="px-5 py-3.5 sm:px-6">
              <p className="text-[9px] font-medium text-[#8a97a7]">Jouw prijs</p>
              <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#21364d]">{formatCurrency(comparisonOwnPrice, ownCurrency)}</p>
            </div>
            <div className="border-l border-[#edf1f5] px-4 py-3.5">
              <p className="text-[9px] font-medium text-[#8a97a7]">Laagste</p>
              <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#21364d]">{formatCurrency(lowestPrice, ownCurrency)}</p>
            </div>
            <div className="border-t border-[#edf1f5] px-5 py-3.5 sm:border-l sm:border-t-0 sm:px-4">
              <p className="text-[9px] font-medium text-[#8a97a7]">Gemiddeld</p>
              <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#21364d]">{formatCurrency(averagePrice, ownCurrency)}</p>
            </div>
            <div className="border-l border-t border-[#edf1f5] px-4 py-3.5 sm:border-t-0">
              <p className="text-[9px] font-medium text-[#8a97a7]">Positie</p>
              <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#21364d]">{marketPosition === null ? '—' : '#' + marketPosition}</p>
            </div>
          </div>

          <div className="border-b border-[#e8edf3] bg-[#f7faff] px-5 py-3.5 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_150px_44px] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#315fa7]">Jouw webshop</span>
                  <span className="ps-chip ps-chip-blue">Eigen prijs</span>
                </div>
                <p className="mt-1 text-[10px] text-[#7b8999]">{selectedMarket?.stockStatus ?? product.stockStatus ?? 'Voorraad onbekend'}</p>
              </div>
              <div>
                <p className="text-[15px] font-semibold tabular-nums text-[#19324b]">{formatCurrency(comparisonOwnPrice, ownCurrency)}</p>
                <p className="mt-1 text-[9px] text-[#8190a2]">
                  {comparisonOwnPriceExVat === null ? 'Excl. btw onbekend' : formatCurrency(comparisonOwnPriceExVat, ownCurrency) + ' excl. btw'}
                  {ownShippingCost === null ? ', verzending onbekend' : ownShippingCost === 0 ? ', gratis verzending' : ', ' + formatCurrency(ownAmounts.shippingInc, ownCurrency) + ' verzending'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-[#8190a2]">Totaal geleverd</p>
                <p className="mt-1 text-[12px] font-semibold tabular-nums text-[#38516a]">{ownAmounts.totalInc === null ? '—' : formatCurrency(ownAmounts.totalInc, ownCurrency)}</p>
              </div>
              <div className="flex justify-end">
                <Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '&instellingen=1#eigen-prijs'} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#d9e2ec] bg-white text-[15px] font-semibold text-[#60758d]" aria-label="Eigen prijs wijzigen">•••</Link>
              </div>
            </div>
          </div>

          {pricedComparisonMatches.length ? (
            <div>
              <div className="hidden grid-cols-[minmax(0,1fr)_180px_150px_44px] border-b border-[#edf1f5] bg-[#fbfcfe] px-5 py-2 text-[9px] font-medium text-[#8a97a7] sm:grid sm:px-6">
                <span>Concurrent</span>
                <span>Prijs</span>
                <span>Verschil</span>
                <span />
              </div>
              {pricedComparisonMatches.map((match, index) => {
                const offer = match.competitorOffer
                const price = numberValue(offer.normalizedPrice)
                const competitorVatRate = numberValue(offer.competitor.country.vatRate)
                const priceExVat = price !== null && competitorVatRate !== null ? price / (1 + competitorVatRate / 100) : null
                const normalizedShipping = numberValue(offer.normalizedShippingCost)
                const deliveredPrice = numberValue(offer.deliveredPrice)
                const deliveredDifference = ownCurrency === offer.currency && ownAmounts.totalInc !== null && deliveredPrice !== null ? deliveredPrice - ownAmounts.totalInc : null
                const deltaAmount = deliveredDifference ?? (ownCurrency === offer.currency && comparisonOwnPrice !== null && price !== null ? price - comparisonOwnPrice : null)
                const ownDeltaPct = deltaAmount === null ? null : deliveredDifference !== null && ownAmounts.totalInc && ownAmounts.totalInc > 0 ? deltaAmount / ownAmounts.totalInc * 100 : comparisonOwnPrice && comparisonOwnPrice > 0 ? deltaAmount / comparisonOwnPrice * 100 : null
                const latestSourceCheck = offer.priceChecks[0]
                const sourceIssue = sourceIssueLabel(latestSourceCheck?.errorMessage)
                const stale = isStalePriceSource(offer.lastCheckedAt)
                const deltaTone = ownDeltaPct !== null && ownDeltaPct < 0 ? 'text-[#b6414d]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'text-[#20814d]' : 'text-[#708095]'
                return (
                  <div key={match.id} className="grid gap-3 border-b border-[#edf1f5] px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_180px_150px_44px] sm:items-center sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f0f4f9] text-[10px] font-bold text-[#52677f]">{offer.competitor.name.slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[11px] font-semibold text-[#2c4259]">{offer.competitor.name}</p>
                          {index === 0 ? <span className="ps-chip ps-chip-green">Laagste</span> : null}
                          {stale || sourceIssue ? <span className="ps-chip ps-chip-amber">Controleren</span> : null}
                        </div>
                        <p className="mt-1 text-[9px] text-[#8794a5]">{offer.lastCheckedAt ? formatDate(offer.lastCheckedAt) : 'Nog niet gemeten'} · {frequencyLabel(offer.competitor.checkFrequencyHours)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold tabular-nums text-[#21364d]">{formatCurrency(price, offer.currency)}</p>
                      <p className="mt-1 text-[9px] text-[#8190a2]">
                        {formatCurrency(priceExVat, offer.currency)} excl. btw
                        {normalizedShipping === null ? ', verzending onbekend' : normalizedShipping === 0 ? ', gratis verzending' : ', ' + formatCurrency(normalizedShipping, offer.currency) + ' verzending'}
                      </p>
                      {deliveredPrice !== null ? <p className="mt-0.5 text-[9px] font-medium text-[#66788d]">Totaal {formatCurrency(deliveredPrice, offer.currency)}</p> : null}
                    </div>
                    <div>
                      <p className={'text-[12px] font-semibold tabular-nums ' + deltaTone}>{deltaAmount === null || ownDeltaPct === null ? '—' : (deltaAmount > 0 ? '+' : '') + formatCurrency(deltaAmount, offer.currency) + ' · ' + (ownDeltaPct > 0 ? '+' : '') + formatNumber(ownDeltaPct, 1) + '%'}</p>
                      <p className="mt-1 text-[9px] text-[#8794a5]">{deliveredDifference !== null ? 'op totaalprijs' : 'op productprijs'}</p>
                    </div>
                    <details className="relative justify-self-end">
                      <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-[8px] border border-[#d9e2ec] bg-white text-[15px] font-semibold text-[#60758d]" aria-label={'Acties voor ' + offer.competitor.name}>•••</summary>
                      <div className="absolute right-0 z-20 mt-2 w-40 rounded-[10px] border border-[#dfe6ee] bg-white p-1.5 shadow-[0_10px_30px_rgba(31,49,77,.14)]">
                        <a href={offer.url} target="_blank" rel="noreferrer" className="block rounded-[7px] px-3 py-2 text-[10px] font-medium text-[#40556d] hover:bg-[#f5f8fb]">Bron bekijken</a>
                        {canEditCompetitors ? (
                          <form action={runCompetitorOfferResearchAction}>
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="competitorOfferId" value={offer.id} />
                            <button type="submit" className="block w-full rounded-[7px] px-3 py-2 text-left text-[10px] font-medium text-[#40556d] hover:bg-[#f5f8fb]">Prijs vernieuwen</button>
                          </form>
                        ) : null}
                        {canEditCompetitors ? <Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '&concurrent=' + offer.id + '#bronbeheer'} className="block rounded-[7px] px-3 py-2 text-[10px] font-medium text-[#40556d] hover:bg-[#f5f8fb]">Bron wijzigen</Link> : null}
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="px-6 py-8 text-center">
              <p className="text-[12px] font-semibold text-[#40556d]">Nog geen bruikbare concurrentprijzen</p>
              <p className="mt-1 text-[10px] text-[#8391a2]">Los de bronnen hieronder op of zoek nieuwe concurrenten.</p>
            </div>
          )}

          {missingPriceMatches.length ? (
            <details className="border-t border-[#e8edf3] bg-[#fffdf8]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                <div>
                  <p className="text-[11px] font-semibold text-[#72551c]">{missingPriceMatches.length} bronnen vragen aandacht</p>
                  <p className="mt-0.5 text-[9px] text-[#8b764d]">Verborgen uit de hoofdvergelijking totdat er een bruikbare prijs is.</p>
                </div>
                <span className="text-[10px] font-semibold text-[#8b6a2b]">Bekijken</span>
              </summary>
              <div className="border-t border-[#f0e8d4] bg-white">
                {missingPriceMatches.map((match) => {
                  const offer = match.competitorOffer
                  const latestSourceCheck = offer.priceChecks[0]
                  const issue = sourceIssueLabel(latestSourceCheck?.errorMessage) ?? 'Prijs ontbreekt'
                  return (
                    <div key={match.id} className="flex flex-col gap-3 border-b border-[#edf1f5] px-5 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#34495f]">{offer.competitor.name}</p>
                        <p className="mt-1 text-[9px] text-[#91661d]">{issue}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <a href={offer.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#315fa7]">Bron</a>
                        {canEditCompetitors ? (
                          <form action={runCompetitorOfferResearchAction}>
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="competitorOfferId" value={offer.id} />
                            <PriceFetchSubmitButton compact idleLabel="Opnieuw proberen" pendingLabel="Ophalen…" />
                          </form>
                        ) : null}
                        {canEditCompetitors ? <Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '&concurrent=' + offer.id + '#bronbeheer'} className="text-[10px] font-semibold text-[#60758d]">Wijzig</Link> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          ) : null}

          {selectedCompetitorMatch && canEditCompetitors ? (() => {
            const selectedOffer = selectedCompetitorMatch.competitorOffer
            return (
              <div id="bronbeheer" className="border-t border-[#e8edf3] bg-[#fbfcfe] p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div><p className="text-[13px] font-semibold text-[#30465d]">Bron wijzigen, {selectedOffer.competitor.name}</p><p className="mt-1 text-[10px] text-[#7b8999]">Pas alleen de gegevens van deze productbron aan.</p></div>
                  <Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '#concurrentieprijzen'} className="text-[11px] font-semibold text-[#315fa7]">Sluiten</Link>
                </div>
                <form action={updateCompetitorOfferAction} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="competitorOfferId" value={selectedOffer.id} />
                  <label className="text-[10px] font-semibold text-[#5f7084]">Concurrent<input required name="competitorName" defaultValue={selectedOffer.competitor.name} className="toolbar-control mt-1.5 w-full" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Product URL<input required type="url" name="offerUrl" defaultValue={selectedOffer.url} className="toolbar-control mt-1.5 w-full" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Controlefrequentie<select name="checkFrequencyHours" defaultValue={selectedOffer.competitor.checkFrequencyHours} className="toolbar-control mt-1.5 w-full"><option value="6">Elke 6 uur</option><option value="12">Elke 12 uur</option><option value="24">Dagelijks</option><option value="48">Elke 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Alleen handmatig</option></select></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Prijs bevat btw<select name="vatIncluded" defaultValue={selectedOffer.vatIncluded ? 'true' : 'false'} className="toolbar-control mt-1.5 w-full"><option value="true">Ja</option><option value="false">Nee</option></select></label>
                  <div className="md:col-span-2 grid gap-3 rounded-[10px] border border-[#e2e8ef] bg-white p-4 sm:grid-cols-2">
                    <label className="text-[10px] font-semibold text-[#5f7084]">Handmatige productprijs<input name="manualPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Optioneel" /></label>
                    <label className="text-[10px] font-semibold text-[#5f7084]">Andere btw variant<input name="manualPriceOther" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Optioneel" /></label>
                    <label className="text-[10px] font-semibold text-[#5f7084]">Verzendkosten<input name="manualShippingCost" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Leeg onbekend, 0 gratis" /></label>
                    <label className="text-[10px] font-semibold text-[#5f7084]">Btw op verzending<select name="manualShippingVatIncluded" defaultValue="true" className="toolbar-control mt-1.5 w-full"><option value="true">Inclusief btw</option><option value="false">Exclusief btw</option></select></label>
                  </div>
                  <input type="hidden" name="packagingUnit" value={selectedOffer.packagingUnit ?? product.packagingUnit ?? 'stuks'} />
                  <input type="hidden" name="packagingQty" value={selectedOffer.packagingQty ?? product.packagingQty ?? 1} />
                  <div className="md:col-span-2 flex justify-end"><button type="submit" className="primary-action">Wijzigingen opslaan</button></div>
                </form>
                <form action={removeCompetitorOfferAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="competitorOfferId" value={selectedOffer.id} />
                  <RemoveCompetitorButton label={selectedOffer.competitor.name} />
                </form>
              </div>
            )
          })() : null}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="overflow-hidden rounded-[16px] border border-[#dfe6ee] bg-white shadow-[0_6px_22px_rgba(31,49,77,.04)]">
            <div className="px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-[#60758d]">Prijsadvies</p>
                <span className={'ps-chip ' + (adviceReady ? 'ps-chip-green' : 'ps-chip-amber')}>{adviceReady ? 'Klaar' : 'Controleren'}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <p className={'text-[28px] font-semibold tracking-[-0.035em] ' + adviceTone}>{formatCurrency(recommendedPrice, ownCurrency)}</p>
                {adviceChange !== null ? <span className={'text-[11px] font-semibold ' + adviceTone}>{adviceChange > 0 ? '+' : ''}{formatNumber(adviceChange, 1)}%</span> : null}
              </div>
              <p className={'mt-1 text-[11px] font-medium ' + adviceTone}>{actionLabel(recommendation?.action)}</p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-[9px] bg-[#f7f9fc] px-3 py-2.5">
                  <p className="text-[9px] text-[#8996a5]">Marge</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#34495f]">{currentMargin === null ? '—' : formatNumber(currentMargin, 1) + '%'} <span className="font-normal text-[#9aa5b2]">→</span> {expectedMargin === null ? '—' : formatNumber(expectedMargin, 1) + '%'}</p>
                </div>
                <div className="rounded-[9px] bg-[#f7f9fc] px-3 py-2.5">
                  <p className="text-[9px] text-[#8996a5]">Marktpositie</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#34495f]">{marketPosition === null ? '—' : '#' + marketPosition} <span className="font-normal text-[#9aa5b2]">van</span> {competitorCount + 1}</p>
                </div>
              </div>

              <p className="mt-4 text-[10px] leading-5 text-[#66788d]">{recommendation?.reason ?? 'Nog onvoldoende betrouwbare data voor een onderbouwd prijsadvies.'}</p>
              <p className="mt-2 text-[9px] text-[#8895a5]">Prijsgrenzen, {guardrailText}</p>
              {!adviceReady ? <div className="mt-3 rounded-[9px] bg-[#fff7e8] px-3 py-2.5 text-[10px] font-medium text-[#815d1d]">{sourceProblemCount > 0 ? sourceProblemCount + ' bronproblemen' : reviewMatches.length + ' matches'} eerst controleren voordat je dit advies gebruikt.</div> : null}
              <Link href="/prijsstrategie" className="primary-action mt-4 w-full">Prijsstrategie</Link>
            </div>
          </section>

          <section className="rounded-[16px] border border-[#dfe6ee] bg-white p-5 shadow-[0_6px_22px_rgba(31,49,77,.04)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold text-[#60758d]">Datakwaliteit</p>
              <span className={'h-2.5 w-2.5 rounded-full ' + (sourceProblemCount === 0 && reviewMatches.length === 0 ? 'bg-[#29a56f]' : 'bg-[#f2a51a]')} />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-[#2f4359]">{sourceProblemCount === 0 && reviewMatches.length === 0 ? 'Alles actueel' : sourceProblemCount + reviewMatches.length + ' aandachtspunten'}</p>
            <p className="mt-1 text-[10px] leading-4 text-[#7c8ba0]">{sourceProblemCount > 0 ? sourceProblemCount + ' bronproblemen' : 'Geen bronproblemen'}{reviewMatches.length > 0 ? ', ' + reviewMatches.length + ' matches controleren' : ''}.</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#edf1f5] pt-3 text-[10px] font-semibold">
              <a href="#bronkwaliteit" className="text-[#315fa7]">Bronkwaliteit</a>
              <a href="#historie" className="text-[#315fa7]">Historie</a>
              {missingPriceMatches.length > 0 ? <a href="#concurrentieprijzen" className="text-[#315fa7]">Ontbrekende prijzen</a> : null}
            </div>
          </section>
        </aside>
      </div>

      {reviewMatches.length ? (
        <section id="concurrenten-vinden" className="scroll-mt-24 overflow-hidden rounded-[18px] border border-[#eadfbf] bg-[#fffdf8] shadow-[0_5px_18px_rgba(31,49,77,.035)]">
          <div className="flex flex-col gap-3 border-b border-[#f0e8d4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2"><h2 className="text-[14px] font-semibold text-[#3a4654]">Matches controleren</h2><span className="ps-chip ps-chip-amber">{reviewMatches.length}</span></div>
              <p className="mt-1 text-[11px] text-[#7b8290]">Alleen bevestigde matches mogen invloed hebben op de prijsvergelijking.</p>
            </div>
            {defaultCountry ? (
              <form action={discoverCompetitorUrlsAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="countryId" value={defaultCountry.id} />
                <PriceFetchSubmitButton idleLabel="Meer concurrenten zoeken" pendingLabel="Zoeken…" />
              </form>
            ) : null}
          </div>
          {discoveryAttempted ? <div className="border-b border-[#f0e8d4] px-5 py-2.5 text-[10px] text-[#75643b] sm:px-6">{discovered > 0 ? <>{discovered} nieuwe suggesties gevonden.</> : discoveryAlreadyLinked > 0 ? <>{discoveryAlreadyLinked} gevonden kandidaten waren al gekoppeld.</> : <>{discoveryReason || 'Geen nieuwe suggesties gevonden.'}</>} {discoveryFound > 0 ? <>{discoveryFound} bruikbare resultaten{discoveryProvider ? ' via ' + discoveryProvider : ''}{discoveryMode === 'EAN' ? ', gezocht op EAN.' : discoveryMode === 'PRODUCT' ? ', gezocht op productgegevens.' : '.'}</> : null}</div> : null}
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
            {reviewMatches.map((match) => (
              <article key={match.id} className="rounded-[12px] border border-[#ebe3cf] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[12px] font-semibold text-[#30465d]">{match.competitorOffer.competitor.name}</p><p className="mt-1 truncate text-[10px] text-[#8794a5]">{match.competitorOffer.url}</p></div>
                  <span className="ps-chip ps-chip-blue">{formatNumber(match.confidenceScore)}%</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf1f5] pt-3">
                  <a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#60758d]">Bron bekijken</a>
                  {canEditCompetitors ? <form action={approveMatchAction.bind(null, match.id)}><button type="submit" className="primary-action min-h-[32px] px-3 py-1 text-[10px]">Bevestigen</button></form> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section id="concurrenten-vinden" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e3e9ef] bg-white px-5 py-4">
          <div><p className="text-[12px] font-semibold text-[#40556d]">Concurrentdekking uitbreiden</p><p className="mt-1 text-[10px] text-[#8391a2]">Laat Prysight opnieuw zoeken wanneer je meer relevante winkels wilt toevoegen.</p></div>
          {defaultCountry ? <form action={discoverCompetitorUrlsAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="countryId" value={defaultCountry.id} /><PriceFetchSubmitButton compact idleLabel="Concurrenten zoeken" pendingLabel="Zoeken…" /></form> : null}
        </section>
      )}

      <details id="eigen-prijs" open={ownPrice === null || readParam(query.instellingen) === '1'} className="ps-panel scroll-mt-24 overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[13px] font-semibold text-[#30465d]">Product en eigen prijs</p><p className="mt-1 text-[10px] text-[#7d8b9a]">Beheer verkoopprijs, verzendkosten, voorraad, URL en productidentificatie.</p></div>
            <span className="text-[10px] font-semibold text-[#60758d]">Instellingen openen</span>
          </div>
        </summary>
        <div className="grid gap-5 border-t border-[#e7edf3] p-5 lg:grid-cols-[300px_minmax(0,1fr)] sm:p-6">
          <div className="rounded-[12px] bg-[#f7f9fc] p-4">
            <p className="text-[10px] font-semibold text-[#74869a]">Eigen prijs</p>
            <p className="mt-1 text-[25px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatCurrency(ownAmounts.priceInc, ownCurrency)}</p>
            <p className="mt-1 text-[10px] text-[#7b8999]">{formatCurrency(ownAmounts.priceEx, ownCurrency)} excl. btw</p>
            <div className="mt-4 space-y-2 text-[10px] text-[#526780]">
              <div className="flex justify-between gap-3"><span>Verzending</span><strong>{ownShippingCost === null ? 'Onbekend' : ownShippingCost === 0 ? 'Gratis' : formatCurrency(ownAmounts.shippingInc, ownCurrency)}</strong></div>
              <div className="flex justify-between gap-3"><span>Totaal</span><strong>{formatCurrency(ownAmounts.totalInc, ownCurrency)}</strong></div>
              <div className="flex justify-between gap-3"><span>Voorraad</span><strong className="text-right">{selectedMarket?.stockStatus ?? product.stockStatus ?? 'Onbekend'}</strong></div>
            </div>
          </div>
          <div>
            {canEditProduct ? (
              <form action={updateProductOwnPriceAction} className="space-y-4">
                <input type="hidden" name="productId" value={product.id} />
                {defaultCountry ? <input type="hidden" name="countryId" value={defaultCountry.id} /> : null}
                <input type="hidden" name="currency" value={ownCurrency} />
                <input type="hidden" name="vatIncluded" value="true" />
                <input type="hidden" name="ownShippingVatIncluded" value="true" />
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-[10px] font-semibold text-[#5f7084]">Prijs incl. btw<input name="ownPrice" required inputMode="decimal" defaultValue={ownAmounts.priceInc === null ? '' : ownAmounts.priceInc.toFixed(2).replace('.', ',')} className="toolbar-control mt-1.5 w-full" placeholder="0,00" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Prijs excl. btw, optioneel<input name="ownPriceOther" inputMode="decimal" defaultValue={ownAmounts.priceEx === null ? '' : ownAmounts.priceEx.toFixed(2).replace('.', ',')} className="toolbar-control mt-1.5 w-full" placeholder="Automatisch berekend" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Verzendkosten incl. btw<input name="ownShippingCost" inputMode="decimal" defaultValue={ownAmounts.shippingInc === null ? '' : ownAmounts.shippingInc.toFixed(2).replace('.', ',')} className="toolbar-control mt-1.5 w-full" placeholder="Leeg onbekend, 0 gratis" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Voorraadstatus<input name="stockStatus" defaultValue={selectedMarket?.stockStatus ?? product.stockStatus ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
                  {defaultCountry ? <label className="text-[10px] font-semibold text-[#5f7084] md:col-span-2">Jouw product URL<input name="ownUrl" type="url" defaultValue={selectedMarket?.ownUrl ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="https://jouwwebshop.nl/product/..." /></label> : null}
                </div>
                <div className="flex justify-end"><button type="submit" className="primary-action">Opslaan</button></div>
              </form>
            ) : <p className="text-[11px] text-[#7b8999]">Alleen lezen.</p>}
            {canEditProduct ? (
              <form action={updateProductIdentifiersAction} className="mt-5 grid gap-3 border-t border-[#edf1f5] pt-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <input type="hidden" name="productId" value={product.id} />
                {defaultCountry ? <input type="hidden" name="countryId" value={defaultCountry.id} /> : null}
                <label className="text-[10px] font-semibold text-[#5f7084]">EAN<input name="ean" inputMode="numeric" defaultValue={product.ean ?? ''} className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[10px] font-semibold text-[#5f7084]">GTIN<input name="gtin" inputMode="numeric" defaultValue={product.gtin ?? ''} className="toolbar-control mt-1.5 w-full" /></label>
                <button type="submit" className="secondary-action min-h-[40px]">Identificatie opslaan</button>
              </form>
            ) : null}
          </div>
        </div>
      </details>

      <details id="bronkwaliteit" open={verificationRequested === 'uitgevoerd' || verificationRequested === 'geen-bronnen'} className="ps-panel scroll-mt-24 overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[13px] font-semibold text-[#30465d]">Bronkwaliteit en verificatie</p><p className="mt-1 text-[10px] text-[#7d8b9a]">Technische bronstatus staat hier, buiten de primaire prijsflow.</p></div>
            <span className="text-[10px] font-semibold text-[#60758d]">{failedLatestChecks + staleSources} aandachtspunten</span>
          </div>
        </summary>
        <div className="border-t border-[#e7edf3] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[12px] font-semibold text-[#34495f]">Brico en Praxis</p><p className="mt-1 text-[10px] text-[#7d8b9a]">Controleer gekoppelde productpagina&apos;s opnieuw wanneer je deze bronnen specifiek wilt verifiëren.</p></div>
            {canVerifySources && defaultCountry && retailerVerificationMatches.some(Boolean) ? <form action={verifyBricoPraxisPricesAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="countryId" value={defaultCountry.id} /><PriceFetchSubmitButton compact idleLabel="Brico en Praxis controleren" pendingLabel="Controleren…" /></form> : null}
          </div>
          {verificationRequested === 'uitgevoerd' ? <p className="mt-3 rounded-[9px] bg-[#f3f8ff] px-3 py-2 text-[10px] text-[#48627f]">{readParam(query.vgeslaagd) ?? '0'} controles geslaagd, {readParam(query.vmislukt) ?? '0'} mislukt.</p> : null}
          {verificationRequested === 'geen-bronnen' ? <p className="mt-3 rounded-[9px] bg-[#fff8eb] px-3 py-2 text-[10px] text-[#76591d]">Brico en Praxis zijn nog niet gekoppeld voor deze markt.</p> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(['Brico', 'Praxis'] as const).map((retailer, index) => {
              const match = retailerVerificationMatches[index]
              const offer = match?.competitorOffer
              const check = offer?.priceChecks[0]
              const result = evaluateSourceVerification({ linked: Boolean(offer), matchStatus: match?.matchStatus, price: offer?.normalizedPrice, url: offer?.url, lastCheckedAt: offer?.lastCheckedAt, check })
              const statusLabels = { 'not-linked': 'Niet gekoppeld', failed: 'Controle mislukt', 'not-checked': 'Niet gecontroleerd', 'match-review': 'Match beoordelen', stale: 'Verouderd', verified: 'Geverifieerd', unverified: 'Niet geverifieerd' } as const
              return (
                <div key={retailer} className="rounded-[11px] border border-[#e3e9ef] bg-[#fafbfd] p-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-[12px] font-semibold text-[#34495f]">{retailer}</p><span className={'ps-chip ' + (result.verified ? 'ps-chip-green' : 'ps-chip-amber')}>{statusLabels[result.status]}</span></div>
                  <p className="mt-2 text-[10px] text-[#76879b]">{offer ? check ? 'Laatste controle ' + formatDate(check.checkedAt) : 'Nog niet gecontroleerd' : 'Geen gekoppelde productpagina'}</p>
                  {check && !check.isSuccess ? <p className="mt-2 text-[10px] text-[#936519]">{sourceIssueLabel(check.errorMessage) ?? 'Bron kon niet worden bevestigd.'}</p> : null}
                  <div className="mt-3 flex items-center gap-3">
                    {offer ? <a href={offer.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#315fa7]">Bron bekijken</a> : <a href="#concurrenten-vinden" className="text-[10px] font-semibold text-[#315fa7]">Concurrent zoeken</a>}
                    {offer && canVerifySources ? <form action={runCompetitorOfferResearchAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><PriceFetchSubmitButton compact idleLabel="Test" pendingLabel="Testen…" /></form> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </details>

      <details id="historie" open={Boolean(highlightedHistoryMatch)} className="ps-panel scroll-mt-24 overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 sm:px-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-[#30465d]">Prijsverloop en historie</p><p className="mt-1 text-[10px] text-[#7d8b9a]">Analyse en technische controlehistorie zijn beschikbaar wanneer je ze nodig hebt.</p></div><span className="text-[10px] font-semibold text-[#60758d]">Historie openen</span></div></summary>
        <div className="space-y-4 border-t border-[#e7edf3] p-4 sm:p-5">
          {highlightedHistoryMatch ? <div className="flex items-center justify-between rounded-[10px] bg-[#f5f9ff] px-4 py-3"><p className="text-[11px] font-semibold text-[#2e4661]">Focus, {highlightedHistoryMatch.competitorOffer.competitor.name}</p><Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '#historie'} className="text-[10px] font-semibold text-[#315fa7]">Alle concurrenten</Link></div> : null}
          <Suspense fallback={<AnalyticsFallback label="Prijsverloop" />}><ProductPriceHistoryPanel companyId={user.companyId} productId={product.id} countryId={defaultCountry?.id ?? null} highlightedCompetitorId={highlightedHistoryMatch?.competitorOffer.competitorId ?? null} /></Suspense>
          <details className="rounded-[10px] border border-[#e4eaf1] bg-white"><summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-[#526780]">Technische controlehistorie</summary><div className="border-t border-[#e7edf3] p-4"><Suspense fallback={<AnalyticsFallback label="Controlehistorie" />}><ProductCheckHistoryPanel companyId={user.companyId} productId={product.id} /></Suspense></div></details>
        </div>
      </details>

      <details open={readParam(query.broninfo) === '1'} className="ps-panel overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 sm:px-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-[#30465d]">Geavanceerd bronbeheer</p><p className="mt-1 text-[10px] text-[#7d8b9a]">Synchronisatie, bronherkenning, handmatig koppelen en overige markten.</p></div><span className="text-[10px] font-semibold text-[#60758d]">Geavanceerd</span></div></summary>
        <div id="broninformatie" className="space-y-4 border-t border-[#e7edf3] p-4 sm:p-5">
          <OwnProductSyncSettings key={defaultCountry?.id ?? 'none'} productId={product.id} countryId={defaultCountry?.id ?? null} marketName={defaultCountry?.name ?? null} hasUrl={Boolean(selectedMarket?.ownUrl)} canWrite={canEditProduct} initialSource={ownSyncSource ? { ...ownSyncSource, lastRunAt: ownSyncSource.lastRunAt?.toISOString() ?? null } : null} />
          {readParam(query.broninfo) === '1' ? <EanPriceSuggestions productId={product.id} ean={product.ean || product.gtin} countryId={defaultCountry?.id ?? null} countryName={defaultCountry?.name ?? null} currency={ownCurrency} sourceKey={marketMatches.map((match) => match.competitorOffer.id).join(',')} canEditProduct={canEditProduct} canRefresh={canEditCompetitors} /> : <Link href={'/producten/' + product.id + '?markt=' + (defaultCountry?.id ?? '') + '&broninfo=1#broninformatie'} className="secondary-action inline-flex">Extra broninformatie ophalen</Link>}
          <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-[12px] border border-[#e3e9ef] bg-white p-5">
              <h3 className="text-[12px] font-semibold text-[#34495f]">Concurrent handmatig koppelen</h3>
              <form action={addCompetitorOfferAction} className="mt-4 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="productId" value={product.id} />
                <label className="text-[10px] font-semibold text-[#5f7084]">Concurrent<input required name="competitorName" className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld Manutan" /></label>
                <label className="text-[10px] font-semibold text-[#5f7084]">Land<select required name="countryId" defaultValue={defaultCountry?.id} className="toolbar-control mt-1.5 w-full">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
                <label className="text-[10px] font-semibold text-[#5f7084] md:col-span-2">Product URL<input required type="url" name="offerUrl" className="toolbar-control mt-1.5 w-full" placeholder="https://concurrent.nl/product/..." /></label>
                <div className="md:col-span-2 flex justify-end"><button type="submit" className="primary-action">Koppelen</button></div>
              </form>
            </section>
            <section className="rounded-[12px] border border-[#e3e9ef] bg-white p-5">
              <h3 className="text-[12px] font-semibold text-[#34495f]">Markten</h3>
              <div className="mt-3 space-y-2">{product.productMarkets.length === 0 ? <p className="text-[10px] text-[#7d8b9a]">Geen landspecifieke productdata.</p> : product.productMarkets.map((market) => <div key={market.id} className="flex items-center justify-between gap-3 rounded-[9px] bg-[#f7f9fc] px-3 py-2.5"><div><p className="text-[10px] font-semibold text-[#40556d]">{market.country.name}</p><p className="mt-0.5 text-[9px] text-[#7d8b9a]">{market.stockStatus ?? 'Voorraad onbekend'}</p></div><div className="text-right"><p className="text-[10px] font-semibold text-[#40556d]">{formatCurrency(market.ownPrice, market.currency)}</p>{market.ownUrl ? <a href={market.ownUrl} target="_blank" rel="noreferrer" className="text-[9px] font-semibold text-[#315fa7]">Webshop</a> : null}</div></div>)}</div>
            </section>
          </div>
        </div>
      </details>
    </div>
  )
}
