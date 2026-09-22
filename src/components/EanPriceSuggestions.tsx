'use client'

import { useEffect, useState } from 'react'
import { refreshProductIntelligenceAction, updateProductOwnPriceAction } from '@/app/actions/productActions'
import { PriceFetchSubmitButton } from '@/components/PriceFetchSubmitButton'

type Suggestion = {
  id: string
  matchId: string | null
  kind: 'OWN' | 'COMPETITOR'
  name: string
  url: string
  observedPrice: number | null
  priceInclVat: number | null
  priceExclVat: number | null
  shippingCost: number | null
  shippingCurrency: string | null
  deliveredPriceInclVat: number | null
  shippingLabel: string | null
  vatIncluded: boolean | null
  vatRate: number
  currency: string
  confidence: 'HIGH' | 'REVIEW' | 'UNAVAILABLE'
  method: string | null
  reason: string
  checkedAt: string
}

type Result = {
  ean?: string
  market?: string
  suggestions: Suggestion[]
  hasOwnUrl: boolean
  hasCompetitors: boolean
  autoDiscoveredCount?: number
  searchProvider?: string | null
  error?: string
}

const formatAmount = (value: number | null, currency: string) => value === null
  ? '—'
  : new Intl.NumberFormat('nl-NL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)

function sourceStatus(item: Suggestion) {
  if (item.priceInclVat !== null || item.priceExclVat !== null) return 'Prijs gevonden'
  if (/403|blokkeert|captcha|robots/i.test(item.reason)) return 'Bron blokkeert'
  if (/timeout|reageerde niet/i.test(item.reason)) return 'Geen reactie'
  return 'Nog geen prijs'
}

function sourceTone(item: Suggestion) {
  if (item.priceInclVat !== null || item.priceExclVat !== null) return 'ps-chip-green'
  if (/403|blokkeert|captcha|robots/i.test(item.reason)) return 'ps-chip-amber'
  return ''
}

function CompetitorRow({ item }: { item: Suggestion }) {
  return (
    <div className="grid gap-3 rounded-[11px] border border-[#e4eaf0] bg-white px-4 py-3 md:grid-cols-[minmax(180px,1fr)_130px_130px_120px_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[12px] font-semibold text-[#263b51]">{item.name}</p>
          <span className={`ps-chip ${sourceTone(item)}`}>{sourceStatus(item)}</span>
        </div>
        <p className="mt-0.5 truncate text-[9px] text-[#8794a3]">{item.matchId ? 'Gekoppelde bron' : 'Automatisch gevonden'}</p>
      </div>
      <div>
        <p className="text-[9px] text-[#8794a3]">Incl. btw</p>
        <p className="mt-0.5 text-[14px] font-semibold text-[#263b51]">{formatAmount(item.priceInclVat, item.currency)}</p>
      </div>
      <div>
        <p className="text-[9px] text-[#8794a3]">Excl. btw</p>
        <p className="mt-0.5 text-[14px] font-semibold text-[#263b51]">{formatAmount(item.priceExclVat, item.currency)}</p>
      </div>
      <div>
        <p className="text-[9px] text-[#8794a3]">Verzending</p>
        <p className="mt-0.5 text-[12px] font-semibold text-[#42566d]">{item.shippingCost === 0 ? 'Gratis' : formatAmount(item.shippingCost, item.shippingCurrency ?? item.currency)}</p>
      </div>
      <div className="md:text-right">
        <a href={item.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#2f6edb]">Bron bekijken</a>
      </div>
      {item.priceInclVat === null && item.priceExclVat === null && item.reason ? (
        <p className="md:col-span-5 text-[10px] leading-4 text-[#7a6541]">{item.reason}</p>
      ) : null}
    </div>
  )
}

export function EanPriceSuggestions({
  productId,
  ean,
  countryId,
  countryName,
  currency,
  sourceKey,
  canEditProduct,
  canRefresh,
}: {
  productId: string
  ean: string | null
  countryId: string | null
  countryName: string | null
  currency: string
  sourceKey: string
  canEditProduct: boolean
  canRefresh: boolean
}) {
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ean || !countryId) return
    const controller = new AbortController()
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return
      setPending(true)
      setError(null)
    })

    fetch(`/api/producten/${encodeURIComponent(productId)}/prijs-suggesties`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryId }),
    }).then(async (response) => {
      const data = await response.json() as Result
      if (!response.ok) throw new Error(data.error || 'Prijscontrole is niet gelukt.')
      return data
    }).then((data) => {
      if (!controller.signal.aborted) setResult(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Prijscontrole is niet gelukt.')
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false)
    })

    return () => controller.abort()
  }, [productId, ean, countryId, sourceKey])

  if (!ean || !countryId) return null

  const items = result?.suggestions ?? []
  const ownItem = items.find((item) => item.kind === 'OWN') ?? null
  const competitors = items.filter((item) => item.kind === 'COMPETITOR')
  const competitorsWithPrice = competitors.filter((item) => item.priceInclVat !== null || item.priceExclVat !== null)
  const lowestCompetitor = competitorsWithPrice
    .filter((item) => item.priceInclVat !== null)
    .sort((a, b) => Number(a.priceInclVat) - Number(b.priceInclVat))[0] ?? null

  const ownIncl = ownItem?.priceInclVat ?? null
  const ownExcl = ownItem?.priceExclVat ?? null
  const hasUsefulData = ownIncl !== null || ownExcl !== null || competitorsWithPrice.length > 0
  const ownBlocked = Boolean(ownItem && ownIncl === null && ownExcl === null && /403|blokkeert|captcha|robots/i.test(ownItem.reason))
  const primaryLabel = hasUsefulData || competitors.length ? 'Opnieuw marktdata ophalen' : 'Marktdata ophalen'

  return (
    <section id="ean-prijssuggesties" className="ps-panel scroll-mt-24 overflow-hidden" aria-label="Prijscontrole">
      <div className="flex flex-col gap-4 border-b border-[#e7edf3] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#1f3146]">Prijscontrole</h2>
            {countryName ? <span className="ps-chip ps-chip-blue">{countryName}</span> : null}
          </div>
          <p className="mt-1 text-[11px] text-[#74869a]">EAN {ean}. Prysight zoekt de eigen prijs en relevante marktbronnen voor dit product.</p>
        </div>

        {canRefresh ? (
          <form action={refreshProductIntelligenceAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="countryId" value={countryId} />
            <PriceFetchSubmitButton idleLabel={primaryLabel} pendingLabel="Marktdata ophalen…" />
          </form>
        ) : null}
      </div>

      <div className="p-5 sm:px-6">
        {error ? (
          <div role="alert" className="rounded-[10px] bg-[#fff1f2] px-4 py-3 text-[11px] font-medium text-[#a83f4b]">
            {error}
          </div>
        ) : pending && !result ? (
          <div className="rounded-[12px] bg-[#f5f8fc] px-4 py-5 text-center">
            <p className="text-[12px] font-semibold text-[#33485f]">Product wordt gecontroleerd</p>
            <p className="mt-1 text-[10px] text-[#7b8999]">Prysight controleert de eigen bron en bestaande marktbronnen.</p>
          </div>
        ) : !hasUsefulData && competitors.length === 0 ? (
          <div className="mx-auto max-w-2xl py-5 text-center">
            <p className="text-[16px] font-semibold text-[#263b51]">Nog geen bruikbare marktdata</p>
            <p className="mx-auto mt-2 max-w-xl text-[11px] leading-5 text-[#74869a]">
              De volgende stap is simpel. Laat Prysight concurrenten zoeken en prijzen ophalen op basis van EAN, artikelnummer, productcontext en markt.
            </p>
            {canRefresh ? (
              <form action={refreshProductIntelligenceAction} className="mt-4">
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="countryId" value={countryId} />
                <PriceFetchSubmitButton idleLabel="Start prijsvergelijking" pendingLabel="Zoeken en prijzen ophalen…" />
              </form>
            ) : null}
            {ownBlocked ? (
              <p className="mt-3 text-[10px] text-[#8a6a2a]">De eigen webshop blokkeert directe uitlezing. Prysight probeert alternatieve productbronnen automatisch mee te nemen.</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[12px] bg-[#f5f8fc] px-4 py-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8290a1]">Jouw prijs</p>
                <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatAmount(ownIncl, ownItem?.currency ?? currency)}</p>
                <p className="mt-1 text-[10px] text-[#8290a1]">{ownExcl === null ? 'Excl. btw nog onbekend' : `${formatAmount(ownExcl, ownItem?.currency ?? currency)} excl. btw`}</p>
              </div>
              <div className="rounded-[12px] bg-[#f5f8fc] px-4 py-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8290a1]">Laagste concurrent</p>
                <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatAmount(lowestCompetitor?.priceInclVat ?? null, lowestCompetitor?.currency ?? currency)}</p>
                <p className="mt-1 truncate text-[10px] text-[#8290a1]">{lowestCompetitor?.name ?? 'Nog geen prijs gevonden'}</p>
              </div>
              <div className="rounded-[12px] bg-[#f5f8fc] px-4 py-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8290a1]">Marktbronnen</p>
                <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#21364d]">{competitors.length}</p>
                <p className="mt-1 text-[10px] text-[#8290a1]">{competitorsWithPrice.length} met bruikbare prijs</p>
              </div>
            </div>

            {competitors.length ? (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-[12px] font-semibold text-[#34495f]">Concurrenten</h3>
                  <a href="#concurrenten-vinden" className="text-[10px] font-semibold text-[#2f6edb]">Bronnen beheren</a>
                </div>
                <div className="space-y-2">
                  {competitors.map((item) => <CompetitorRow key={item.id} item={item} />)}
                </div>
              </div>
            ) : null}
          </>
        )}

        {(ownItem || result?.searchProvider) ? (
          <details className="mt-4 border-t border-[#edf1f5] pt-3">
            <summary className="cursor-pointer text-[10px] font-semibold text-[#60758d]">Bronstatus</summary>
            <div className="mt-2 space-y-2 text-[10px] leading-4 text-[#7b8999]">
              {ownItem ? (
                <div className="flex flex-col gap-2 rounded-[9px] bg-[#f8fafc] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className={`ps-chip ${sourceTone(ownItem)}`}>{sourceStatus(ownItem)}</span>
                    <span className="ml-2">Eigen webshop</span>
                    {ownItem.reason ? <span className="ml-2 text-[#8a6a2a]">{ownItem.reason}</span> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={ownItem.url} target="_blank" rel="noreferrer" className="font-semibold text-[#2f6edb]">Bron bekijken</a>
                    {canEditProduct && ownItem.observedPrice !== null && ownItem.vatIncluded !== null && ownItem.currency === currency ? (
                      <form action={updateProductOwnPriceAction}>
                        <input type="hidden" name="productId" value={productId} />
                        <input type="hidden" name="countryId" value={countryId} />
                        <input type="hidden" name="currency" value={ownItem.currency} />
                        <input type="hidden" name="ownPrice" value={String(ownItem.observedPrice)} />
                        <input type="hidden" name="vatIncluded" value={String(ownItem.vatIncluded)} />
                        <input type="hidden" name="ownUrl" value={ownItem.url} />
                        <button type="submit" className="font-semibold text-[#2f6edb]">Prijs overnemen</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {result?.searchProvider ? <p>Zoekbron, {result.searchProvider}</p> : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  )
}
