'use client'

import { useCallback, useEffect, useState } from 'react'
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
  ? 'Nog niet gevonden'
  : new Intl.NumberFormat('nl-NL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)

function statusLabel(item: Suggestion) {
  if (item.priceInclVat !== null || item.priceExclVat !== null) return 'Prijs gevonden'
  if (/403|blokkeert|captcha|robots/i.test(item.reason)) return 'Bron blokkeert'
  if (/timeout|reageerde niet/i.test(item.reason)) return 'Geen reactie'
  return 'Geen prijs'
}

function sourceTone(item: Suggestion) {
  if (item.priceInclVat !== null || item.priceExclVat !== null) return 'ps-chip-green'
  if (/403|blokkeert|captcha|robots/i.test(item.reason)) return 'ps-chip-amber'
  return 'ps-chip-red'
}

function SourceRow({
  item,
  productId,
  countryId,
  currency,
  canEditProduct,
}: {
  item: Suggestion
  productId: string
  countryId: string
  currency: string
  canEditProduct: boolean
}) {
  return (
    <div className="grid gap-3 rounded-[12px] border border-[#e3eaf1] bg-white px-4 py-4 lg:grid-cols-[minmax(180px,1.25fr)_minmax(120px,.8fr)_minmax(120px,.8fr)_minmax(130px,.85fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[12px] font-semibold text-[#2b4057]">{item.name}</p>
          <span className={`ps-chip ${sourceTone(item)}`}>{statusLabel(item)}</span>
        </div>
        <p className="mt-1 text-[9px] text-[#8a97a6]">{item.kind === 'OWN' ? 'Eigen bron' : item.matchId ? 'Gekoppelde concurrent' : 'Automatisch gevonden'}</p>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-[#8a97a6]">Incl. btw</p>
        <p className="mt-0.5 text-[16px] font-semibold text-[#21364d]">{formatAmount(item.priceInclVat, item.currency)}</p>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-[#8a97a6]">Excl. btw</p>
        <p className="mt-0.5 text-[16px] font-semibold text-[#21364d]">{formatAmount(item.priceExclVat, item.currency)}</p>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-[#8a97a6]">Verzending</p>
        <p className="mt-0.5 text-[12px] font-semibold text-[#42566d]">{item.shippingCost === 0 ? 'Gratis' : formatAmount(item.shippingCost, item.shippingCurrency ?? item.currency)}</p>
        {item.deliveredPriceInclVat !== null ? <p className="mt-0.5 text-[9px] text-[#668072]">Totaal {formatAmount(item.deliveredPriceInclVat, item.currency)}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <a className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]" href={item.url} target="_blank" rel="noreferrer">Bron</a>
        {item.kind === 'OWN' && canEditProduct && item.observedPrice !== null && item.vatIncluded !== null && item.currency === currency ? (
          <form action={updateProductOwnPriceAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="countryId" value={countryId} />
            <input type="hidden" name="currency" value={item.currency} />
            <input type="hidden" name="ownPrice" value={String(item.observedPrice)} />
            <input type="hidden" name="vatIncluded" value={String(item.vatIncluded)} />
            <input type="hidden" name="ownUrl" value={item.url} />
            <button type="submit" className="primary-action min-h-[34px] px-3 py-1.5 text-[10px]">Overnemen</button>
          </form>
        ) : null}
      </div>

      {item.priceInclVat === null && item.priceExclVat === null ? (
        <div className="lg:col-span-5 rounded-[9px] bg-[#fff8eb] px-3 py-2 text-[10px] leading-4 text-[#76591d]">{item.reason}</div>
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
  const [attempt, setAttempt] = useState(0)

  const check = useCallback(() => setAttempt((value) => value + 1), [])

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
      if (!response.ok) throw new Error(data.error || 'Prijzen ophalen is niet gelukt.')
      return data
    }).then((data) => {
      if (!controller.signal.aborted) setResult(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Prijzen ophalen is niet gelukt.')
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false)
    })

    return () => controller.abort()
  }, [productId, ean, countryId, sourceKey, attempt])

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

  return (
    <section id="ean-prijssuggesties" className="strong-panel scroll-mt-24 overflow-hidden" aria-label="Prijsintelligentie">
      <div className="border-b border-[#e7edf3] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="ps-chip ps-chip-green">EAN actief</span>
              {countryName ? <span className="ps-chip ps-chip-blue">{countryName}</span> : null}
            </div>
            <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-[#1f3146]">Prijzen en concurrenten</h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#74869a]">Prysight zoekt automatisch naar de eigen productbron en concurrenten, leest prijzen uit en zet inclusief en exclusief btw direct naast elkaar.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={check} disabled={pending} className="secondary-action min-h-[40px]">
              {pending ? 'Controleren…' : 'Snel verversen'}
            </button>
            {canRefresh ? (
              <form action={refreshProductIntelligenceAction}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="countryId" value={countryId} />
                <PriceFetchSubmitButton idleLabel="Prijzen en concurrenten ophalen" pendingLabel="Zoeken en prijzen ophalen…" />
              </form>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-5 sm:px-6">
        {error ? <div role="alert" className="mb-4 rounded-[10px] bg-[#fff1f2] px-4 py-3 text-[11px] font-medium text-[#a83f4b]">{error}</div> : null}
        {pending && !result ? <div className="mb-4 rounded-[10px] bg-[#f4f7fb] px-4 py-3 text-[11px] text-[#60758d]">EAN {ean} wordt nu gecontroleerd, Prysight zoekt bronnen en probeert prijzen uit te lezen.</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[12px] border border-[#e4ebf2] bg-white px-4 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#8492a2]">Eigen prijs incl. btw</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatAmount(ownIncl, ownItem?.currency ?? currency)}</p>
          </div>
          <div className="rounded-[12px] border border-[#e4ebf2] bg-white px-4 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#8492a2]">Eigen prijs excl. btw</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatAmount(ownExcl, ownItem?.currency ?? currency)}</p>
          </div>
          <div className="rounded-[12px] border border-[#e4ebf2] bg-white px-4 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#8492a2]">Laagste concurrent</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#21364d]">{formatAmount(lowestCompetitor?.priceInclVat ?? null, lowestCompetitor?.currency ?? currency)}</p>
            {lowestCompetitor ? <p className="mt-1 truncate text-[9px] text-[#8391a1]">{lowestCompetitor.name}</p> : null}
          </div>
          <div className="rounded-[12px] border border-[#e4ebf2] bg-white px-4 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#8492a2]">Concurrenten gevonden</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#21364d]">{competitors.length}</p>
            <p className="mt-1 text-[9px] text-[#8391a1]">{competitorsWithPrice.length} met leesbare prijs</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[12px] font-semibold text-[#34495f]">Eigen bron</h3>
              <p className="mt-0.5 text-[9px] text-[#8793a3]">De eigen verkoopprijs wordt eerst via integratie of webshop API geprobeerd, daarna via de productpagina.</p>
            </div>
          </div>
          {ownItem ? (
            <SourceRow item={ownItem} productId={productId} countryId={countryId} currency={currency} canEditProduct={canEditProduct} />
          ) : (
            <div className="rounded-[12px] border border-dashed border-[#d4dde7] bg-[#fafbfd] px-4 py-5 text-[11px] text-[#74869a]">
              Nog geen eigen prijs gevonden. Controleer of de eigen product URL of Magento koppeling voor deze markt aanwezig is.
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[12px] font-semibold text-[#34495f]">Concurrenten</h3>
              <p className="mt-0.5 text-[9px] text-[#8793a3]">
                {result ? `${competitors.length} bron${competitors.length === 1 ? '' : 'nen'} gevonden${result.autoDiscoveredCount ? `, ${result.autoDiscoveredCount} automatisch via EAN` : ''}${result.searchProvider ? ` via ${result.searchProvider}` : ''}.` : 'Wordt gecontroleerd…'}
              </p>
            </div>
            <a href="#concurrenten-vinden" className="text-[10px] font-semibold text-[#2f6edb]">Beheer bronnen</a>
          </div>

          {competitors.length ? (
            <div className="space-y-2">
              {competitors.map((item) => <SourceRow key={item.id} item={item} productId={productId} countryId={countryId} currency={currency} canEditProduct={canEditProduct} />)}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-[#d4dde7] bg-[#fafbfd] px-4 py-5">
              <p className="text-[11px] font-semibold text-[#42566d]">Nog geen concurrent gevonden voor deze EAN.</p>
              <p className="mt-1 text-[10px] leading-4 text-[#7b8999]">Gebruik de knop Prijzen en concurrenten ophalen, Prysight zoekt dan op EAN, artikelnummer, productcontext en markt en probeert gevonden bronnen direct te meten.</p>
            </div>
          )}
        </div>

        <details className="mt-4 border-t border-[#edf1f5] pt-3">
          <summary className="cursor-pointer text-[10px] font-semibold text-[#60758d]">Technische details</summary>
          <div className="mt-2 space-y-1 text-[9px] leading-4 text-[#8a97a6]">
            <p>EAN {ean}, markt {result?.market ?? countryName ?? 'onbekend'}, {items.length} gecontroleerde bronnen.</p>
            <p>Als een normale productpagina wordt geblokkeerd probeert Prysight ook openbare Magento, WooCommerce en Shopify product APIs en daarna een browsercontrole wanneer die is geconfigureerd.</p>
          </div>
        </details>
      </div>
    </section>
  )
}
