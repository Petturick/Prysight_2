'use client'

import { useMemo, useState } from 'react'

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

  const status = useMemo(() => {
    const normalized = normalize(value)
    if (!normalized) {
      return {
        tone: 'text-[#7b8999]',
        label: 'Met een EAN zoekt Prysight na opslaan automatisch naar hetzelfde product bij concurrenten in de gekozen markt.',
      }
    }
    if (gtinChecksumValid(normalized)) {
      return {
        tone: 'text-[#20814d]',
        label: 'EAN herkend. Na opslaan start automatisch de concurrentherkenning.',
      }
    }
    return {
      tone: 'text-[#a36816]',
      label: 'Controleer het EAN. Prysight kan wel opslaan, maar een geldig EAN geeft veel betrouwbaardere concurrentmatches.',
    }
  }, [value])

  return (
    <label className="text-[11px] font-semibold text-[#4f5869]">
      EAN
      <input
        name="ean"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(normalize(event.target.value))}
        className="toolbar-control mt-1.5 w-full"
        placeholder="Bijvoorbeeld 8712345678901"
      />
      <span className={`mt-1.5 block text-[9px] font-normal leading-4 ${status.tone}`}>{status.label}</span>
    </label>
  )
}
