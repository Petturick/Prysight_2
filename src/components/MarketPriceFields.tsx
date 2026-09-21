'use client'

import { useEffect, useState } from 'react'

type CountryOption = {
  id: string
  name: string
  currency: string
  vatRate: number
}

function parsePrice(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatInput(value: number | null) {
  if (value === null || !Number.isFinite(value)) return ''
  return value.toFixed(2).replace('.', ',')
}

export function MarketPriceFields({
  countries,
  defaultCountryId,
  initialPrice = null,
  initialVatIncluded = true,
  showCountry = true,
  showCurrency = true,
}: {
  countries: CountryOption[]
  defaultCountryId?: string | null
  initialPrice?: number | null
  initialVatIncluded?: boolean
  showCountry?: boolean
  showCurrency?: boolean
}) {
  const initialCountry = countries.find((country) => country.id === defaultCountryId) ?? countries[0] ?? null
  const initialVatRate = Number(initialCountry?.vatRate ?? 0)
  const initialMultiplier = 1 + initialVatRate / 100
  const initialNumeric = initialPrice === null ? null : Number(initialPrice)

  const [countryId, setCountryId] = useState(initialCountry?.id ?? '')
  const [currency, setCurrency] = useState(initialCountry?.currency ?? 'EUR')
  const [source, setSource] = useState<'ex' | 'inc'>(initialVatIncluded ? 'inc' : 'ex')
  const [exVat, setExVat] = useState(
    initialNumeric === null ? '' : formatInput(initialVatIncluded ? initialNumeric / initialMultiplier : initialNumeric),
  )
  const [incVat, setIncVat] = useState(
    initialNumeric === null ? '' : formatInput(initialVatIncluded ? initialNumeric : initialNumeric * initialMultiplier),
  )

  const selectedCountry = countries.find((country) => country.id === countryId) ?? initialCountry
  const vatRate = Number(selectedCountry?.vatRate ?? 0)
  const multiplier = 1 + vatRate / 100

  function onExVat(value: string) {
    setSource('ex')
    setExVat(value)
    const parsed = parsePrice(value)
    setIncVat(parsed === null ? '' : formatInput(parsed * multiplier))
  }

  function onIncVat(value: string) {
    setSource('inc')
    setIncVat(value)
    const parsed = parsePrice(value)
    setExVat(parsed === null ? '' : formatInput(parsed / multiplier))
  }

  function changeCountry(nextId: string) {
    const nextCountry = countries.find((country) => country.id === nextId)
    const nextRate = Number(nextCountry?.vatRate ?? 0)
    const nextMultiplier = 1 + nextRate / 100
    setCountryId(nextId)
    if (nextCountry) setCurrency(nextCountry.currency)

    if (source === 'ex') {
      const parsed = parsePrice(exVat)
      setIncVat(parsed === null ? '' : formatInput(parsed * nextMultiplier))
    } else {
      const parsed = parsePrice(incVat)
      setExVat(parsed === null ? '' : formatInput(parsed / nextMultiplier))
    }
  }

  const sourcePrice = source === 'inc' ? incVat : exVat

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ price?: number | null; vatIncluded?: boolean | null }>).detail
      if (!detail || detail.price === null || detail.price === undefined || !Number.isFinite(Number(detail.price))) return
      const value = formatInput(Number(detail.price))
      if (detail.vatIncluded === false) onExVat(value)
      else onIncVat(value)
    }
    window.addEventListener('prysight:set-market-price', handler)
    return () => window.removeEventListener('prysight:set-market-price', handler)
  }, [multiplier])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {showCountry ? (
        <label className="text-[11px] font-semibold text-[#4f5869]">
          Marktprofiel *
          <select
            required
            name="countryId"
            value={countryId}
            onChange={(event) => changeCountry(event.target.value)}
            className="toolbar-control mt-1.5 w-full"
          >
            {countries.map((country) => (
              <option key={country.id} value={country.id}>{country.name}</option>
            ))}
          </select>
          <span className="mt-1 block text-[9px] font-normal leading-4 text-[#8793a3]">
            Dit product wordt voor deze markt opgeslagen en kan later per land worden gefilterd.
          </span>
        </label>
      ) : null}

      <label className="text-[11px] font-semibold text-[#4f5869]">
        Prijs excl. btw *
        <div className="mt-1.5 flex items-center rounded-[7px] border border-[#cbd9eb] bg-white focus-within:border-[#8cb1f3] focus-within:shadow-[0_0_0_3px_rgba(79,134,232,.09)]">
          <span className="px-3 text-[12px] font-semibold text-[#64748b]">{currency}</span>
          <input
            name="ownPriceExVat"
            required
            inputMode="decimal"
            value={exVat}
            onChange={(event) => onExVat(event.target.value)}
            className="min-h-[46px] flex-1 border-0 bg-transparent px-0 pr-3 text-[15px] font-semibold shadow-none outline-none"
            placeholder="0,00"
          />
        </div>
      </label>

      <label className="text-[11px] font-semibold text-[#4f5869]">
        Prijs incl. btw *
        <div className="mt-1.5 flex items-center rounded-[7px] border border-[#cbd9eb] bg-white focus-within:border-[#8cb1f3] focus-within:shadow-[0_0_0_3px_rgba(79,134,232,.09)]">
          <span className="px-3 text-[12px] font-semibold text-[#64748b]">{currency}</span>
          <input
            name="ownPriceIncVat"
            required
            inputMode="decimal"
            value={incVat}
            onChange={(event) => onIncVat(event.target.value)}
            className="min-h-[46px] flex-1 border-0 bg-transparent px-0 pr-3 text-[15px] font-semibold shadow-none outline-none"
            placeholder="0,00"
          />
        </div>
        <span className="mt-1 block text-[9px] font-normal leading-4 text-[#8793a3]">
          Btw {vatRate.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%, beide prijzen blijven automatisch aan elkaar gekoppeld.
        </span>
      </label>

      {showCurrency ? (
        <label className="text-[11px] font-semibold text-[#4f5869]">
          Valuta
          <select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="toolbar-control mt-1.5 w-full">
            <option>EUR</option>
            <option>GBP</option>
            <option>DKK</option>
            <option>USD</option>
          </select>
        </label>
      ) : null}

      <input type="hidden" name="ownPrice" value={sourcePrice.replace(',', '.')} />
      <input type="hidden" name="vatIncluded" value={String(source === 'inc')} />
    </div>
  )
}
