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

type MarketOption = { id: string; code: string; name: string; currency: string }

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

  async function recognize(inputUrl?: string) {
    const rawUrl = (inputUrl ?? url).trim()
    if (!rawUrl) {
      setMessage('Plak eerst de URL van je productpagina.')
      return
    }

    setLoading(true)
    setMessage(null)
    setPreview(null)
    try {
      const response = await fetch('/api/products/preview-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl }),
      })
      const payload = await response.json() as ProductPreview & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Productpagina kon niet automatisch worden herkend.')

      const form = document.getElementById(formId) as HTMLFormElement | null
      if (!form) throw new Error('Het productformulier kon niet worden gevonden.')

      let applied = 0
      const apply = (name: string, value: string | number | boolean | null | undefined, overwrite = false) => {
        if (setControl(form, name, value, overwrite)) applied += 1
      }

      apply('ownUrl', payload.url || rawUrl, true)
      apply('articleNumber', payload.articleNumber, true)
      apply('name', payload.name, true)
      apply('ean', payload.ean, true)
      apply('ownPrice', payload.ownPrice, true)
      apply('currency', payload.currency, true)
      apply('stockStatus', payload.stockStatus, true)
      apply('packagingQty', payload.packagingQty, true)
      apply('brand', payload.brand, true)
      apply('model', payload.model, true)
      apply('mpn', payload.mpn, true)

      if (payload.vatIncluded !== null) apply('vatIncluded', payload.vatIncluded, true)

      const eanControl = control(form, 'ean') as HTMLInputElement | null
      const articleControl = control(form, 'articleNumber') as HTMLInputElement | null
      eanControl?.setCustomValidity(payload.existingProduct ? 'Dit product bestaat al in Prysight.' : '')
      articleControl?.setCustomValidity(payload.existingProduct ? 'Dit product bestaat al in Prysight.' : '')

      const marketCode = marketCodeFromUrl(payload.url || rawUrl)
      const market = marketCode ? markets.find((item) => item.code.toUpperCase() === marketCode || (marketCode === 'GB' && item.code.toUpperCase() === 'UK')) : null
      if (market) {
        apply('countryId', market.id, true)
        apply('currency', market.currency, true)
      }

      setPreview(payload)
      setMessage(payload.existingProduct
        ? `Dit product bestaat al als artikel ${payload.existingProduct.articleNumber}.`
        : `${applied} velden ingevuld. Controleer de productgegevens en prijs${payload.vatIncluded === null ? ', waaronder de btw status' : ''}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Productpagina kon niet worden geanalyseerd.')
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
        <p role={preview?.existingProduct || !preview ? 'alert' : 'status'} className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${preview?.existingProduct ? 'bg-[#fff5e8] text-[#8a5b16]' : preview ? 'bg-[#eaf8f0] text-[#1f7548]' : 'bg-[#fff5e8] text-[#8a5b16]'}`}>
          {message}
          {preview?.existingProduct ? <a href={`/producten/${preview.existingProduct.id}`} className="ml-2 font-semibold text-[#2f6edb] underline">Open bestaand product</a> : null}
        </p>
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
