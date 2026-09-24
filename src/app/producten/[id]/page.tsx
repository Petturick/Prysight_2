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

  const [product, countries, pricing, feedContext] = await Promise.all([
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
  const marketMatches = product.matches.filter((match) => match.competitorOffer.competitor.isActive && (!defaultCountry || match.competitorOffer.competitor.countryId === defaultCountry.id))
  const retailerVerificationMatches = ['brico', 'praxis'].map((retailer) =>
    marketMatches.find((match) =>
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

  return (
    <div className="space-y-4">
      {intelligenceUpdated && (intelligencePrices > 0 || intelligenceCreated > 0 || intelligenceErrors > 0) ? (
        <div className={`rounded-[10px] border px-4 py-2.5 text-[10px] font-medium ${intelligencePrices > 0 || intelligenceCreated > 0 ? 'border-[#b9ddc8] bg-[#f4fbf7] text-[#176a42]' : 'border-[#e8d3a2] bg-[#fff8e9] text-[#76591d]'}`}>
          {intelligencePrices > 0 || intelligenceCreated > 0
            ? `${intelligenceCreated} nieuwe bron${intelligenceCreated === 1 ? '' : 'nen'}, ${intelligencePrices} prijs${intelligencePrices === 1 ? '' : 'en'} bijgewerkt.`
            : `${intelligenceErrors} prijscontrole${intelligenceErrors === 1 ? '' : 's'} mislukt.`}
        </div>
      ) : null}
      {duplicateRedirect ? <div className="rounded-[12px] border border-[#e8d3a2] bg-[#fff8e9] px-4 py-3 text-[12px] font-semibold text-[#76591d]">Dit product bestond al in Prysight. Daarom is geen duplicaat aangemaakt. Je kunt het bestaande product hier verder beheren.</div> : null}
      {priceUpdated ? <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e8f7ee] px-4 py-3 text-[12px] font-semibold text-[#176a42]">Verkoopprijs bijgewerkt.</div> : null}
      {identifiersUpdated ? <div className="rounded-[12px] border border-[#8bc9a7] bg-[#e8f7ee] px-4 py-3 text-[12px] font-semibold text-[#176a42]">Productherkenning bijgewerkt. Prysight heeft de concurrentzoekactie opnieuw uitgevoerd.</div> : null}
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

      <section className="ps-panel px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#7d8b9a]">
              <span>Artikel {product.articleNumber}</span>
              {product.ean ? <span>EAN {product.ean}</span> : null}
              {defaultCountry ? <span>{defaultCountry.name}</span> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-[#18273a]">{displayProductName}</h1>
              {productNameNeedsAttention ? <span className="ps-chip ps-chip-amber">Productnaam controleren</span> : null}
            </div>
          </div>
          <Link href="/producten" className="secondary-action shrink-0">Terug naar producten</Link>
        </div>
      </section>


      <section aria-label="Product en volgende stap" className="ps-panel overflow-hidden">
        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold text-[#65758a]">Jouw verkoopprijs, {defaultCountry?.name ?? 'gekozen markt'}</p>
            <p className="mt-1 text-[30px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatCurrency(comparisonOwnPrice, ownCurrency)}</p>
            <p className="mt-1 text-[12px] text-[#65758a]">{comparisonOwnPriceExVat === null ? 'Prijs excl. btw nog onbekend' : `${formatCurrency(comparisonOwnPriceExVat, ownCurrency)} excl. btw`}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="ps-chip ps-chip-green">{pricedMatches.length} concurrent{pricedMatches.length === 1 ? '' : 'en'} met prijs</span>
              {reviewMatches.length ? <a href="#concurrenten-vinden" className="ps-chip ps-chip-amber">{reviewMatches.length} productmatch{reviewMatches.length === 1 ? '' : 'es'} controleren</a> : null}
              {failedLatestChecks ? <span className="ps-chip ps-chip-amber">{failedLatestChecks} broncontrole{failedLatestChecks === 1 ? '' : 's'} mislukt</span> : null}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            {canEditCompetitors && defaultCountry ? (
              <form action={refreshProductIntelligenceAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="countryId" value={defaultCountry.id} />
                <PriceFetchSubmitButton idleLabel="Concurrenten en prijzen ophalen" pendingLabel="Producten zoeken en prijzen ophalen…" />
              </form>
            ) : null}
            <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&instellingen=1#eigen-prijs`} className="text-[12px] font-semibold text-[#2f6edb]">Eigen prijs en productgegevens wijzigen</Link>
          </div>
        </div>
        <div className="border-t border-[#e7edf3] bg-[#f7f9fc] px-5 py-3 text-[12px] text-[#526780] sm:px-6">
          {ownPrice === null ? 'Begin met je eigen verkoopprijs. Prysight kan daarna betrouwbare concurrentieprijzen vergelijken.' :
            reviewMatches.length ? 'Volgende stap: controleer de gevonden producten voordat hun prijzen meetellen in je vergelijking.' :
              pricedMatches.length === 0 ? 'Volgende stap: zoek concurrenten en haal hun prijzen op. Nog geen bruikbare, bevestigde prijs gevonden.' :
                'Bekijk de bevestigde concurrentieprijzen en beoordeel daarna je prijsadvies.'}
        </div>
      </section>

      <section id="bronverificatie" aria-labelledby="bronverificatie-titel" className="ps-panel scroll-mt-24 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf3] px-5 py-4 sm:px-6">
          <div>
            <h2 id="bronverificatie-titel" className="text-[16px] font-semibold text-[#21364d]">Controleer Brico en Praxis</h2>
            <p className="mt-1 text-[12px] text-[#66778a]">Haal de prijzen opnieuw op uit de gekoppelde productpagina's. Je ziet per bron of de prijs en productmatch daadwerkelijk zijn bevestigd.</p>
          </div>
          {canVerifySources && defaultCountry && retailerVerificationMatches.some(Boolean) ? (
            <form action={verifyBricoPraxisPricesAction}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="countryId" value={defaultCountry.id} />
              <PriceFetchSubmitButton idleLabel="Brico en Praxis nu controleren" pendingLabel="Bronnen worden gecontroleerd…" />
            </form>
          ) : null}
        </div>
        <div className="space-y-3 p-5 sm:px-6">
          {verificationRequested === 'uitgevoerd' ? (
            <p role="status" className="rounded-[10px] border border-[#dce5ef] bg-[#f5f8fc] p-3 text-[12px] text-[#30465d]">
              Nieuwe prijscontrole afgerond. {readParam(query.vgeslaagd) ?? '0'} broncontrole(s) geslaagd, {readParam(query.vmislukt) ?? '0'} mislukt. Bekijk de status per concurrent hieronder. Alleen bevestigde productmatches met een geslaagde recente broncontrole tellen als geverifieerd.
            </p>
          ) : null}
          {verificationRequested === 'geen-bronnen' ? <p role="status" className="rounded-[10px] bg-[#fff8eb] p-3 text-[12px] text-[#76591d]">Brico en Praxis zijn voor deze markt nog niet aan dit product gekoppeld. Zoek of voeg eerst een bron toe.</p> : null}
          {(['Brico', 'Praxis'] as const).map((retailer, index) => {
            const match = retailerVerificationMatches[index]
            const offer = match?.competitorOffer
            const check = offer?.priceChecks[0]
            const result = evaluateSourceVerification({
              linked: Boolean(offer),
              matchStatus: match?.matchStatus,
              price: offer?.normalizedPrice,
              url: offer?.url,
              lastCheckedAt: offer?.lastCheckedAt,
              check,
            })
            const accepted = result.verified
            const failed = Boolean(check && !check.isSuccess)
            const pendingMatch = match?.matchStatus === 'REVIEW'
            const statusLabels = {
              'not-linked': 'Nog niet gekoppeld',
              failed: 'Nieuwe controle mislukt',
              'not-checked': 'Nog niet gecontroleerd',
              'match-review': 'Productmatch nog bevestigen',
              stale: 'Controle verouderd',
              verified: 'Prijs en product geverifieerd',
              unverified: 'Prijs nog niet geverifieerd',
            } as const
            const status = statusLabels[result.status]
            const tone = accepted ? 'ps-chip-green' : 'ps-chip-amber'
            return (
              <article key={retailer} className="rounded-[12px] border border-[#e1e8f0] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#273b51]">{retailer}</h3>
                      <span className={`ps-chip ${tone}`}>{status}</span>
                    </div>
                    {offer ? (
                      <>
                        <p className="mt-2 text-[12px] text-[#526780]">
                          {accepted ? `Geverifieerde prijs incl. btw: ${formatCurrency(offer.normalizedPrice, offer.currency)}`
                            : check?.foundPrice ? `Waargenomen bedrag: ${formatCurrency(check.foundPrice, check.currency)}, niet bevestigd als vergelijkbare prijs.`
                              : 'Er is nog geen recente, geverifieerde productprijs beschikbaar.'}
                        </p>
                        <p className="mt-1 text-[11px] text-[#78889a]">
                          {check ? `Laatste controle ${formatDate(check.checkedAt)} · Methode: ${check.checkMethod}${check.statusCode ? ` · HTTP ${check.statusCode}` : ''}` : 'Nog geen controlehistorie'}.
                        </p>
                        {failed ? <p className="mt-2 text-[12px] text-[#9a6810]">{sourceIssueLabel(check?.errorMessage) ?? 'De bron kon niet betrouwbaar worden gecontroleerd.'} De vorige prijs is hiermee niet opnieuw bevestigd.</p> : null}
                        {pendingMatch ? <p className="mt-2 text-[12px] text-[#76591d]">Controleer eerst of de gevonden productpagina hetzelfde artikel toont. De opgehaalde prijs telt nog niet mee.</p> : null}
                        <a href={offer.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-[#2f6edb]">Bekijk de gecontroleerde productpagina</a>
                      </>
                    ) : (
                      <p className="mt-2 text-[12px] text-[#66778a]">Er is geen gekoppelde productpagina voor {retailer} in {defaultCountry?.name ?? 'deze markt'}.</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {offer && canVerifySources ? (
                      <form action={runCompetitorOfferResearchAction}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="competitorOfferId" value={offer.id} />
                        <PriceFetchSubmitButton compact idleLabel="Opnieuw testen" pendingLabel="Controleren…" />
                      </form>
                    ) : <a href="#concurrenten-vinden" className="secondary-action">Concurrent zoeken</a>}
                    {pendingMatch ? <a href="#concurrenten-vinden" className="secondary-action">Productmatch controleren</a> : null}
                  </div>
                </div>
              </article>
            )
          })}
          <p className="text-[11px] text-[#78889a]">Een ontbrekende of geblokkeerde bron is geen bevestigde prijs. De controle gebruikt de actuele gekoppelde URL, zonder handmatig ingevoerde of eerder gevonden prijzen als nieuw resultaat voor te stellen.</p>
        </div>
      </section>
      <details id="eigen-prijs" open={ownPrice === null || readParam(query.instellingen) === '1'} className="ps-panel scroll-mt-24 overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[#30465d]">Productinstellingen</p>
              <p className="mt-1 text-[11px] text-[#7d8b9a]">{ownPrice === null ? 'Stel je eigen verkoopprijs in om prijsverschillen te berekenen.' : `Huidige prijs: ${formatCurrency(ownPrice, ownCurrency)}. Klik om de prijs of productdata te wijzigen.`}</p>
            </div>
            <span className="text-[10px] font-semibold text-[#60758d]">Open instellingen</span>
          </div>
        </summary>
        <div className="border-t border-[#e7edf3]">
        <div className="grid gap-0 lg:grid-cols-[.48fr_1.52fr]">
          <div className="border-b border-[#e7edf3] bg-[#f8fbff] px-5 py-4 sm:px-6 lg:border-b-0 lg:border-r">
            <p className="text-[28px] font-semibold tracking-[-0.03em] text-[#1e2d3f]">{formatCurrency(ownAmounts.priceInc, ownCurrency)}</p>
            <p className="mt-1 text-[10px] text-[#7b8999]">Inclusief btw · {selectedMarket?.stockStatus ?? product.stockStatus ?? 'Voorraad onbekend'}</p>
            <div className="mt-3 space-y-1 text-[11px] text-[#526780]">
              <p>Product excl. btw, {formatCurrency(ownAmounts.priceEx, ownCurrency)}</p>
              <p>Product incl. btw, {formatCurrency(ownAmounts.priceInc, ownCurrency)}</p>
              <p>Verzending excl. btw, {ownShippingCost === null ? 'Onbekend' : formatCurrency(ownAmounts.shippingEx, ownCurrency)}</p>
              <p>Verzending incl. btw, {ownShippingCost === null ? 'Onbekend' : formatCurrency(ownAmounts.shippingInc, ownCurrency)}</p>
              <p className="font-semibold">Totaal excl. btw, {formatCurrency(ownAmounts.totalEx, ownCurrency)}</p>
              <p className="font-semibold">Totaal incl. btw, {formatCurrency(ownAmounts.totalInc, ownCurrency)}</p>
              {ownShippingCost === null ? <p>Vul verzendkosten in om de volledige totaalprijs te vergelijken. Vul 0 in voor gratis verzending.</p> : null}
            </div>
            {ownPrice === null ? <p className="mt-3 rounded-[9px] bg-[#fff6e4] px-3 py-2 text-[11px] font-semibold text-[#9a6810]">Voeg eerst je eigen prijs toe om marktverschillen en prijsadvies correct te berekenen.</p> : null}
          </div>
          <div className="p-5 sm:p-6">
            {canEditProduct ? (
              <form action={updateProductOwnPriceAction} className="space-y-4">
                <input type="hidden" name="productId" value={product.id} />
                {defaultCountry ? <input type="hidden" name="countryId" value={defaultCountry.id} /> : null}
                <input type="hidden" name="currency" value={ownCurrency} />
                <input type="hidden" name="vatIncluded" value="true" />
                <input type="hidden" name="ownShippingVatIncluded" value="true" />

                <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
                  <div className="rounded-[12px] border border-[#dce5ef] bg-[#fbfcfe] p-4">
                    <div className="mb-3">
                      <p className="text-[12px] font-semibold text-[#30465d]">Verkoopprijs</p>
                      <p className="mt-1 text-[10px] leading-4 text-[#7b8999]">De prijs inclusief btw is leidend. De exclusieve prijs staat direct eronder voor controle en vergelijking.</p>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-[#4f5869]">
                        Prijs inclusief btw *
                        <div className="mt-1.5 flex items-center rounded-[7px] border border-[#cbd9eb] bg-white focus-within:border-[#8cb1f3] focus-within:shadow-[0_0_0_3px_rgba(79,134,232,.09)]">
                          <span className="px-3 text-[11px] font-semibold text-[#64748b]">{ownCurrency}</span>
                          <input name="ownPrice" required inputMode="decimal" defaultValue={ownAmounts.priceInc === null ? '' : ownAmounts.priceInc.toFixed(2).replace('.', ',')} className="min-h-[44px] flex-1 border-0 bg-transparent px-0 pr-3 text-[15px] font-semibold shadow-none outline-none focus:shadow-none" placeholder="0,00" />
                        </div>
                      </label>

                      <label className="block text-[11px] font-semibold text-[#4f5869]">
                        Prijs exclusief btw <span className="font-normal text-[#8b98a8]">(optioneel)</span>
                        <div className="mt-1.5 flex items-center rounded-[7px] border border-[#d8e1eb] bg-white focus-within:border-[#8cb1f3]">
                          <span className="px-3 text-[11px] font-semibold text-[#64748b]">{ownCurrency}</span>
                          <input name="ownPriceOther" inputMode="decimal" defaultValue={ownAmounts.priceEx === null ? '' : ownAmounts.priceEx.toFixed(2).replace('.', ',')} className="min-h-[42px] flex-1 border-0 bg-transparent px-0 pr-3 text-[13px] shadow-none outline-none focus:shadow-none" placeholder="Automatisch berekend" />
                        </div>
                        <span className="mt-1.5 block text-[10px] font-normal leading-4 text-[#7b8999]">Je mag dit veld leeg laten. Wanneer je het invult controleert Prysight of beide bedragen overeenkomen met het btw tarief van {defaultCountry?.name ?? 'de markt'}.</span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-[#dce5ef] bg-white p-4">
                    <div className="mb-3">
                      <p className="text-[12px] font-semibold text-[#30465d]">Verzendkosten</p>
                      <p className="mt-1 text-[10px] leading-4 text-[#7b8999]">De verzendkosten worden inclusief btw opgeslagen en automatisch omgerekend voor de prijsvergelijking.</p>
                    </div>

                    <label className="block text-[11px] font-semibold text-[#4f5869]">
                      Verzendkosten inclusief btw <span className="font-normal text-[#8b98a8]">(optioneel)</span>
                      <div className="mt-1.5 flex items-center rounded-[7px] border border-[#d8e1eb] bg-white focus-within:border-[#8cb1f3]">
                        <span className="px-3 text-[11px] font-semibold text-[#64748b]">{ownCurrency}</span>
                        <input name="ownShippingCost" inputMode="decimal" defaultValue={ownAmounts.shippingInc === null ? '' : ownAmounts.shippingInc.toFixed(2).replace('.', ',')} className="min-h-[42px] flex-1 border-0 bg-transparent px-0 pr-3 text-[13px] shadow-none outline-none focus:shadow-none" placeholder="Bijvoorbeeld 6,95" />
                      </div>
                    </label>

                    <div className="mt-3 rounded-[9px] bg-[#f4f7fb] px-3 py-2.5 text-[10px] leading-4 text-[#65758a]">
                      Leeg betekent onbekend. Vul 0 in voor gratis verzending. Exclusief btw wordt automatisch berekend op basis van de gekozen markt.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-[11px] font-semibold text-[#4f5869]">Voorraadstatus<input name="stockStatus" defaultValue={selectedMarket?.stockStatus ?? product.stockStatus ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="Op voorraad" /></label>
                  {defaultCountry ? <label className="text-[11px] font-semibold text-[#4f5869]">Jouw product URL<input name="ownUrl" type="url" defaultValue={selectedMarket?.ownUrl ?? ''} className="toolbar-control mt-1.5 w-full" placeholder="https://jouwwebshop.nl/product/..." /></label> : null}
                </div>

                <div className="flex justify-end">
                  <button type="submit" className="primary-action shrink-0">Opslaan</button>
                </div>
              </form>
            ) : <p className="text-[11px] text-[#7b8999]">Je hebt alleen-lezen toegang tot productprijzen.</p>}
          </div>
        </div>

        </div>

        <div className="border-t border-[#e7edf3] p-5 sm:p-6">
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-[#34495f]">Productidentificatie</p>
            <p className="mt-1 text-[10px] text-[#7d8b9a]">EAN en GTIN worden gebruikt voor automatische bronherkenning.</p>
          </div>
          {canEditProduct ? (
            <form action={updateProductIdentifiersAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <input type="hidden" name="productId" value={product.id} />
              {defaultCountry ? <input type="hidden" name="countryId" value={defaultCountry.id} /> : null}
              <label className="text-[10px] font-semibold text-[#4f5869]">EAN<input name="ean" inputMode="numeric" defaultValue={product.ean ?? ''} className="toolbar-control mt-1.5 w-full" /></label>
              <label className="text-[10px] font-semibold text-[#4f5869]">GTIN<input name="gtin" inputMode="numeric" defaultValue={product.gtin ?? ''} className="toolbar-control mt-1.5 w-full" /></label>
              <button type="submit" className="secondary-action min-h-[42px]">Productdata opslaan</button>
            </form>
          ) : null}
        </div>
      </details>

      <section id="concurrenten-vinden" className={`scroll-mt-24 rounded-[16px] border p-5 shadow-[0_8px_20px_rgba(20,31,55,.06)] ${reviewMatches.length ? 'border-[#c3b7f7] bg-[#f7f5ff]' : 'border-[#dce3ea] bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#253149]">Productmatches controleren</h2>
            <p className="mt-1 text-[11px] leading-5 text-[#7b8999]">{product.ean ? 'Prysight zoekt automatisch op EAN en productgegevens. Controleer twijfelgevallen voordat prijzen worden vergeleken.' : 'Prysight zoekt op GTIN, MPN, artikelnummer en productgegevens. Controleer twijfelgevallen voordat prijzen worden vergeleken.'}</p>
          </div>
          {defaultCountry ? (
            <form action={discoverCompetitorUrlsAction} className="flex shrink-0 flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <select name="countryId" defaultValue={defaultCountry.id} className="toolbar-control min-w-[150px]">{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
              <PriceFetchSubmitButton idleLabel={reviewMatches.length ? "Opnieuw zoeken" : "Concurrenten zoeken"} pendingLabel="Concurrenten zoeken…" />
            </form>
          ) : <span className="text-[11px] font-medium text-[#8a6a2a]">Geen actieve markt beschikbaar.</span>}
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

        {reviewMatches.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{reviewMatches.map((match) => <div key={match.id} className="rounded-[12px] border border-[#d8d2f6] bg-white p-3"><div className="flex items-start justify-between gap-3"><a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-[#253149]">{match.competitorOffer.competitor.name}</p><p className="mt-1 text-[9px] font-medium text-[#7d8b9a]">{match.competitorOffer.competitor.country.name}</p><p className="mt-1 max-w-[260px] truncate text-[9px] text-[#697386]">{match.competitorOffer.url}</p></a><div className="flex items-center gap-2"><span className="ps-chip ps-chip-blue">Matchscore {formatNumber(match.confidenceScore)}%</span>{canEditCompetitors ? <form action={removeCompetitorOfferAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={match.competitorOffer.id} /><RemoveCompetitorButton label={match.competitorOffer.competitor.name} /></form> : null}</div></div>{canEditCompetitors ? <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf1f5] pt-3"><a href={match.competitorOffer.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#60758d] hover:text-[#2f6edb]">Bron bekijken</a><form action={approveMatchAction.bind(null, match.id)}><button type="submit" className="primary-action min-h-[34px] px-3 py-1.5 text-[10px]">Gebruiken en prijs ophalen</button></form></div> : null}</div>)}</div> : null}
        {reviewMatches.length ? <div className="mt-3 flex justify-end"><Link href="/productmatches" className="text-[11px] font-semibold text-[#2f6edb]">Suggesties beoordelen</Link></div> : null}
      </section>

      <section id="concurrentieprijzen" className="ps-panel scroll-mt-24 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-[#24384f]">Concurrenten en prijzen</h2>
            <p className="mt-1 text-[11px] text-[#7b8999]">Alleen bevestigde productmatches tellen mee. Prijzen inclusief btw staan voorop, aanvullende gegevens vind je per concurrent.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="ps-chip ps-chip-blue">{pricedMatches.length} met bevestigde prijs</span>
            {reviewMatches.length ? <a href="#concurrenten-vinden" className="ps-chip ps-chip-amber">{reviewMatches.length} te beoordelen</a> : null}
          </div>
        </div>

        <div className="space-y-3 p-5 sm:px-6">
          {comparisonMatches.map((match, index) => {
            const offer = match.competitorOffer
            const price = numberValue(offer.normalizedPrice)
            const competitorVatRate = numberValue(offer.competitor.country.vatRate)
            const priceExVat = price !== null && competitorVatRate !== null ? price / (1 + competitorVatRate / 100) : null
            const normalizedShipping = numberValue(offer.normalizedShippingCost)
            const deliveredPrice = numberValue(offer.deliveredPrice)
            const competitorShippingEx = normalizedShipping !== null && competitorVatRate !== null ? normalizedShipping / (1 + competitorVatRate / 100) : null
            const deliveredEx = priceExVat !== null && competitorShippingEx !== null ? priceExVat + competitorShippingEx : null
            const deliveredDifference = ownCurrency === 'EUR' && ownAmounts.totalInc !== null && deliveredPrice !== null ? deliveredPrice - ownAmounts.totalInc : null
            const deltaAmount = deliveredDifference ?? (ownCurrency === 'EUR' && comparisonOwnPrice !== null && price !== null ? price - comparisonOwnPrice : null)
            const ownDeltaPct = deltaAmount === null ? null : deliveredDifference !== null && ownAmounts.totalInc && ownAmounts.totalInc > 0 ? deltaAmount / ownAmounts.totalInc * 100 : comparisonOwnPrice && comparisonOwnPrice > 0 ? deltaAmount / comparisonOwnPrice * 100 : null
            const latestSourceCheck = offer.priceChecks[0]
            const sourceIssue = sourceIssueLabel(latestSourceCheck?.errorMessage)
            const frequencyHours = offer.competitor.checkFrequencyHours
            const deltaTone = ownDeltaPct !== null && ownDeltaPct < 0 ? 'text-[#b6414d]' : ownDeltaPct !== null && ownDeltaPct > 0 ? 'text-[#20814d]' : 'text-[#708095]'

            return (
              <article key={match.id} className="rounded-[14px] border border-[#e1e8f0] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[160px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#2d4057]">{offer.competitor.name}</h3>
                      <span className={`ps-chip ${price !== null ? 'ps-chip-green' : 'ps-chip-amber'}`}>{price !== null ? 'Product en prijs bevestigd' : 'Product gekoppeld, prijs niet bevestigd'}</span>
                      {price !== null && index === 0 ? <span className="ps-chip ps-chip-blue">Laagste gevonden prijs</span> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-[#78889a]">{offer.competitor.country.name} · {offer.lastCheckedAt ? `Gecontroleerd ${formatDate(offer.lastCheckedAt)}` : 'Nog niet gecontroleerd'}</p>
                    <a href={offer.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-[#2f6edb]">Bekijk het product bij de concurrent</a>
                  </div>
                  <div className="min-w-[140px]">
                    <p className="text-[11px] text-[#78889a]">Prijs inclusief btw</p>
                    <p className="mt-1 text-[23px] font-semibold tracking-[-0.02em] text-[#21364d]">{price === null ? 'Nog geen prijs' : formatCurrency(price, offer.currency)}</p>
                    <p className="mt-0.5 text-[11px] text-[#78889a]">{priceExVat === null ? 'Excl. btw onbekend' : `${formatCurrency(priceExVat, offer.currency)} excl. btw`}</p>
                  </div>
                  <div className="min-w-[150px]">
                    <p className="text-[11px] text-[#78889a]">Verschil met jouw prijs</p>
                    <p className={`mt-1 text-[15px] font-semibold ${deltaTone}`}>{deltaAmount === null || ownDeltaPct === null ? 'Nog niet te berekenen' : `${deltaAmount > 0 ? '+' : ''}${formatCurrency(deltaAmount, offer.currency)} · ${ownDeltaPct > 0 ? '+' : ''}${formatNumber(ownDeltaPct, 1)}%`}</p>
                    <p className="mt-1 text-[11px] text-[#78889a]">{deliveredDifference !== null ? 'Inclusief verzendkosten' : 'Productprijs zonder volledig bevestigde bezorgkosten'}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    {canEditCompetitors ? (
                      <form action={runCompetitorOfferResearchAction}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="competitorOfferId" value={offer.id} />
                        <PriceFetchSubmitButton compact idleLabel={latestSourceCheck ? 'Prijs opnieuw ophalen' : 'Prijs ophalen'} pendingLabel="Ophalen…" />
                      </form>
                    ) : null}
                    <details className="text-[11px] text-[#526780]">
                      <summary className="cursor-pointer font-semibold text-[#2f6edb]">Prijsdetails en beheer</summary>
                      <div className="mt-2 space-y-1 rounded-[9px] border border-[#e7edf3] bg-[#f8fafc] p-3">
                        <p>Verzending incl. btw: {normalizedShipping === null ? 'Onbekend' : normalizedShipping === 0 ? 'Gratis' : formatCurrency(normalizedShipping, offer.currency)}</p>
                        <p>Verzending excl. btw: {formatCurrency(competitorShippingEx, offer.currency)}</p>
                        <p>Totaal incl. btw: {formatCurrency(deliveredPrice, offer.currency)}</p>
                        <p>Totaal excl. btw: {formatCurrency(deliveredEx, offer.currency)}</p>
                        <p>Automatische controle: {frequencyLabel(frequencyHours)}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&historie=${offer.id}#historie`} className="secondary-action px-3 py-1.5 text-[11px]">Historie</Link>
                          {canEditCompetitors ? <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&concurrent=${offer.id}#concurrentieprijzen`} className="secondary-action px-3 py-1.5 text-[11px]">Wijzigen</Link> : null}
                          {canEditCompetitors ? <form action={removeCompetitorOfferAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="competitorOfferId" value={offer.id} /><RemoveCompetitorButton label={offer.competitor.name} /></form> : null}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
                {sourceIssue ? <div className="mt-3 rounded-[9px] bg-[#fff8eb] px-3 py-2 text-[11px] text-[#76591d]">{sourceIssue} Dit is geen nieuwe bevestigde prijs.</div> : null}
              </article>
            )
          })}

          {comparisonMatches.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[#d4dde7] bg-[#fafbfd] px-5 py-8 text-center">
              <p className="text-[12px] font-semibold text-[#42566d]">Nog geen bevestigde concurrentieprijzen</p>
              <p className="mx-auto mt-1 max-w-xl text-[10px] leading-5 text-[#8391a1]">Gebruik hierboven Concurrenten en prijzen ophalen. Twijfelgevallen moeten eerst worden bevestigd voordat ze meetellen.</p>
              <a href="#concurrenten-vinden" className="primary-action mt-3 inline-flex">Concurrenten bekijken</a>
            </div>
          ) : null}

          {selectedCompetitorMatch && canEditCompetitors ? (() => {
            const selectedOffer = selectedCompetitorMatch.competitorOffer
            return (
              <details open className="rounded-[12px] border border-[#dce4ed] bg-[#fbfcfe]">
                <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-[#34495f]">Bron wijzigen, {selectedOffer.competitor.name}</summary>
                <form action={updateCompetitorOfferAction} className="grid gap-3 border-t border-[#e7edf3] p-4 md:grid-cols-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="competitorOfferId" value={selectedOffer.id} />
                  <label className="text-[10px] font-semibold text-[#5f7084]">Concurrent<input required name="competitorName" defaultValue={selectedOffer.competitor.name} className="toolbar-control mt-1.5 w-full" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Product URL<input required type="url" name="offerUrl" defaultValue={selectedOffer.url} className="toolbar-control mt-1.5 w-full" /></label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Controlefrequentie
                    <select name="checkFrequencyHours" defaultValue={selectedOffer.competitor.checkFrequencyHours} className="toolbar-control mt-1.5 w-full">
                      <option value="6">Elke 6 uur</option><option value="12">Elke 12 uur</option><option value="24">Dagelijks</option><option value="48">Elke 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Alleen handmatig</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold text-[#5f7084]">Prijs bevat btw
                    <select name="vatIncluded" defaultValue={selectedOffer.vatIncluded ? 'true' : 'false'} className="toolbar-control mt-1.5 w-full"><option value="true">Ja</option><option value="false">Nee</option></select>
                  </label>
                  <div className="md:col-span-2 rounded-xl border border-[#dce7f0] bg-white p-3">
                    <p className="text-[11px] font-semibold text-[#30465d]">Handmatige prijs en verzending (optioneel)</p>
                    <p className="mt-1 text-[10px] text-[#788a9e]">Laat leeg om alleen de bron te wijzigen. Handmatige waarden worden herkenbaar opgeslagen en bij een volgende succesvolle controle door actuele brondata vervangen.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-[10px] font-semibold text-[#5f7084]">Productprijs, {selectedOffer.currency}<input name="manualPrice" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Bijvoorbeeld 121,00" /></label>
                      <label className="text-[10px] font-semibold text-[#5f7084]">Prijs in andere btw variant<input name="manualPriceOther" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Optioneel, ter controle" /></label>
                      <label className="text-[10px] font-semibold text-[#5f7084]">Verzendkosten, {selectedOffer.currency}<input name="manualShippingCost" inputMode="decimal" className="toolbar-control mt-1.5 w-full" placeholder="Leeg is onbekend, 0 is gratis" /></label>
                      <label className="text-[10px] font-semibold text-[#5f7084]">Btw op verzendkosten<select name="manualShippingVatIncluded" defaultValue="true" className="toolbar-control mt-1.5 w-full"><option value="true">Inclusief btw</option><option value="false">Exclusief btw</option></select></label>
                    </div>
                  </div>
                  <input type="hidden" name="packagingUnit" value={selectedOffer.packagingUnit ?? product.packagingUnit ?? 'stuks'} />
                  <input type="hidden" name="packagingQty" value={selectedOffer.packagingQty ?? product.packagingQty ?? 1} />
                  <div className="md:col-span-2 flex justify-end gap-2"><Link href={`/producten/${product.id}#concurrentieprijzen`} className="secondary-action">Sluiten</Link><button type="submit" className="primary-action">Opslaan</button></div>
                </form>
              </details>
            )
          })() : null}

          <details className="rounded-[12px] border border-[#e1e8f0] bg-[#fbfcfe]">
            <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-[#60758d]">Monitoring en datakwaliteit</summary>
            <div className="grid gap-3 border-t border-[#e7edf3] p-4 sm:grid-cols-2 xl:grid-cols-4">
              <div><p className="text-[9px] text-[#8793a3]">Automatische bronnen</p><p className="mt-1 text-[16px] font-semibold text-[#34495f]">{automaticMatches.length}</p></div>
              <div><p className="text-[9px] text-[#8793a3]">Nu aan de beurt</p><p className="mt-1 text-[16px] font-semibold text-[#34495f]">{automaticDue}</p></div>
              <div><p className="text-[9px] text-[#8793a3]">Verouderde bronnen</p><p className="mt-1 text-[16px] font-semibold text-[#34495f]">{staleSources}</p></div>
              <div><p className="text-[9px] text-[#8793a3]">Mislukte laatste controle</p><p className="mt-1 text-[16px] font-semibold text-[#34495f]">{failedLatestChecks}</p></div>
            </div>
          </details>
        </div>
      </section>


      <section id="prijsadvies" className="ps-panel scroll-mt-24 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#21364d]">Wat kun je met deze prijzen doen?</h2>
            <p className="mt-1 text-[12px] text-[#66778a]">Bekijk een prijsvoorstel en controleer het effect op je marge voordat je een wijziging goedkeurt.</p>
          </div>
          <Link href="/prijsstrategie" className="secondary-action">Prijsstrategie instellen</Link>
        </div>
        {pricedMatches.length === 0 ? (
          <p className="mt-4 rounded-[10px] bg-[#f7f9fc] p-4 text-[12px] text-[#526780]">Nog geen prijsadvies mogelijk. Haal eerst concurrentieprijzen op en bevestig eventuele productmatches.</p>
        ) : staleSources > 0 || failedLatestChecks > 0 ? (
          <div className="mt-4 rounded-[10px] bg-[#fff8eb] p-4 text-[12px] text-[#76591d]">Controleer eerst de brongegevens. {staleSources} verouderde bron{staleSources === 1 ? '' : 'nen'} en {failedLatestChecks} mislukte laatste controle{failedLatestChecks === 1 ? '' : 's'}. Gebruik een advies pas na een nieuwe betrouwbare prijscontrole.</div>
        ) : recommendedPrice === null ? (
          <p className="mt-4 rounded-[10px] bg-[#f7f9fc] p-4 text-[12px] text-[#526780]">Er is nog geen bruikbaar prijsvoorstel. Controleer je eigen prijs, kostprijs en prijsstrategie.</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[12px] bg-[#f5f8fc] p-4">
            <div>
              <p className="text-[11px] text-[#66778a]">Voorgestelde verkoopprijs</p>
              <p className="mt-1 text-[24px] font-semibold text-[#21364d]">{formatCurrency(recommendedPrice, ownCurrency)}</p>
              <p className="mt-1 text-[12px] text-[#66778a]">{actionLabel(recommendation?.action)}{expectedMargin === null ? ', marge nog onbekend' : `, verwachte marge ${formatNumber(expectedMargin, 1)}%`}</p>
            </div>
            <Link href="/prijsstrategie" className="primary-action">Prijsadvies beoordelen en aanvraag maken</Link>
          </div>
        )}
        <details className="mt-4 text-[12px] text-[#66778a]">
          <summary className="cursor-pointer font-semibold text-[#2f6edb]">Waarom dit prijsadvies?</summary>
          <p className="mt-2">{recommendation?.reason ?? 'Er zijn nog onvoldoende betrouwbare gegevens voor een onderbouwd prijsadvies.'}</p>
          <p className="mt-1">Minimale en maximale prijsgrenzen: {guardrailText}. Huidige marge: {currentMargin === null ? 'onbekend' : `${formatNumber(currentMargin, 1)}%`}.</p>
        </details>
      </section>
      <details open={readParam(query.broninfo) === '1'} className="ps-panel overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 text-[12px] font-semibold text-[#526780]">Aanvullende prijsinformatie en broninstellingen</summary>
        <div id="broninformatie" className="space-y-4 border-t border-[#e7edf3] p-4">
      {(comparisonOwnPrice !== null || pricedMatches.length > 0) ? (
        <section className="ps-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#e7edf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-[#21364d]">Marktpositie</h2>
              <p className="mt-1 text-[11px] text-[#7f8ea0]">Eigen prijs, concurrentieprijzen en actuele prijspositie.</p>
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
      ) : null}


      <OwnProductSyncSettings key={defaultCountry?.id ?? 'none'} productId={product.id} countryId={defaultCountry?.id ?? null}
        marketName={defaultCountry?.name ?? null} hasUrl={Boolean(selectedMarket?.ownUrl)} canWrite={canEditProduct}
        initialSource={ownSyncSource ? { ...ownSyncSource, lastRunAt: ownSyncSource.lastRunAt?.toISOString() ?? null } : null} />


      {readParam(query.broninfo) === '1' ? <EanPriceSuggestions
        productId={product.id}
        ean={product.ean || product.gtin}
        countryId={defaultCountry?.id ?? null}
        countryName={defaultCountry?.name ?? null}
        currency={ownCurrency}
        sourceKey={marketMatches.map((match) => match.competitorOffer.id).join(',')}
        canEditProduct={canEditProduct}
        canRefresh={canEditCompetitors}
      /> : <Link href={`/producten/${product.id}?markt=${defaultCountry?.id ?? ''}&broninfo=1#broninformatie`} className="secondary-action inline-flex">Extra broninformatie ophalen</Link>}


        </div>
      </details>
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

      <details className="ps-panel overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 text-[12px] font-semibold text-[#526780]">Zelf een concurrent toevoegen en overige markten bekijken</summary>
        <div className="border-t border-[#e7edf3] p-4">
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
      </details>
    </div>
  )
}
