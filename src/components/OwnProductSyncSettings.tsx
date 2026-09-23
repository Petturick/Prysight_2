'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Source = { id: string; syncFrequencyHours: number; lastRunStatus: string; lastRunAt: string | null; syncError: string | null; url?: string | null }

const options = [
  [8760, 'Uitsluitend handmatig'], [6, 'Iedere 6 uur'], [12, 'Iedere 12 uur'],
  [24, 'Dagelijks'], [48, 'Iedere 2 dagen'], [168, 'Wekelijks'],
] as const

export function OwnProductSyncSettings({ productId, countryId, marketName, hasUrl, canWrite, initialSource,
}: { productId: string; countryId: string | null; marketName: string | null; hasUrl: boolean;
  canWrite: boolean; initialSource: Source | null }) {
  const router = useRouter()
  const [source, setSource] = useState<Source | null>(initialSource)
  const [frequency, setFrequency] = useState(initialSource?.syncFrequencyHours ?? 8760)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!source || source.lastRunStatus !== 'RUNNING' || !countryId) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ productId, countryId })
        const response = await fetch(`/api/synchronisatie/product-url?${params.toString()}`, { cache: 'no-store' })
        if (!response.ok) return
        const result = await response.json() as { source?: Source | null }
        if (!cancelled && result.source) {
          setSource(result.source)
          if (result.source.lastRunStatus !== 'RUNNING') router.refresh()
        }
      } catch { /* Status remains available after refresh. */ }
    }, 4000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [source, productId, countryId, router])

  async function submit(action: 'sync' | 'configure') {
    if (!canWrite || !countryId || !hasUrl || busy) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/synchronisatie/product-url', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, countryId, action, ...(action === 'configure' ? { frequency } : {}) }),
      })
      const result = await response.json() as { source?: Source; accepted?: boolean; error?: string }
      if (!response.ok) throw new Error(result.error || 'Synchronisatie kon niet worden gestart.')
      if (result.source) setSource(result.source)
      setNotice({ ok: true, text: action === 'configure' ? 'Synchronisatieplanning opgeslagen.' : 'Productgegevens worden opgehaald. De status wordt automatisch bijgewerkt.' })
      router.refresh()
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Synchronisatie mislukt.' })
    } finally { setBusy(false) }
  }

  return <section className="ps-panel flex flex-wrap items-end gap-3 px-4 py-3 sm:px-5" aria-label="Synchronisatie eigen product URL">
    <div className="min-w-[185px] flex-1">
      <h2 className="text-[13px] font-semibold text-[#20344b]">Eigen productgegevens synchroniseren</h2>
      <p className="mt-1 text-[11px] text-[#738298]">{marketName ?? 'Selecteer een markt'} · {hasUrl ? `Laatste controle: ${source?.lastRunAt ? new Date(source.lastRunAt).toLocaleString('nl-NL') : 'nog niet'}` : 'Voeg eerst je eigen product URL toe bij Productinstellingen.'}</p>
      {source?.syncError ? <p role="alert" className="mt-1 text-[11px] text-rose-700">{source.syncError}</p> : null}
      {notice ? <p role={notice.ok ? 'status' : 'alert'} className={`mt-1 text-[11px] ${notice.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</p> : null}
    </div>
    <label className="min-w-[170px] text-[11px] font-medium text-[#53647b]">Planning
      <select value={frequency} onChange={event => setFrequency(Number(event.target.value))}
        disabled={!canWrite || !countryId || !hasUrl || busy || source?.lastRunStatus === 'RUNNING'}
        className="toolbar-control mt-1 w-full">
        {options.map(([hours, label]) => <option key={hours} value={hours}>{label}</option>)}
      </select>
    </label>
    <button type="button" onClick={() => void submit('configure')}
      disabled={!canWrite || !countryId || !hasUrl || busy || source?.lastRunStatus === 'RUNNING'}
      className="secondary-action disabled:opacity-50">{busy ? 'Bezig…' : 'Planning opslaan'}</button>
    <button type="button" onClick={() => void submit('sync')}
      disabled={!canWrite || !countryId || !hasUrl || busy || source?.lastRunStatus === 'RUNNING'}
      className="primary-action disabled:opacity-50">{busy || source?.lastRunStatus === 'RUNNING' ? 'Bezig…' : 'Nu synchroniseren'}</button>
    {!hasUrl ? <Link href="#eigen-prijs" className="text-[11px] text-[#2f6edb] underline">Product URL instellen</Link> : null}
  </section>
}
