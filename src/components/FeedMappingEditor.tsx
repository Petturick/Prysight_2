'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FEED_TARGET_FIELDS } from '@/lib/import-mapping'

type Column = { id: string; sourceColumn: string; targetField: string | null; sampleValue: string | null; position: number; isActive: boolean }

export function FeedMappingEditor({ sourceId, sourceName, columns }: { sourceId: string; sourceName: string; columns: Column[] }) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(columns.map((column) => [column.id, column.targetField ?? ''])))
  const [busy, setBusy] = useState<'save' | 'suggest' | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return columns.filter((column) => !query || column.sourceColumn.toLowerCase().includes(query) || (column.sampleValue ?? '').toLowerCase().includes(query))
  }, [columns, search])

  const mappedCount = Object.values(drafts).filter(Boolean).length
  const identifierReady = Object.values(drafts).some((value) => value === 'articleNumber' || value === 'ean' || value === 'gtin')

  function setMapping(columnId: string, value: string) {
    setDrafts((current) => {
      const next = { ...current }
      if (value) for (const id of Object.keys(next)) if (id !== columnId && next[id] === value) next[id] = ''
      next[columnId] = value
      return next
    })
  }

  async function call(mode: 'save' | 'suggest') {
    if (busy) return
    setBusy(mode)
    setError(null)
    try {
      const response = await fetch(`/api/feeds/${sourceId}/mapping`, {
        method: mode === 'suggest' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: mode === 'save' ? JSON.stringify({ mappings: Object.entries(drafts).map(([id, targetField]) => ({ id, targetField: targetField || null })) }) : undefined,
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Feedmapping kon niet worden bijgewerkt.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Feedmapping kon niet worden bijgewerkt.')
    } finally {
      setBusy(null)
    }
  }

  return <section className="surface-card overflow-hidden">
    <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">Kolomkoppeling</p><h2 className="mt-2 text-lg font-semibold text-[#161a26]">{sourceName}</h2><p className="mt-1 text-[12px] leading-5 text-[#697386]">Prysight herkent bronkolommen automatisch. Controleer de suggesties en bevestig de mapping voordat je de feed opnieuw synchroniseert.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void call('suggest')} disabled={Boolean(busy)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-[#697386] disabled:opacity-50">{busy === 'suggest' ? 'Herkennen…' : 'Opnieuw automatisch herkennen'}</button>
          <button type="button" onClick={() => void call('save')} disabled={Boolean(busy) || !identifierReady} title={!identifierReady ? 'Koppel minimaal artikelnummer, EAN of GTIN.' : undefined} className="rounded-lg bg-[#161a26] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === 'save' ? 'Opslaan…' : 'Mapping opslaan'}</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[#f8fafc] p-3 text-[11px] text-[#697386]"><strong className="block text-sm text-[#161a26]">{columns.length}</strong>Bronkolommen</div>
        <div className="rounded-xl bg-[#f8fafc] p-3 text-[11px] text-[#697386]"><strong className="block text-sm text-[#161a26]">{mappedCount}</strong>Gekoppeld</div>
        <div className={`rounded-xl p-3 text-[11px] ${identifierReady ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--accent-soft)] text-[#b4233d]'}`}><strong className="block text-sm">{identifierReady ? 'Gereed' : 'Actie nodig'}</strong>Productidentificatie</div>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-[var(--accent-soft)] p-3 text-[11px] text-[#b4233d]">{error}</p> : null}
    </div>
    <div className="px-5 py-4 sm:px-6"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek bronkolom of voorbeeldwaarde" className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#8aa9ff]" /></div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead className="border-y border-[var(--border)] bg-[#fbfcfe] text-[#7d8698]"><tr><th className="px-4 py-3 font-medium">Bronkolom</th><th className="px-4 py-3 font-medium">Voorbeeld</th><th className="px-4 py-3 font-medium">Doelveld</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{filtered.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-[#98a2b3]">Geen kolommen gevonden.</td></tr> : filtered.map((column) => <tr key={column.id} className="text-[#4f586a]"><td className="px-4 py-3 font-semibold text-[#303647]">{column.sourceColumn}</td><td className="max-w-[360px] truncate px-4 py-3 text-[#7d8698]">{column.sampleValue || '—'}</td><td className="px-4 py-3"><select value={drafts[column.id] ?? ''} onChange={(event) => setMapping(column.id, event.target.value)} className="min-w-[240px] rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-[11px] text-[#303647]"><option value="">Niet gekoppeld</option>{FEED_TARGET_FIELDS.map((field) => { const usedByOther = Object.entries(drafts).some(([id, value]) => id !== column.id && value === field.key); return <option key={field.key} value={field.key} disabled={usedByOther}>{field.label}{usedByOther ? ' (al gekoppeld)' : ''}</option> })}</select></td><td className="px-4 py-3">{drafts[column.id] ? <span className="rounded-full bg-[var(--green-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--green)]">Gekoppeld</span> : <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-[10px] font-semibold text-[#7d8698]">Open</span>}</td></tr>)}</tbody></table></div>
  </section>
}
