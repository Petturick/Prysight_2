'use client'

import { useMemo, useRef, useState } from 'react'

type ExistingProduct = {
  id: string
  articleNumber: string
  name: string
  ean: string | null
  gtin: string | null
  reason: 'ARTICLE_NUMBER' | 'EAN' | 'GTIN' | 'URL'
}
type EanResult = {
  ean?: string
  found?: boolean
  source?: string
  feedMatched?: boolean
  name?: string | null
  articleNumber?: string | null
  ownPrice?: number | null
  ownUrl?: string | null
  currency?: string | null
  stockStatus?: string | null
  brand?: string | null
  model?: string | null
  mpn?: string | null
  packagingQty?: number | null
  vatIncluded?: boolean | null
  productGroup?: string | null
  ownShippingCost?: number | null
  ownShippingVatIncluded?: boolean | null
  shippingCurrency?: string | null
  image?: string | null
  description?: string | null
  sources?: Array<{ url: string; type: 'OWN_SHOP' | 'ONLINE' }>
  conflicts?: string[]
  existingProduct?: ExistingProduct | null
  error?: string
}

function normalize(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function gtinChecksumValid(value: string) {
  if (![8, 12, 13, 14].includes(value.length)) return false
  const digits = value.split('').map(Number)
  const check = digits.pop()
  if (check === undefined) return false
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

type Market = { id: string; code: string; vatRate: number; currency: string }

export function EanDiscoveryField({ markets = [] }: { markets?: Market[] }) {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [existing, setExisting] = useState<ExistingProduct | null>(null)
  const [message, setMessage] = useState('')
  const [onlinePreview, setOnlinePreview] = useState<EanResult | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)
  const lastLookup = useRef('')
  const autoValues = useRef<Record<string, string>>({})

  const status = useMemo(() => {
    if (existing) return {
      tone: 'text-[#a36816]',
      label: `Dit EAN staat al bij artikel ${existing.articleNumber}. Open het bestaande product.`,
    }
    if (checking) return { tone: 'text-[#60758d]', label: 'Productgegevens ophalen via EAN…' }
    if (message) return { tone: 'text-[#526b86]', label: message }
    if (!value) return { tone: 'text-[#7b8999]', label: 'Plak een EAN en Prysight zoekt automatisch het product.' }
    return gtinChecksumValid(value)
      ? { tone: 'text-[#20814d]', label: 'EAN geldig. Productherkenning beschikbaar.' }
      : { tone: 'text-[#a36816]', label: 'Controleer het EAN.' }
  }, [value, checking, existing, message])

  async function recognize(input: HTMLInputElement, force = false) {
    const ean = normalize(input.value)
    if (!gtinChecksumValid(ean) || (!force && lastLookup.current === ean)) return
    if (timer.current) clearTimeout(timer.current)
    lastLookup.current = ean
    const currentRequest = ++requestId.current
    setChecking(true)
    setExisting(null)
    setMessage('')
    setOnlinePreview(null)

    try {
      const form = input.form
      const countryField = form?.elements.namedItem('countryId') as HTMLSelectElement | null
      const countryOption = countryField?.selectedOptions[0]
      const countryName = countryOption?.textContent?.trim().toLowerCase() ?? ''
      const countryCode = markets.find((market) => market.id === countryField?.value)?.code ?? (
        { nederland: 'NL', belgië: 'BE', belgium: 'BE', duitsland: 'DE', germany: 'DE',
          frankrijk: 'FR', france: 'FR', portugal: 'PT', 'verenigd koninkrijk': 'GB',
          'united kingdom': 'GB', engeland: 'GB' } as Record<string, string>
      )[countryName] ?? 'NL'
      const response = await fetch('/api/products/recognize-ean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean, countryCode }),
        signal: AbortSignal.timeout(28_000),
      })
      const payload = await response.json() as EanResult
      if (currentRequest !== requestId.current || normalize(input.value) !== ean) return
      if (!response.ok) throw new Error(payload.error || 'Herkenning is tijdelijk niet beschikbaar.')

      const duplicate = payload.existingProduct ?? null
      setExisting(duplicate)
      setOnlinePreview(payload.found ? payload : null)
      input.setCustomValidity(duplicate ? 'Dit EAN bestaat al in Prysight. Open het bestaande product.' : '')
      if (duplicate) {
        setMessage('Online gegevens gecontroleerd. Gebruik de bestaande productpagina om dubbele artikelen te voorkomen.')
        return
      }
      if (!payload.found) {
        setMessage('Nog geen betrouwbare productgegevens gevonden. Je kunt het product hieronder aanvullen.')
        return
      }

      let applied = 0
      const apply = (name: string, raw: string | number | boolean | null | undefined) => {
        if (!form || raw === null || raw === undefined || raw === '') return
        const control = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
        if (!control) return
        // Preserve deliberate manual input but refresh values previously filled by EAN lookup.
        if (control.value.trim() && control.value !== autoValues.current[name]
          && !(name === 'packagingQty' && control.value === '1')) return
        const next = String(raw)
        control.value = next
        autoValues.current[name] = next
        control.dispatchEvent(new Event('input', { bubbles: true }))
        control.dispatchEvent(new Event('change', { bubbles: true }))
        applied += 1
      }
      apply('name', payload.name)
      apply('articleNumber', payload.articleNumber)
      const selectedMarket = markets.find((market) => market.id === countryField?.value)
      const rate = selectedMarket?.vatRate
      const factor = typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 100
        ? 1 + rate / 100 : null
      const selectedCurrency = (form?.elements.namedItem('currency') as HTMLSelectElement | null)?.value
      const safeCurrency = !!payload.currency && !!selectedMarket
        && payload.currency.toUpperCase() === selectedMarket.currency.toUpperCase()
        && selectedCurrency?.toUpperCase() === payload.currency.toUpperCase()
      const safePrice = safeCurrency ? payload.ownPrice : null
      // Primary form amount is always VAT-inclusive. Never assume an unknown tax basis or currency.
      const incl = safePrice === null || safePrice === undefined ? null
        : payload.vatIncluded === true ? safePrice
        : payload.vatIncluded === false && factor ? safePrice * factor : null
      const excl = safePrice === null || safePrice === undefined ? null
        : payload.vatIncluded === false ? safePrice
        : payload.vatIncluded === true && factor ? safePrice / factor : null
      const money = (amount: number | null) => amount === null ? null : amount.toFixed(2).replace('.', ',')
      apply('ownPrice', money(incl))
      apply('ownPriceOther', money(excl))
      if (payload.feedMatched && safeCurrency && payload.ownShippingVatIncluded === true
          && payload.shippingCurrency?.toUpperCase() === selectedMarket?.currency.toUpperCase()
          && payload.ownShippingCost !== null && payload.ownShippingCost !== undefined) {
        apply('ownShippingCost', money(payload.ownShippingCost))
      }
      apply('ownUrl', payload.ownUrl)
      apply('currency', payload.currency)
      apply('stockStatus', payload.stockStatus)
      apply('brand', payload.brand)
      apply('model', payload.model)
      apply('mpn', payload.mpn)
      apply('packagingQty', payload.packagingQty)
      // vatIncluded is a hidden form flag for the VAT-inclusive primary input, not the source amount.
      apply('gtin', payload.ean)
      apply('description', payload.description)
      apply('imageUrl', payload.image)
      apply('recognitionSources', payload.sources?.map((source) => source.url).join(' | '))
      if (payload.productGroup && form) {
        const group = form.elements.namedItem('productGroup') as HTMLSelectElement | null
        const option = [...(group?.options ?? [])].find((item) =>
          item.value.toLowerCase() === payload.productGroup?.toLowerCase()
          || item.textContent?.trim().toLowerCase() === payload.productGroup?.toLowerCase()
        )
        if (option) apply('productGroup', option.value)
      }
      const origin = payload.feedMatched ? 'productfeed en online bronnen' : 'online bronnen'
      const conflicts = payload.conflicts?.length ? ` Controleer verschillen tussen bronnen voor ${payload.conflicts.join(', ')}.` : ''
      const priceWarning = payload.ownPrice !== null && payload.ownPrice !== undefined && incl === null
        ? ' De gevonden prijs is niet ingevuld omdat de btw status, het markttarief of de valuta niet betrouwbaar overeenkomt.' : ''
      setMessage(applied
        ? `${applied} velden ingevuld via ${origin}. Controleer de overige velden.${priceWarning}${conflicts}`
        : `Product herkend via ${origin}. Controleer de ontbrekende verplichte gegevens.${priceWarning}${conflicts}`)
    } catch (error) {
      if (currentRequest !== requestId.current) return
      lastLookup.current = ''
      setMessage(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'Herkenning duurt te lang. Probeer opnieuw of gebruik je productfeed of de product URL.'
        : error instanceof Error ? error.message : 'Productgegevens konden niet worden opgehaald.')
    } finally {
      if (currentRequest === requestId.current) setChecking(false)
    }
  }

  return (
    <div>
      <label className="text-[11px] font-semibold text-[#4f5869]" htmlFor="new-product-ean">EAN</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id="new-product-ean"
          name="ean"
          inputMode="numeric"
          autoComplete="off"
          defaultValue=""
          onInput={(event) => {
            const input = event.currentTarget
            const normalized = normalize(input.value)
            if (input.value !== normalized) input.value = normalized
            input.setCustomValidity('')
            setExisting(null)
            setMessage('')
            setOnlinePreview(null)
            setValue(normalized)
            if (timer.current) clearTimeout(timer.current)
            requestId.current += 1
            if (!gtinChecksumValid(normalized)) {
              lastLookup.current = ''
              setChecking(false)
              return
            }
            if (event.nativeEvent.isTrusted) timer.current = setTimeout(() => void recognize(input), 650)
          }}
          onBlur={(event) => void recognize(event.currentTarget)}
          className="toolbar-control min-w-0 flex-1"
          placeholder="Bijvoorbeeld 8712345678901"
        />
        <button
          type="button"
          disabled={checking || !gtinChecksumValid(value)}
          onClick={() => {
            const input = document.getElementById('new-product-ean') as HTMLInputElement | null
            if (input) void recognize(input, true)
          }}
          className="secondary-action shrink-0 disabled:opacity-40"
        >
          {checking ? 'Zoeken…' : 'Herkennen'}
        </button>
      </div>
      <span role="status" className={`mt-1.5 block text-[10px] font-normal leading-4 ${status.tone}`}>{status.label}</span>
      {existing ? <a href={`/producten/${existing.id}`} className="mt-1.5 inline-flex text-[10px] font-semibold text-[#2f6edb] underline underline-offset-2">Open bestaand product</a> : null}
      {onlinePreview ? (
        <div className="mt-2 rounded-lg border border-[#dce6f2] bg-[#f8fbff] p-3 text-[11px] text-[#475d76]">
          <p className="font-semibold text-[#20344b]">Online gevonden: {onlinePreview.name ?? 'Productgegevens'}</p>
          {onlinePreview.description ? <p className="mt-1 line-clamp-3">{onlinePreview.description}</p> : null}
          {onlinePreview.productGroup ? <p className="mt-1">Categorie: {onlinePreview.productGroup}</p> : null}
          {onlinePreview.image ? <a href={onlinePreview.image} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-[#2f6edb] underline">Bekijk productafbeelding</a> : null}
          <p className="mt-1 text-[#64748b]">{onlinePreview.feedMatched ? 'Eigen productfeed herkend. ' : ''}Gecontroleerde online bronnen: {onlinePreview.sources?.length ?? 0}. Eigen verkoopprijs wordt alleen ingevuld wanneer die bij je eigen webshop of eigen productfeed en dit EAN hoort, met een vastgestelde btw status.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {onlinePreview.sources?.slice(0, 3).map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-[#2f6edb] underline">
                {source.type === 'OWN_SHOP' ? 'Eigen webshop' : 'Online bron'}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
