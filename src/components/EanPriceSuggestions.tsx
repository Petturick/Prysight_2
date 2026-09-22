'use client'

import { useCallback, useEffect, useState } from 'react'
import { updateProductOwnPriceAction } from '@/app/actions/productActions'

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
  ? 'Niet gevonden'
  : new Intl.NumberFormat('nl-NL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)

function sourceStatus(item: Suggestion) {
  if (item.priceInclVat !== null || item.priceExclVat !== null) return item.confidence === 'HIGH' ? 'Prijs bevestigd' : 'Prijs gevonden'
  if (/403|blokkeert|captcha|robots/i.test(item.reason)) return 'Bron blokkeert controle'
  return 'Geen prijs gevonden'
}

function PriceCard({ item, productId, countryId, currency, canEditProduct }: { item: Suggestion; productId: string; countryId: string; currency: string; canEditProduct: boolean }) {
  const hasPrice = item.priceInclVat !== null || item.priceExclVat !== null
  return (
    <article className={`rounded-[14px] border bg-white p-4 ${hasPrice ? 'border-[#d9e5ef]' : 'border-[#ead9ba]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8492a2]">{item.kind === 'OWN' ? 'Eigen webshop' : item.matchId ? 'Gekoppelde concurrent' : 'Automatisch gevonden via EAN'}</p>
          <h3 className="mt-1 truncate text-[13px] font-semibold text-[#2b4057]">{item.name}</h3>
        </div>
        <span className={`ps-chip ${hasPrice ? item.confidence === 'HIGH' ? 'ps-chip-green' : 'ps-chip-amber' : 'ps-chip-red'}`}>{sourceStatus(item)}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[11px] bg-[#f3f7fb] px-3 py-3">
          <p className="text-[10px] font-medium text-[#74869a]">Prijs inclusief btw</p>
          <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#21364d]">{formatAmount(item.priceInclVat, item.currency)}</p>
        </div>
        <div className="rounded-[11px] bg-[#f3f7fb] px-3 py-3">
          <p className="text-[10px] font-medium text-[#74869a]">Prijs exclusief btw</p>
          <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#21364d]">{formatAmount(item.priceExclVat, item.currency)}</p>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2.5">
          <p className="text-[9px] text-[#8593a3]">Verzendkosten</p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#42566d]">{item.shippingCost === 0 ? 'Gratis' : formatAmount(item.shippingCost, item.shippingCurrency ?? item.currency)}</p>
        </div>
        <div className="rounded-[10px] bg-[#eef7f2] px-3 py-2.5">
          <p className="text-[9px] text-[#668072]">Totaal inclusief verzending</p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#244b37]">{formatAmount(item.deliveredPriceInclVat, item.currency)}</p>
        </div>
      </div>

      {!hasPrice ? (
        <div className="mt-3 rounded-[10px] bg-[#fff8eb] px-3 py-2.5">
          <p className="text-[11px] font-semibold text-[#76591d]">{item.reason}</p>
          {/403|blokkeert|captcha/i.test(item.reason) ? <p className="mt-1 text-[10px] leading-4 text-[#8a6a2a]">De EAN en productbron zijn wel gevonden, maar de website laat geen servercontrole toe. Gebruik bij voorkeur de webshopintegratie of browsercontrole voor deze bron.</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-[10px] leading-4 text-[#687c90]">{item.reason}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#edf1f5] pt-3">
        <a className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]" href={item.url} target="_blank" rel="noreferrer">Bron bekijken</a>
        {item.kind === 'OWN' && canEditProduct && item.observedPrice !== null && item.vatIncluded !== null && item.currency === currency ? (
          <form action={updateProductOwnPriceAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="countryId" value={countryId} />
            <input type="hidden" name="currency" value={item.currency} />
            <input type="hidden" name="ownPrice" value={String(item.observedPrice)} />
            <input type="hidden" name="vatIncluded" value={String(item.vatIncluded)} />
            <input type="hidden" name="ownUrl" value={item.url} />
            <button type="submit" className="primary-action min-h-[34px] px-3 py-1.5 text-[10px]">Prijs overnemen</button>
          </form>
        ) : null}
        {item.kind === 'COMPETITOR' && item.matchId ? <a className="primary-action min-h-[34px] px-3 py-1.5 text-[10px]" href="#concurrenten-vinden">Match gebruiken</a> : null}
        {item.kind === 'COMPETITOR' && !item.matchId ? <a className="text-[10px] font-semibold text-[#2f6edb]" href="#concurrenten-vinden">Kandidaat koppelen</a> : null}
      </div>
      <p className="mt-2 text-[9px] text-[#8a97a6]">{new Date(item.checkedAt).toLocaleString('nl-NL')} · {item.method ?? 'Bron niet uitgelezen'}</p>
    </article>
  )
}

export function EanPriceSuggestions({
  productId, ean, countryId, currency, sourceKey, canEditProduct,
}: {
  productId: string
  ean: string | null
  countryId: string | null
  currency: string
  sourceKey: string
  canEditProduct: boolean
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
  const pricedCount = items.filter((item) => item.priceInclVat !== null || item.priceExclVat !== null).length
  const competitorPriceCount = competitors.filter((item) => item.priceInclVat !== null || item.priceExclVat !== null).length

  return (
    <section id="ean-prijssuggesties" className="ps-panel scroll-mt-24 overflow-hidden" aria-label="Automatische EAN prijsherkenning">
      <div className="border-b border-[#e7edf3] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">EAN {ean}</p>
            <h2 className="mt-1 text-[17px] font-semibold text-[#21364d]">Automatische prijsherkenning</h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#74869a]">Prysight zoekt op EAN naar de eigen productbron en concurrenten, leest prijzen uit en zet inclusief en exclusief btw direct naast elkaar.</p>
          </div>
          <button type="button" className="primary-action min-h-[40px]" onClick={check} disabled={pending}>
            {pending ? 'Prijzen worden opgehaald…' : 'Nu prijzen ophalen'}
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[10px] bg-[#f4f7fb] px-3 py-2.5"><p className="text-[9px] text-[#8492a2]">Productherkenning</p><p className="mt-0.5 text-[11px] font-semibold text-[#30465d]">EAN gevonden</p></div>
          <div className="rounded-[10px] bg-[#f4f7fb] px-3 py-2.5"><p className="text-[9px] text-[#8492a2]">Eigen bron</p><p className="mt-0.5 text-[11px] font-semibold text-[#30465d]">{result ? result.hasOwnUrl || ownItem ? 'Gevonden' : 'Nog niet gevonden' : 'Controleren…'}</p></div>
          <div className="rounded-[10px] bg-[#f4f7fb] px-3 py-2.5"><p className="text-[9px] text-[#8492a2]">Concurrenten</p><p className="mt-0.5 text-[11px] font-semibold text-[#30465d]">{result ? `${competitors.length} bron${competitors.length === 1 ? '' : 'nen'}` : 'Controleren…'}</p></div>
          <div className={`rounded-[10px] px-3 py-2.5 ${pricedCount ? 'bg-[#eef7f2]' : 'bg-[#fff8eb]'}`}><p className="text-[9px] text-[#8492a2]">Prijzen opgehaald</p><p className="mt-0.5 text-[11px] font-semibold text-[#30465d]">{pending && !result ? 'Bezig…' : `${pricedCount} van ${items.length}`}</p></div>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:px-6">
        {error ? <p role="alert" className="rounded-[10px] bg-[#fff1f2] px-4 py-3 text-[12px] text-[#a83f4b]">{error}</p> : null}
        {pending && !result ? <p role="status" className="rounded-[10px] bg-[#f5f8fc] px-4 py-3 text-[11px] text-[#60758d]">EAN herkend. Prysight zoekt nu productbronnen en controleert prijs, btw en verzendkosten.</p> : null}

        {result && !result.hasOwnUrl && !ownItem ? <div className="rounded-[11px] bg-[#fff8eb] px-4 py-3 text-[11px] text-[#76591d]">Eigen productbron niet gevonden. Koppel de eigen webshop onder <a href="/beheer/webshops" className="font-semibold underline">Webshops</a> of <a href="/integraties" className="font-semibold underline">Integraties</a>.</div> : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-[12px] font-semibold text-[#34495f]">Eigen verkoopprijs</h3><span className="text-[10px] text-[#8793a3]">Inclusief en exclusief btw zichtbaar zodra een prijs is gelezen</span></div>
          {ownItem ? <PriceCard item={ownItem} productId={productId} countryId={countryId} currency={currency} canEditProduct={canEditProduct} /> : <div className="rounded-[12px] border border-dashed border-[#d6dee8] bg-[#fafbfd] px-4 py-5 text-[11px] text-[#7b8999]">Nog geen leesbare eigen prijs gevonden.</div>}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-[12px] font-semibold text-[#34495f]">Concurrentieprijzen</h3><p className="mt-0.5 text-[10px] text-[#8793a3]">{competitorPriceCount} prijs{competitorPriceCount === 1 ? '' : 'en'} leesbaar, {competitors.length} bron{competitors.length === 1 ? '' : 'nen'} gevonden{result?.autoDiscoveredCount ? `, ${result.autoDiscoveredCount} automatisch via EAN` : ''}.</p></div>
            <a href="#concurrenten-vinden" className="text-[10px] font-semibold text-[#2f6edb]">Concurrenten beheren</a>
          </div>
          {competitors.length ? <div className="grid gap-3 xl:grid-cols-2">{competitors.map((item) => <PriceCard key={item.id} item={item} productId={productId} countryId={countryId} currency={currency} canEditProduct={canEditProduct} />)}</div> : <div className="rounded-[12px] border border-dashed border-[#d6dee8] bg-[#fafbfd] px-4 py-5 text-[11px] text-[#7b8999]">Nog geen concurrentbron met deze EAN gevonden. Prysight zoekt bij iedere controle opnieuw.</div>}
        </div>

        <p className="border-t border-[#edf1f5] pt-3 text-[9px] leading-4 text-[#8a97a6]">Een EAN identificeert het product, maar garandeert niet dat een website de prijs technisch laat uitlezen. Bij een blokkade gebruikt Prysight een gekoppelde webshopintegratie of browsercontrole zodra die beschikbaar is.</p>
      </div>
    </section>
  )
}