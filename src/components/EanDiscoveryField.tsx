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

export function EanDiscoveryField() {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [existing, setExisting] = useState<ExistingProduct | null>(null)
  const [message, setMessage] = useState('')
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

    try {
      const form = input.form
      const countryField = form?.elements.namedItem('countryId') as HTMLSelectElement | null
      const countryOption = countryField?.selectedOptions[0]
      const countryCode = countryOption?.textContent?.trim() === 'Nederland' ? 'NL' : 'NL'
      const response = await fetch('/api/products/recognize-ean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean, countryCode }),
      })
      const payload = await response.json() as EanResult
      if (currentRequest !== requestId.current || normalize(input.value) !== ean) return
      if (!response.ok) throw new Error(payload.error || 'Herkenning is tijdelijk niet beschikbaar.')

      const duplicate = payload.existingProduct ?? null
      setExisting(duplicate)
      input.setCustomValidity(duplicate ? 'Dit EAN bestaat al in Prysight. Open het bestaande product.' : '')
      if (duplicate) {
        setMessage('')
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
        if (control.value.trim() && control.value !== autoValues.current[name]) return
        const next = String(raw)
        control.value = next
        autoValues.current[name] = next
        control.dispatchEvent(new Event('input', { bubbles: true }))
        control.dispatchEvent(new Event('change', { bubbles: true }))
        applied += 1
      }
      apply('name', payload.name)
      apply('articleNumber', payload.articleNumber)
      apply('ownPrice', payload.ownPrice)
      apply('ownUrl', payload.ownUrl)
      apply('currency', payload.currency)
      apply('stockStatus', payload.stockStatus)
      apply('brand', payload.brand)
      apply('model', payload.model)
      apply('mpn', payload.mpn)
      apply('packagingQty', payload.packagingQty)
      apply('vatIncluded', payload.vatIncluded)
      setMessage(applied
        ? `${applied} productgegevens automatisch ingevuld. Controleer de overige velden.`
        : 'Product herkend. Controleer de overige verplichte velden.')
    } catch (error) {
      if (currentRequest !== requestId.current) return
      lastLookup.current = ''
      setMessage(error instanceof Error ? error.message : 'Productgegevens konden niet worden opgehaald.')
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
    </div>
  )
}
