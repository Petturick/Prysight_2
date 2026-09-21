'use client'

import { useMemo, useState } from 'react'

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
  const [countryId, setCountryId] = useState(initialCountry?.id ?? '')
  const [currency, setCurrency] = useState(initialCountry?.currency ?? 'EUR')
  const [sourceVatIncluded, setSourceVatIncluded] = useState(initialVatIncluded)
  const [sourcePrice, setSourcePrice] = useState(initialPrice === null ? '' : formatInput(initialPrice))

  const selectedCountry = useMemo(
    () => countries.find((country) => country.id === countryId) ?? initialCountry,
    [countries, countryId, initialCountry],
  )
  const vatRate = selectedCountry?.vatRate ?? 0
  const multiplier = 1 + vatRate / 100

  const sourceNumeric = parsePrice(sourcePrice)
  const exVat = sourceNumeric === null
    ? null
    : sourceVatIncluded
      ? sourceNumeric / multiplier
      : sourceNumeric
  const incVat = sourceNumeric === null
    ? null
    : sourceVatIncluded
      ? sourceNumeric
      : sourceNumeric * multiplier

  function onExVat(value: string) {
    setSourceVatIncluded(false)
    setSourcePrice(value)
  }

  function onIncVat(value: string) {
    setSourceVatIncluded(true)
    setSourcePrice(value)
  }

  function changeCountry(nextId: string) {
    const nextCountry = countries.find((country) => country.id === nextId)
    setCountryId(nextId)
    if (nextCountry) setCurrency(nextCountry.currency)
  }

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
            value={formatInput(exVat)}
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
            value={formatInput(incVat)}
            onChange={(event) => onIncVat(event.target.value)}
            className="min-h-[46px] flex-1 border-0 bg-transparent px-0 pr-3 text-[15px] font-semibold shadow-none outline-none"
            placeholder="0,00"
          />
        </div>
        <span className="mt-1 block text-[9px] font-normal leading-4 text-[#8793a3]">
          Btw {vatRate.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%, beide prijzen blijven automatisch gelijk aan elkaar.
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
      <input type="hidden" name="vatIncluded" value={String(sourceVatIncluded)} />
    </div>
  )
}
