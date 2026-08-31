'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const countries = [
  ['GLOBAL', 'Algemeen of meerdere landen'], ['NL', 'Nederland'], ['BE', 'België'], ['DE', 'Duitsland'], ['FR', 'Frankrijk'], ['PT', 'Portugal'], ['ES', 'Spanje'], ['GB', 'Verenigd Koninkrijk'], ['DK', 'Denemarken'],
]

export function FeedConnectForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState('GLOBAL')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const connect = async () => {
    if (!url.trim() || busy || disabled) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/feeds/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, countryCode }),
      })
      const result = await response.json() as { feedSourceId?: string; rows?: number; columns?: number; error?: string }
      if (!response.ok) throw new Error(result.error || 'Feed koppelen mislukt.')
      setMessage({ type: 'success', text: `${result.rows ?? 0} productregels en ${result.columns ?? 0} kolommen geïmporteerd.` })
      router.push(`/feeds/data?source=${encodeURIComponent(result.feedSourceId ?? '')}`)
      router.refresh()
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Feed koppelen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['1', 'Bron invoeren', 'Plak een directe productfeed of openbare bestandslink.'],
          ['2', 'Velden herkennen', 'Prysight herkent onder meer SKU, EAN, productnaam, prijs, voorraad, land en product URL.'],
          ['3', 'Producten bijwerken', 'Nieuwe producten worden toegevoegd en bestaande producten op artikelnummer bijgewerkt.'],
        ].map((step) => <div key={step[0]} className="rounded-[12px] bg-[#f5f7fa] p-4"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#202536] text-[10px] font-semibold text-white">{step[0]}</span><span className="text-[11px] font-semibold text-[#252a37]">{step[1]}</span></div><p className="mt-2 text-[10px] leading-5 text-[#7e889b]">{step[2]}</p></div>)}
      </div>

      <div className="rounded-[12px] border border-[#d9e2f6] bg-[var(--blue-soft)] px-4 py-3 text-[10px] leading-5 text-[#405c93]">
        Automatische veldherkenning werkt op gangbare benamingen en varianten, bijvoorbeeld SKU of artikelnummer, title of productnaam, price of verkoopprijs, stock of voorraad, country of land en product_url of Engels URL. XML, CSV, JSON, XLSX, XLS en openbare Google Drive bestanden worden ondersteund.
      </div>

      {message && <div className={`rounded-[12px] px-4 py-3 text-[11px] font-medium ${message.type === 'success' ? 'bg-[var(--green-soft)] text-[#276749]' : 'bg-[var(--accent-soft)] text-[#b4233d]'}`}>{message.text}</div>}

      <div>
        <label className="text-[11px] font-semibold text-[#4e5668]">URL van de productfeed *</label>
        <input disabled={disabled || busy} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://leverancier.example/productfeed.xml of een openbare Google Drive link" className="toolbar-control mt-1.5 w-full disabled:bg-[#f6f7fa]" />
        <p className="mt-1 text-[9px] text-[#929bad]">Maximaal 15 MB en 20.000 regels per synchronisatie.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="text-[11px] font-semibold text-[#4e5668]">Naam van de bron</label><input disabled={disabled || busy} value={name} onChange={(event) => setName(event.target.value)} placeholder="Wordt automatisch voorgesteld" className="toolbar-control mt-1.5 w-full" /></div>
        <div><label className="text-[11px] font-semibold text-[#4e5668]">Markt</label><select disabled={disabled || busy} value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="toolbar-control mt-1.5 w-full">{countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
      </div>

      <button type="button" disabled={disabled || busy || !url.trim()} onClick={() => void connect()} className="primary-action w-full disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Bron ophalen en velden herkennen…' : 'Bron koppelen en producten verwerken'}</button>
    </div>
  )
}
