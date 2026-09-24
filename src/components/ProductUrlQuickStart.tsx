'use client'

import { useState } from 'react'

type ProductPreview = {
  url: string
  name: string | null
  articleNumber: string | null
  ean: string | null
  ownPrice: number | null
  currency: string | null
  stockStatus: string | null
  packagingQty: number | null
  extractionMethod: string | null
  vatIncluded: boolean | null
  vatConfidence: 'HIGH' | 'MEDIUM' | 'UNKNOWN'
  vatEvidence: string | null
  brand: string | null
  productGroup: string | null
  model: string | null
  mpn: string | null
  description?: string | null
  image?: string | null
  shippingCost?: number | null
  shippingCurrency?: string | null
  shippingLabel?: string | null
  partial?: boolean
  reason?: string | null
  warnings?: string[]
  conflicts?: string[]
  priceTrusted?: boolean
  sources?: Array<{ url: string; origin?: string }>
  existingProduct: { id: string; articleNumber: string; name: string; ean: string | null; gtin: string | null; reason: 'ARTICLE_NUMBER' | 'EAN' | 'GTIN' | 'URL' } | null
}

function control(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
}

function setControl(form: HTMLFormElement, name: string, value: string | number | boolean | null | undefined, overwrite = false) {
  if (value === null || value === undefined || value === '') return false
  const element = control(form, name)
  if (!element) return false
  if (!overwrite && element.value.trim()) return false
  element.value = typeof value === 'boolean' ? String(value) : String(value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

type MarketOption = { id: string; code: string; name: string; currency: string; vatRate: number }

function marketCodeFromUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase()
    if (host.endsWith('.nl')) return 'NL'
    if (host.endsWith('.be')) return 'BE'
    if (host.endsWith('.de')) return 'DE'
    if (host.endsWith('.fr')) return 'FR'
    if (host.endsWith('.pt')) return 'PT'
    if (host.endsWith('.co.uk') || host.endsWith('.uk')) return 'GB'
  } catch {}
  return null
}

