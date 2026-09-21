'use client'

import { useState } from 'react'
import type { MagentoIntegrationSummary } from '@/lib/magento-pricing'

type Props = {
  initialSummary: MagentoIntegrationSummary
  canManage: boolean
}

type ApiResponse = {
  ok?: boolean
  storeViews?: number
  matchedStore?: boolean
  error?: string
  summary?: MagentoIntegrationSummary
}

export function MagentoIntegrationPanel({ initialSummary, canManage }: Props) {
  const [summary, setSummary] = useState(initialSummary)
  const [baseUrl, setBaseUrl] = useState(initialSummary.baseUrl)
  const [accessToken, setAccessToken] = useState('')
  const [currency, setCurrency] = useState(initialSummary.currency || 'EUR')
  const [storeCode, setStoreCode] = useState(initialSummary.storeCode || 'all')
  const [storeId, setStoreId] = useState(String(initialSummary.storeId ?? 0))
  const [pricesIncludeTax, setPricesIncludeTax] = useState(initialSummary.pricesIncludeTax)
  const [busy, setBusy] = useState<'test' | 'connect' | 'disconnect' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function run(action: 'test' | 'connect') {
    if (!canManage || busy) return
    setBusy(action)
    setNotice(null)
    try {
      const response = await fetch('/api/integraties/magento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          baseUrl,
          accessToken,
          currency,
          storeCode,
          storeId: Number(storeId || 0),
          pricesIncludeTax,
        }),
      })
      const result = await response.json().catch(() => null) as ApiResponse | null
      if (!response.ok) throw new Error(result?.error || 'Magento verbinding kon niet worden gecontroleerd.')
      if (result?.summary) setSummary(result.summary)
      if (action === 'connect') {
        setAccessToken('')
        setNotice({ tone: 'success', text: `Magento 2 is gekoppeld en getest. ${result?.storeViews ?? 0} storeviews zijn bereikbaar.` })
      } else {
        setNotice({ tone: 'success', text: `Verbinding geslaagd. Magento antwoordt correct en ${result?.storeViews ?? 0} storeviews zijn bereikbaar.` })
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Magento koppeling mislukt.' })
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    if (!canManage || busy) return
    setBusy('disconnect')
    setNotice(null)
    try {
      const response = await fetch('/api/integraties/magento', { method: 'DELETE' })
      const result = await response.json().catch(() => null) as ApiResponse | null
      if (!response.ok) throw new Error(result?.error || 'Magento koppeling kon niet worden verbroken.')
      if (result?.summary) setSummary(result.summary)
      setNotice({ tone: 'success', text: 'Magento 2 is losgekoppeld. De opgeslagen configuratie blijft beschikbaar voor een latere heractivatie.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Magento koppeling verbreken mislukt.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 rounded-[12px] border border-[#e3e7ee] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.06em] text-[#6f7b91]">Magento 2 koppelen</p>
          <p className="mt-1 text-[11px] leading-5 text-[#697386]">Vul de API gegevens in, test de verbinding en activeer daarna pas writeback. Het access token wordt server side versleuteld opgeslagen.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${summary.ready ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>
          {summary.ready ? 'Gekoppeld' : summary.configured ? 'Niet actief' : 'Niet gekoppeld'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-[10px] font-bold text-[#536174] md:col-span-2 xl:col-span-2">
          Magento basis URL
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://shop.example.com" disabled={!canManage} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#d7dde6] bg-white px-3 text-[11px] outline-none focus:border-[#94aee0] disabled:bg-[#f1f3f6]" />
        </label>
        <label className="text-[10px] font-bold text-[#536174]">
          Valuta
          <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} disabled={!canManage} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#d7dde6] bg-white px-3 text-[11px] outline-none focus:border-[#94aee0] disabled:bg-[#f1f3f6]" />
        </label>
        <label className="text-[10px] font-bold text-[#536174] md:col-span-2 xl:col-span-1">
          Access token
          <input value={accessToken} onChange={(event) => setAccessToken(event.target.value)} type="password" autoComplete="new-password" placeholder={summary.hasCredential ? 'Opgeslagen, leeg laten om te behouden' : 'Magento integration access token'} disabled={!canManage} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#d7dde6] bg-white px-3 text-[11px] outline-none focus:border-[#94aee0] disabled:bg-[#f1f3f6]" />
        </label>
        <label className="text-[10px] font-bold text-[#536174]">
          Store code
          <input value={storeCode} onChange={(event) => setStoreCode(event.target.value)} placeholder="all" disabled={!canManage} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#d7dde6] bg-white px-3 text-[11px] outline-none focus:border-[#94aee0] disabled:bg-[#f1f3f6]" />
        </label>
        <label className="text-[10px] font-bold text-[#536174]">
          Store ID
          <input value={storeId} onChange={(event) => setStoreId(event.target.value)} type="number" min="0" step="1" disabled={!canManage} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#d7dde6] bg-white px-3 text-[11px] outline-none focus:border-[#94aee0] disabled:bg-[#f1f3f6]" />
        </label>
        <label className="text-[10px] font-bold text-[#536174]">
          Magento prijzen
          <select value={pricesIncludeTax ? 'incl' : 'excl'} onChange={(event) => setPricesIncludeTax(event.target.value === 'incl')} disabled={!canManage} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#d7dde6] bg-white px-3 text-[11px] outline-none focus:border-[#94aee0] disabled:bg-[#f1f3f6]">
            <option value="excl">Exclusief btw</option>
            <option value="incl">Inclusief btw</option>
          </select>
        </label>
      </div>

      {summary.error ? <p className="mt-3 rounded-[9px] border border-[#e0a5ad] bg-[#fae8eb] px-3 py-2 text-[10px] leading-5 text-[#8b2f3d]">{summary.error}</p> : null}
      {notice ? <p className={`mt-3 rounded-[9px] border px-3 py-2 text-[10px] leading-5 ${notice.tone === 'success' ? 'border-[#9cc7ad] bg-[#e7f4ec] text-[#17603a]' : 'border-[#e0a5ad] bg-[#fae8eb] text-[#8b2f3d]'}`}>{notice.text}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run('test')} disabled={!canManage || Boolean(busy)} className="secondary-action disabled:cursor-not-allowed disabled:opacity-40">{busy === 'test' ? 'Testen…' : 'Verbinding testen'}</button>
        <button type="button" onClick={() => void run('connect')} disabled={!canManage || Boolean(busy)} className="primary-action disabled:cursor-not-allowed disabled:opacity-40">{busy === 'connect' ? 'Koppelen…' : summary.ready ? 'Wijzigingen opslaan' : 'Opslaan en koppelen'}</button>
        {summary.configured ? <button type="button" onClick={() => void disconnect()} disabled={!canManage || Boolean(busy)} className="secondary-action disabled:cursor-not-allowed disabled:opacity-40">{busy === 'disconnect' ? 'Loskoppelen…' : 'Koppeling verbreken'}</button> : null}
      </div>
      {!canManage ? <p className="mt-3 text-[10px] text-[#8790a2]">Alleen een gebruiker met instellingenbeheer kan integraties wijzigen.</p> : null}
    </div>
  )
}
