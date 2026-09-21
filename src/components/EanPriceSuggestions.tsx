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
  vatIncluded: boolean | null
  vatRate: number
  currency: string
  confidence: 'HIGH' | 'REVIEW' | 'UNAVAILABLE'
  method: string | null
  reason: string
  checkedAt: string
}
type Result = { suggestions: Suggestion[]; hasOwnUrl: boolean; hasCompetitors: boolean; error?: string }

const formatAmount = (value: number | null, currency: string) => value === null
  ? 'Niet vastgesteld'
  : new Intl.NumberFormat('nl-NL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)

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
    setPending(true)
    setError(null)
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

  return (
    <section id="ean-prijssuggesties" className="ps-panel scroll-mt-24 overflow-hidden" aria-label="Automatische EAN prijssuggesties">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf3] p-5 sm:px-6">
        <div>
          <p className="eyebrow">EAN {ean}</p>
          <h2 className="mt-1 text-[15px] font-semibold text-[#24384f]">Prijssuggesties</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#7b8999]">Eigen webshop en concurrenten, automatisch gecontroleerd in de gekozen markt. Je bepaalt zelf welke bron je gebruikt.</p>
        </div>
        <button type="button" className="secondary-action min-h-[40px]" onClick={check} disabled={pending}>
          {pending ? 'Prijzen controleren…' : 'Opnieuw controleren'}
        </button>
      </div>
      <div className="p-5 sm:px-6">
        {error ? <p role="alert" className="rounded-[10px] bg-[#fff1f2] px-4 py-3 text-[12px] text-[#a83f4b]">{error}</p> : null}
        {pending && !result ? <p role="status" className="text-[12px] text-[#60758d]">Prysight controleert nu de beschikbare productbronnen op EAN en prijs.</p> : null}
        {result && !result.hasOwnUrl ? <p className="mb-3 rounded-[10px] bg-[#f7faff] px-4 py-3 text-[11px] text-[#5f7084]">De eigen product URL ontbreekt voor deze markt. Voeg die hierboven bij jouw verkoopprijs toe, zodat ook de eigen webshopprijs live gecontroleerd kan worden.</p> : null}
        {result && !result.hasCompetitors ? <p className="mb-3 rounded-[10px] bg-[#f7faff] px-4 py-3 text-[11px] text-[#5f7084]">Nog geen concurrentbronnen beschikbaar. Prysight zoekt automatisch naar EAN kandidaten. Je kunt ook hieronder opnieuw naar concurrenten zoeken.</p> : null}
        {items.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((item) => (
              <article key={item.id} className="rounded-[12px] border border-[#e0e8f0] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#8793a3]">{item.kind === 'OWN' ? 'Eigen verkoopprijs' : 'Concurrentiesuggestie'}</p>
                    <h3 className="mt-1 truncate text-[13px] font-semibold text-[#30465d]">{item.name}</h3>
                  </div>
                  <span className={`ps-chip ${item.confidence === 'HIGH' ? 'ps-chip-green' : item.confidence === 'REVIEW' ? 'ps-chip-amber' : ''}`}>
                    {item.confidence === 'HIGH' ? 'EAN bevestigd' : item.confidence === 'REVIEW' ? 'Controleren' : 'Geen prijs'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[10px] bg-[#f3f7fb] px-3 py-3">
                    <p className="text-[10px] text-[#74869a]">Inclusief btw</p>
                    <p className="mt-1 text-[15px] font-semibold text-[#24384f]">{formatAmount(item.priceInclVat, item.currency)}</p>
                  </div>
                  <div className="rounded-[10px] bg-[#f3f7fb] px-3 py-3">
                    <p className="text-[10px] text-[#74869a]">Exclusief btw</p>
                    <p className="mt-1 text-[15px] font-semibold text-[#24384f]">{formatAmount(item.priceExclVat, item.currency)}</p>
                  </div>
                </div>
                {item.observedPrice !== null ? <p className="mt-2 text-[10px] text-[#687c90]">Gelezen bronprijs: {formatAmount(item.observedPrice, item.currency)} · Btw {item.vatIncluded === null ? 'onbekend' : item.vatIncluded ? 'inbegrepen' : 'niet inbegrepen'} · Tarief {item.vatRate}%</p> : null}
                <p className="mt-2 text-[11px] leading-5 text-[#6f8093]">{item.reason}</p>
                <p className="mt-1 text-[10px] text-[#8793a3]">Controle: {new Date(item.checkedAt).toLocaleString('nl-NL')} · {item.method ?? 'Bron niet uitgelezen'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#edf1f5] pt-3">
                  <a className="secondary-action min-h-[36px] px-3 py-2 text-[11px]" href={item.url} target="_blank" rel="noreferrer">Bekijk bron</a>
                  {item.kind === 'OWN' && canEditProduct && item.observedPrice !== null && item.vatIncluded !== null && item.currency === currency ? (
                    <form action={updateProductOwnPriceAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="countryId" value={countryId} />
                      <input type="hidden" name="currency" value={item.currency} />
                      <input type="hidden" name="ownPrice" value={String(item.observedPrice)} />
                      <input type="hidden" name="vatIncluded" value={String(item.vatIncluded)} />
                      <input type="hidden" name="ownUrl" value={item.url} />
                      <button type="submit" className="primary-action min-h-[36px] px-3 py-2 text-[11px]">Eigen prijs overnemen</button>
                    </form>
                  ) : null}
                  {item.kind === 'COMPETITOR' && item.matchId ? (
                    <a className="primary-action min-h-[36px] px-3 py-2 text-[11px]" href="#concurrenten-vinden">Match controleren en gebruiken</a>
                  ) : null}
                </div>
                {item.kind === 'OWN' && item.observedPrice !== null && item.currency !== currency ? <p className="mt-2 text-[10px] text-[#a36816]">De valuta wijkt af van de gekozen markt. Controleer en pas de prijs handmatig aan.</p> : null}
              </article>
            ))}
          </div>
        ) : !pending && result ? <p className="text-[11px] text-[#74869a]">Nog geen productbronnen om automatisch te controleren.</p> : null}
      </div>
    </section>
  )
}