export function ProductUrlQuickStart({ formId, markets = [] }: { formId: string; markets?: MarketOption[] }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<ProductPreview | null>(null)
  const [shippingAccepted, setShippingAccepted] = useState(false)
  const [lastMarket, setLastMarket] = useState<MarketOption | null>(null)

  async function recognize(inputUrl?: string) {
    const rawUrl = (inputUrl ?? url).trim()
    if (!rawUrl) {
      setMessage('Plak eerst de URL van je productpagina.')
      return
    }

    setLoading(true)
    setMessage(null)
    setPreview(null)
    setShippingAccepted(false)
    try {
      const selectedCountry = (document.getElementById(formId) as HTMLFormElement | null)?.elements.namedItem('countryId') as HTMLSelectElement | null
      const selectedMarket = markets.find((market) => market.id === selectedCountry?.value)
      const response = await fetch('/api/products/preview-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl, countryCode: selectedMarket?.code ?? 'GLOBAL' }),
        signal: AbortSignal.timeout(24_000),
      })
      const payload = await response.json() as ProductPreview & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Productpagina kon niet automatisch worden herkend.')

      const form = document.getElementById(formId) as HTMLFormElement | null
      if (!form) throw new Error('Het productformulier kon niet worden gevonden.')

      if (payload.partial) {
        setControl(form, 'ownUrl', payload.url || rawUrl, true)
        setPreview(payload)
        setMessage(payload.reason || 'Er zijn geen betrouwbare gegevens gevonden. Vul ontbrekende velden handmatig in of gebruik de productfeed of het EAN.')
        return
      }
      let applied = 0
      const apply = (name: string, value: string | number | boolean | null | undefined, overwrite = false) => {
        if (setControl(form, name, value, overwrite)) applied += 1
      }

      const marketCode = marketCodeFromUrl(payload.url || rawUrl)
      const selectedMarketId = control(form, 'countryId')?.value
      const market = (marketCode
        ? markets.find((item) => item.code.toUpperCase() === marketCode || (marketCode === 'GB' && item.code.toUpperCase() === 'UK'))
        : null) ?? markets.find((item) => item.id === selectedMarketId) ?? null
      setLastMarket(market)
      const validVatRate = market && Number.isFinite(market.vatRate) && market.vatRate >= 0 && market.vatRate <= 100
      const vatFactor = validVatRate ? 1 + market.vatRate / 100 : null
      const verifiedCurrency = !!market && !!payload.currency && payload.currency.toUpperCase() === market.currency.toUpperCase()
      const detectedPrice = verifiedCurrency && payload.priceTrusted !== false ? payload.ownPrice : null
      const priceIncludingVat = detectedPrice === null
        ? null
        : payload.vatIncluded === true
          ? detectedPrice
          : payload.vatIncluded === false && vatFactor
            ? detectedPrice * vatFactor
            : null
      const priceExcludingVat = detectedPrice === null
        ? null
        : payload.vatIncluded === false
          ? detectedPrice
          : payload.vatIncluded === true && vatFactor
            ? detectedPrice / vatFactor
            : null
      const money = (value: number | null) => value === null ? null : value.toFixed(2).replace('.', ',')

      apply('ownUrl', payload.url || rawUrl, true)
      apply('description', payload.description)
      apply('imageUrl', payload.image)
      apply('recognitionSources', payload.sources?.map((item) => item.url).join(' | '))
      apply('articleNumber', payload.articleNumber)
      apply('name', payload.name)
      apply('ean', payload.ean)
      apply('ownPrice', money(priceIncludingVat))
      apply('ownPriceOther', money(priceExcludingVat))
      apply('currency', payload.currency)
      apply('stockStatus', payload.stockStatus)
      apply('packagingQty', payload.packagingQty)
      if (payload.productGroup) {
        const group = control(form, 'productGroup') as HTMLSelectElement | null
        const option = [...(group?.options ?? [])].find((item) =>
          item.value.toLowerCase() === payload.productGroup?.trim().toLowerCase()
          || item.textContent?.trim().toLowerCase() === payload.productGroup?.trim().toLowerCase(),
        )
        if (option) apply('productGroup', option.value)
      }
      apply('brand', payload.brand)
      apply('model', payload.model)
      apply('mpn', payload.mpn)
      apply('vatIncluded', true, true)

      const eanControl = control(form, 'ean') as HTMLInputElement | null
      const articleControl = control(form, 'articleNumber') as HTMLInputElement | null
      eanControl?.setCustomValidity(payload.existingProduct ? 'Dit product bestaat al in Prysight.' : '')
      articleControl?.setCustomValidity(payload.existingProduct ? 'Dit product bestaat al in Prysight.' : '')

      if (market) {
        apply('countryId', market.id, true)
        apply('currency', market.currency)
      }

      const priceNeedsAttention = payload.ownPrice !== null && priceIncludingVat === null
      setPreview(payload)
      const warnings = payload.warnings?.length ? ' ' + payload.warnings.join(' ') : ''
      setMessage(payload.existingProduct
        ? `Dit product bestaat al als artikel ${payload.existingProduct.articleNumber}.`
        : priceNeedsAttention
          ? `${applied} velden ingevuld. De prijs is niet overgenomen omdat de webshop, btw status, het markttarief of de valuta niet betrouwbaar overeenkomt.${warnings}`
          : `${applied} velden ingevuld. Controleer de productgegevens en prijs.${warnings}`)
    } catch (error) {
      setMessage(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'De productpagina reageerde niet op tijd. Probeer opnieuw of herken via EAN of productfeed.'
        : error instanceof Error ? error.message : 'Productpagina kon niet worden geanalyseerd.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ps-panel px-4 py-4 sm:px-5" aria-label="Product herkennen via URL">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-[#20344b]">Product URL</h2>
        <span className="text-[11px] text-[#738298]">Optioneel, vult gegevens automatisch in</span>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          autoFocus
          onChange={event => setUrl(event.target.value)}
          onPaste={event => {
            const pasted = event.clipboardData.getData('text').trim()
            if (!/^https?:\/\//i.test(pasted)) return
            event.preventDefault()
            setUrl(pasted)
            void recognize(pasted)
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void recognize()
            }
          }}
          type="url"
          className="toolbar-control min-h-[42px] min-w-0 flex-1"
          placeholder="https://jouwwebshop.nl/product/..."
          aria-label="Product URL"
        />
        <button type="button" onClick={() => void recognize()} disabled={loading} className="primary-action shrink-0 disabled:cursor-wait disabled:opacity-60">
          {loading ? 'Herkennen…' : 'Product herkennen'}
        </button>
      </div>
      {message ? (
        <p role={preview?.existingProduct || !preview || preview.partial ? 'alert' : 'status'} className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${preview?.existingProduct || preview?.partial ? 'bg-[#fff5e8] text-[#8a5b16]' : preview ? 'bg-[#eaf8f0] text-[#1f7548]' : 'bg-[#fff5e8] text-[#8a5b16]'}`}>
          {message}
          {preview?.existingProduct ? <a href={`/producten/${preview.existingProduct.id}`} className="ml-2 font-semibold text-[#2f6edb] underline">Open bestaand product</a> : null}
        </p>
      ) : null}
      {preview && !preview.partial && (preview.description || preview.image || preview.shippingCost !== null && preview.shippingCost !== undefined) ? (
        <div className="mt-2 rounded-lg border border-[#dce6f2] bg-[#f8fbff] px-3 py-2 text-[11px] text-[#475d76]">
          {preview.description ? <p className="line-clamp-2">{preview.description}</p> : null}
          {preview.image ? <a href={preview.image} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-[#2f6edb] underline">Bekijk gevonden productafbeelding</a> : null}
          {preview.shippingCost !== null && preview.shippingCost !== undefined ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Gevonden verzendkosten: {preview.shippingCost.toFixed(2).replace('.', ',')} {preview.shippingCurrency ?? ''}. Bevestig dat dit bedrag inclusief btw voor de geselecteerde markt geldt.</span>
              <button type="button" className="secondary-action" disabled={shippingAccepted || !lastMarket || preview.shippingCurrency?.toUpperCase() !== lastMarket.currency.toUpperCase()}
                onClick={() => {
                  const form = document.getElementById(formId) as HTMLFormElement | null
                  if (!form || preview.shippingCost === null || preview.shippingCost === undefined || !lastMarket) return
                  if (control(form, 'countryId')?.value !== lastMarket.id) return
                  setControl(form, 'ownShippingCost', preview.shippingCost.toFixed(2).replace('.', ','), true)
                  setShippingAccepted(true)
                }}>{shippingAccepted ? 'Verzendkosten overgenomen' : 'Verzendkosten inclusief btw bevestigen'}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <button type="button" onClick={() => {
        const form = document.getElementById(formId) as HTMLFormElement | null
        const target = form ? control(form, 'articleNumber') : null
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target?.focus()
      }} className="mt-2 text-[12px] font-medium text-[#416b9d] hover:underline">
        Geen URL? Vul je product hieronder handmatig in
      </button>
    </section>
  )
}
