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
      apply('articleNumber', payload.articleNumber)
      apply('name', payload.name)
      apply('ean', payload.ean)
      apply('ownPrice', payload.ownPrice)
      apply('currency', payload.currency, true)
      apply('stockStatus', payload.stockStatus)
      apply('packagingQty', payload.packagingQty)
      apply('brand', payload.brand)
      apply('productGroup', payload.productGroup)
      apply('model', payload.model)
      apply('mpn', payload.mpn)

      if (payload.vatIncluded !== null) apply('vatIncluded', payload.vatIncluded, true)

      const marketCode = marketCodeFromUrl(payload.url || rawUrl)
      const market = marketCode ? markets.find((item) => item.code.toUpperCase() === marketCode || (marketCode === 'GB' && item.code.toUpperCase() === 'UK')) : null
      if (market) {
        apply('countryId', market.id, true)
        apply('currency', market.currency, true)
      }

      setPreview(payload)
      const vatText = payload.vatIncluded === true
        ? 'Prijs is herkend als inclusief btw.'
        : payload.vatIncluded === false
          ? 'Prijs is herkend als exclusief btw.'
          : 'Btw status kon niet betrouwbaar worden herkend, controleer die handmatig.'

      const discoveryText = payload.ean
        ? ' EAN is herkend, na opslaan zoekt Prysight automatisch concurrenten in de gekozen markt.'
        : ' EAN is niet gevonden, vul die handmatig in voor de betrouwbaarste concurrentherkenning.'
      const marketText = market ? ` Markt ${market.name} is automatisch geselecteerd.` : ''
      setMessage(`Product herkend, ${applied} velden zijn ingevuld. ${vatText}${discoveryText}${marketText}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Productpagina kon niet worden geanalyseerd.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="strong-panel overflow-hidden">
      <div className="grid lg:grid-cols-[1.35fr_.65fr]">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf2ff] text-[12px] font-bold text-[#326fd3]">1</span>
            <div>
              <p className="text-[10px] font-semibold text-[#4f86e8]">Snelste invoer</p>
              <h2 className="mt-0.5 text-[17px] font-semibold text-[#20344b]">Plak je product URL</h2>
            </div>
          </div>

          <p className="mt-3 max-w-3xl text-[11px] leading-5 text-[#6f7d90]">
            Prysight leest de productpagina uit en vult waar mogelijk productnaam, SKU, EAN, merk, prijs, valuta en btw status in. Als een EAN wordt gevonden, wordt die na opslaan automatisch gebruikt voor concurrentherkenning.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text').trim()
                if (!/^https?:\/\//i.test(pasted)) return
                event.preventDefault()
                setUrl(pasted)
                void recognize(pasted)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void recognize()
                }
              }}
              type="url"
              className="toolbar-control min-h-[46px] flex-1"
              placeholder="https://jouwwebshop.nl/product/..."
              aria-label="Product URL"
            />
            <button
              type="button"
              onClick={() => void recognize()}
              disabled={loading}
              className="primary-action min-w-[160px] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? 'Herkennen…' : 'Product herkennen'}
            </button>
          </div>

          {message ? (
            <div className={`mt-3 rounded-[10px] px-3.5 py-2.5 text-[11px] font-semibold ${preview ? 'bg-[#eaf8f0] text-[#1f7548]' : 'bg-[#fff5e8] text-[#8a5b16]'}`}>
              {message}
            </div>
          ) : null}

          {preview ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.ownPrice !== null ? <span className="ps-chip ps-chip-green">Prijs herkend</span> : <span className="ps-chip ps-chip-amber">Prijs controleren</span>}
              {preview.articleNumber ? <span className="ps-chip ps-chip-blue">SKU herkend</span> : null}
              {preview.ean ? <span className="ps-chip ps-chip-green">EAN herkend, AI zoekactie klaar</span> : <span className="ps-chip ps-chip-amber">EAN nog nodig voor beste match</span>}
              {preview.vatIncluded !== null ? <span className="ps-chip ps-chip-blue">{preview.vatIncluded ? 'Incl. btw' : 'Excl. btw'}</span> : <span className="ps-chip ps-chip-amber">Btw status controleren</span>}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#e7edf3] bg-[#f8fafc] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[11px] font-semibold text-[#33465c]">Liever handmatig?</p>
          <p className="mt-1 text-[10px] leading-5 text-[#748296]">
            Laat de URL leeg en vul hieronder alleen artikelnummer, productnaam, prijs en btw status in. De overige kenmerken zijn optioneel.
          </p>
          <button
            type="button"
            onClick={() => {
              const form = document.getElementById(formId) as HTMLFormElement | null
              const target = form ? control(form, 'articleNumber') : null
              target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              target?.focus()
            }}
            className="secondary-action mt-4"
          >
            Handmatig invoeren
          </button>
        </div>
      </div>
    </section>
  )
}
