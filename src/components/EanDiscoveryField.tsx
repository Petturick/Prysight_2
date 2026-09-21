'use client'

import { useMemo, useState } from 'react'

type ExistingProduct = {
  id: string
  articleNumber: string
  name: string
  ean: string | null
  gtin: string | null
  reason: 'ARTICLE_NUMBER' | 'EAN' | 'GTIN' | 'URL'
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

  const status = useMemo(() => {
    const normalized = normalize(value)
    if (existing) {
      return {
        tone: 'text-[#a36816]',
        label: `Dit EAN staat al bij artikel ${existing.articleNumber}. Gebruik het bestaande product om dubbele monitoring te voorkomen.`,
      }
    }
    if (checking) {
      return {
        tone: 'text-[#60758d]',
        label: 'Prysight controleert of dit EAN al bestaat…',
      }
    }
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
      label: 'Controleer het EAN. Een geldig EAN geeft de betrouwbaarste concurrentmatches.',
    }
  }, [value, checking, existing])

  async function checkExisting(input: HTMLInputElement) {
    const ean = normalize(input.value)
    if (!gtinChecksumValid(ean)) return

    setChecking(true)
    try {
      const response = await fetch('/api/products/check-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean }),
      })
      const payload = await response.json() as { existing?: ExistingProduct | null }
      const found = response.ok ? payload.existing ?? null : null
      setExisting(found)
      input.setCustomValidity(found ? 'Dit EAN bestaat al in Prysight. Open het bestaande product.' : '')
    } catch {
      input.setCustomValidity('')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div>
      <label className="text-[11px] font-semibold text-[#4f5869]" htmlFor="new-product-ean">EAN</label>
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
          setValue(normalized)
        }}
        onBlur={(event) => void checkExisting(event.currentTarget)}
        className="toolbar-control mt-1.5 w-full"
        placeholder="Bijvoorbeeld 8712345678901"
      />
      <span className={`mt-1.5 block text-[9px] font-normal leading-4 ${status.tone}`}>{status.label}</span>
      {existing ? <a href={`/producten/${existing.id}`} className="mt-1.5 inline-flex text-[10px] font-semibold text-[#2f6edb] underline underline-offset-2">Open bestaand product</a> : null}
    </div>
  )
}
