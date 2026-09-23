'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type ManageableFeed = {
  id: string
  name: string
  url: string | null
  sourceType: string
  format: string | null
  countryCode: string
  isActive: boolean
  syncFrequencyHours: number
  lastRunAt: string | null
  lastRunStatus: string
  lastItemCount: number
  lastErrorCount: number
  syncError: string | null
}

const markets = [
  ['GLOBAL', 'Algemeen'],
  ['NL', 'Nederland'],
  ['BE', 'België'],
  ['DE', 'Duitsland'],
  ['FR', 'Frankrijk'],
  ['GB', 'Verenigd Koninkrijk'],
  ['PT', 'Portugal'],
  ['ES', 'Spanje'],
  ['DK', 'Denemarken'],
] as const

const runLabels: Record<string, string> = {
  COMPLETED: 'Gesynchroniseerd',
  FAILED: 'Controle nodig',
  RUNNING: 'Bezig',
  IDLE: 'Nog niet gesynchroniseerd',
}

function marketLabel(code: string) {
  return markets.find(([value]) => value === code)?.[1] ?? code
}

function sourceLabel(type: string) {
  if (type === 'URL') return 'URL feed'
  if (type === 'FILE') return 'Bestand'
  if (type === 'SYNTRX') return 'Syntrx'
  if (type === 'API') return 'API'
  return type
}

function formatRun(value: string | null) {
  return value
    ? new Date(value).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Nog niet'
}

function statusClass(source: ManageableFeed) {
  if (!source.isActive) return 'bg-[#f2f4f7] text-[#667085]'
  if (source.lastRunStatus === 'FAILED') return 'bg-[#fff1f2] text-[#a83f4b]'
  if (source.lastRunStatus === 'RUNNING') return 'bg-[#edf4ff] text-[#3d73d4]'
  if (source.lastRunStatus === 'COMPLETED') return 'bg-[#eaf8f0] text-[#1f7548]'
  return 'bg-[#fff6e7] text-[#95651e]'
}

async function readResult(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {}
  const raw = await response.text()
  try {
    const result = JSON.parse(raw) as Record<string, unknown>
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'De actie is niet gelukt.')
    return result
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Prysight ontving geen geldige reactie van de server.')
    throw error
  }
}

export function FeedSourceManager({
  initialSources,
  canManage,
  initialMarket = '',
}: {
  initialSources: ManageableFeed[]
  canManage: boolean
  initialMarket?: string
}) {
  const router = useRouter()
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [sources, setSources] = useState(initialSources)
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState(initialMarket)
  const [statusFilter, setStatusFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [notice, setNotice] = useState<{ id: string; error: boolean; text: string } | null>(null)
  const [form, setForm] = useState({
    name: '',
    url: '',
    countryCode: 'GLOBAL',
    syncFrequencyHours: 24,
  })

  useEffect(() => {
    const running = sources.filter((source) => source.lastRunStatus === 'RUNNING')
    if (!running.length) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const updates = await Promise.all(running.map(async (source) => {
        try {
          const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, { cache: 'no-store' })
          if (!response.ok) return null
          return await response.json() as Partial<ManageableFeed> & { id: string }
        } catch {
          return null
        }
      }))
      if (cancelled) return
      setSources((current) => current.map((source) => {
        const update = updates.find((item) => item?.id === source.id)
        return update ? { ...source, ...update } : source
      }))
      if (updates.some((item) => item && item.lastRunStatus && item.lastRunStatus !== 'RUNNING')) router.refresh()
    }, 4000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [sources, router])

  const marketCounts = useMemo(
    () => new Map(markets.map(([code]) => [
      code,
      sources.filter((source) => source.countryCode === code).length,
    ])),
    [sources],
  )

  const visible = useMemo(() => {
    const search = filter.toLocaleLowerCase('nl-NL').trim()
    return sources.filter((source) => {
      if (marketFilter && source.countryCode !== marketFilter) return false
      if (statusFilter === 'active' && !source.isActive) return false
      if (statusFilter === 'inactive' && source.isActive) return false
      if (statusFilter === 'failed' && source.lastRunStatus !== 'FAILED') return false
      if (!search) return true
      return [source.name, source.url, source.countryCode, source.sourceType]
        .some((value) => value?.toLocaleLowerCase('nl-NL').includes(search))
    })
  }, [filter, marketFilter, sources, statusFilter])

  const visibleIds = useMemo(() => visible.map((source) => source.id), [visible])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
  const partlySelected = visibleIds.some((id) => selectedSet.has(id)) && !allVisibleSelected
  const selectedSources = useMemo(() => sources.filter((source) => selectedSet.has(source.id)), [selectedSet, sources])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partlySelected
  }, [partlySelected])

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))
  }

  function openEdit(source: ManageableFeed) {
    setDeletingId(null)
    setNotice(null)
    setEditingId(source.id)
    setForm({
      name: source.name,
      url: source.url ?? '',
      countryCode: source.countryCode,
      syncFrequencyHours: source.syncFrequencyHours,
    })
  }

  async function patch(source: ManageableFeed, payload: Record<string, unknown>, success: string) {
    if (!canManage || busyId || bulkBusy) return
    setBusyId(source.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const updated = await readResult(response) as Partial<ManageableFeed>
      setSources((current) => current.map((item) => item.id === source.id ? { ...item, ...updated } : item))
      setEditingId(null)
      setDeletingId(null)
      setNotice({ id: source.id, error: false, text: success })
      router.refresh()
    } catch (error) {
      setNotice({ id: source.id, error: true, text: error instanceof Error ? error.message : 'Wijziging mislukt.' })
    } finally {
      setBusyId(null)
    }
  }

  async function sync(source: ManageableFeed) {
    if (!canManage || busyId || bulkBusy || source.lastRunStatus === 'RUNNING' || !source.isActive || source.sourceType !== 'URL') return
    setBusyId(source.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}/sync`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      await readResult(response)
      setSources((current) => current.map((item) => item.id === source.id
        ? { ...item, lastRunStatus: 'RUNNING', syncError: null }
        : item))
      setNotice({ id: source.id, error: false, text: 'Synchronisatie gestart.' })
      router.refresh()
    } catch (error) {
      setNotice({ id: source.id, error: true, text: error instanceof Error ? error.message : 'Synchronisatie kon niet worden gestart.' })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(source: ManageableFeed) {
    if (!canManage || busyId || bulkBusy || deletingId !== source.id) return
    setBusyId(source.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      await readResult(response)
      setSources((current) => current.filter((item) => item.id !== source.id))
      setSelected((current) => current.filter((id) => id !== source.id))
      setDeletingId(null)
      setEditingId(null)
      setNotice({ id: '', error: false, text: `Feed ${source.name} is verwijderd. Bestaande producten blijven behouden.` })
      router.refresh()
    } catch (error) {
      setNotice({ id: source.id, error: true, text: error instanceof Error ? error.message : 'Feed verwijderen mislukt.' })
    } finally {
      setBusyId(null)
    }
  }

  async function bulkStatus(isActive: boolean) {
    if (!canManage || bulkBusy || selectedSources.length === 0) return
    setBulkBusy(true)
    setNotice(null)
    let success = 0
    let failed = 0
    for (const source of selectedSources) {
      if (source.lastRunStatus === 'RUNNING') {
        failed += 1
        continue
      }
      try {
        const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive }),
        })
        const updated = await readResult(response) as Partial<ManageableFeed>
        setSources((current) => current.map((item) => item.id === source.id ? { ...item, ...updated } : item))
        success += 1
      } catch {
        failed += 1
      }
    }
    setBulkBusy(false)
    setNotice({
      id: '',
      error: failed > 0,
      text: `${success} feed${success === 1 ? '' : 's'} ${isActive ? 'geactiveerd' : 'gedeactiveerd'}.${failed ? ` ${failed} niet gewijzigd.` : ''}`,
    })
    router.refresh()
  }

  async function bulkDelete() {
    const deletable = selectedSources.filter((source) => source.sourceType === 'URL' || source.sourceType === 'FILE')
    if (!canManage || bulkBusy || deletable.length === 0) return
    if (!window.confirm(`Je verwijdert ${deletable.length} geselecteerde feed${deletable.length === 1 ? '' : 's'} definitief. Geïmporteerde producten blijven bestaan. Doorgaan?`)) return

    setBulkBusy(true)
    setNotice(null)
    let success = 0
    let failed = 0

    for (const source of deletable) {
      if (source.lastRunStatus === 'RUNNING') {
        failed += 1
        continue
      }
      try {
        const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        })
        await readResult(response)
        setSources((current) => current.filter((item) => item.id !== source.id))
        success += 1
      } catch {
        failed += 1
      }
    }

    setSelected([])
    setBulkBusy(false)
    setNotice({
      id: '',
      error: failed > 0,
      text: `${success} feed${success === 1 ? '' : 's'} verwijderd.${failed ? ` ${failed} niet verwijderd.` : ''} Producten zijn behouden.`,
    })
    router.refresh()
  }

  return (
    <section id="bronbeheer" className="surface-card scroll-mt-5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e4e9f1] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-[#252a37]">Feedbeheer</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#697386]">
            Zelfde beheerlogica als Syntrx, selecteren, activeren, deactiveren, synchroniseren, bewerken en verwijderen vanuit één overzicht.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/feeds#externe-feed" className="primary-action min-h-[36px] px-3 py-2 text-[10px]">Feed toevoegen</Link>
          <Link href="/feeds/map" className="secondary-action min-h-[36px] px-3 py-2 text-[10px]">Feed mapping</Link>
        </div>
      </div>

      <div className="grid gap-2 border-b border-[#e4e9f1] bg-[#f8fafc] px-5 py-3.5 md:grid-cols-[180px_170px_minmax(220px,1fr)]">
        <label className="text-[10px] font-semibold text-[#536174]">
          Land
          <select
            value={marketFilter}
            onChange={(event) => setMarketFilter(event.target.value)}
            className="toolbar-control mt-1.5 w-full"
          >
            <option value="">Alle landen</option>
            {markets.map(([code, label]) => {
              const count = marketCounts.get(code) ?? 0
              return count ? <option key={code} value={code}>{label} ({count})</option> : null
            })}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-[#536174]">
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="toolbar-control mt-1.5 w-full">
            <option value="">Alle statussen</option>
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
            <option value="failed">Controle nodig</option>
          </select>
        </label>
        <label className="text-[10px] font-semibold text-[#536174]">
          Zoeken
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Zoek op feednaam, URL, type of land"
            className="toolbar-control mt-1.5 w-full"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e9f1] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#edf4ff] px-3 py-1.5 text-[10px] font-semibold text-[#315fa7]">{selected.length} geselecteerd</span>
          <span className="text-[10px] text-[#78889b]">{visible.length} zichtbaar, {sources.length} totaal</span>
          <button type="button" disabled={!visibleIds.length || allVisibleSelected} onClick={() => setSelected((current) => [...new Set([...current, ...visibleIds])])} className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px] disabled:opacity-40">Selecteer zichtbare feeds</button>
          <button type="button" disabled={!selected.length} onClick={() => setSelected([])} className="secondary-action min-h-[32px] px-2.5 py-1.5 text-[10px] disabled:opacity-40">Deselecteer alles</button>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!selected.length || bulkBusy} onClick={() => void bulkStatus(true)} className="secondary-action min-h-[32px] px-3 py-1.5 text-[10px] disabled:opacity-40">Activeren</button>
            <button type="button" disabled={!selected.length || bulkBusy} onClick={() => void bulkStatus(false)} className="secondary-action min-h-[32px] px-3 py-1.5 text-[10px] disabled:opacity-40">Deactiveren</button>
            <button type="button" disabled={!selectedSources.some((source) => source.sourceType === 'URL' || source.sourceType === 'FILE') || bulkBusy} onClick={() => void bulkDelete()} className="ps-button-danger min-h-[32px] px-3 py-1.5 text-[10px] disabled:opacity-40">Verwijderen</button>
          </div>
        ) : null}
      </div>

      {notice && !notice.id ? (
        <p role={notice.error ? 'alert' : 'status'} className={`mx-5 mt-4 rounded-lg px-3 py-2 text-[11px] ${notice.error ? 'bg-[#fff1f2] text-[#a83f4b]' : 'bg-[#eaf8f0] text-[#1f7548]'}`}>{notice.text}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full text-left text-[11px]">
          <thead className="border-b border-[#e4e9f1] bg-[#fbfcfe] text-[10px] font-semibold text-[#67788c]">
            <tr>
              <th className="w-[44px] px-4 py-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={!visibleIds.length}
                  onChange={(event) => {
                    if (event.target.checked) setSelected((current) => [...new Set([...current, ...visibleIds])])
                    else setSelected((current) => current.filter((id) => !visibleIds.includes(id)))
                  }}
                  aria-label="Selecteer alle zichtbare feeds"
                  className="h-4 w-4 accent-[#346ed6]"
                />
              </th>
              <th className="px-3 py-3">Feed</th>
              <th className="px-3 py-3">Land</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Regels</th>
              <th className="px-3 py-3">Laatste synchronisatie</th>
              <th className="px-4 py-3 text-right">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f3]">
            {visible.map((source) => {
              const editable = source.sourceType === 'URL' || source.sourceType === 'FILE'
              const running = source.lastRunStatus === 'RUNNING'
              const busy = busyId === source.id
              const editing = editingId === source.id
              const confirming = deletingId === source.id
              const selectedRow = selectedSet.has(source.id)

              return (
                <Fragment key={source.id}>
                  <tr className={selectedRow ? 'bg-[#f3f7ff]' : 'bg-white hover:bg-[#fafcff]'}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRow}
                        onChange={(event) => toggleRow(source.id, event.target.checked)}
                        aria-label={`Selecteer ${source.name}`}
                        className="h-4 w-4 accent-[#346ed6]"
                      />
                    </td>
                    <td className="max-w-[350px] px-3 py-3">
                      <p className="truncate font-semibold text-[#27384d]" title={source.name}>{source.name}</p>
                      <p className="mt-1 truncate text-[9px] text-[#98a2b3]" title={source.url ?? undefined}>{source.url ?? 'Geen externe URL'}</p>
                      {source.syncError ? <p className="mt-1 truncate text-[9px] font-semibold text-[#a83f4b]" title={source.syncError}>{source.syncError}</p> : null}
                    </td>
                    <td className="px-3 py-3"><span className="font-medium text-[#526176]">{marketLabel(source.countryCode)}</span></td>
                    <td className="px-3 py-3"><span className="rounded-md bg-[#f2f4f7] px-2 py-1 text-[9px] font-semibold text-[#667085]">{sourceLabel(source.sourceType)}</span></td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusClass(source)}`}>
                        {!source.isActive ? 'Inactief' : runLabels[source.lastRunStatus] ?? source.lastRunStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <p className="font-semibold text-[#344054]">{source.lastItemCount.toLocaleString('nl-NL')}</p>
                      {source.lastErrorCount ? <p className="mt-0.5 text-[9px] text-[#a83f4b]">{source.lastErrorCount} fouten</p> : null}
                    </td>
                    <td className="px-3 py-3 text-[#667085]">{formatRun(source.lastRunAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link href={`/producten?feed=${encodeURIComponent(source.id)}`} className="secondary-action min-h-[30px] px-2.5 py-1.5 text-[9px]">Producten</Link>
                        {source.sourceType === 'URL' ? (
                          <button type="button" onClick={() => void sync(source)} disabled={!canManage || !source.isActive || running || Boolean(busyId) || bulkBusy} className="secondary-action min-h-[30px] px-2.5 py-1.5 text-[9px] disabled:opacity-40">{running ? 'Bezig…' : 'Synchroniseren'}</button>
                        ) : null}
                        {canManage ? (
                          <button type="button" onClick={() => void patch(source, { isActive: !source.isActive }, source.isActive ? 'Feed gedeactiveerd.' : 'Feed geactiveerd.')} disabled={running || Boolean(busyId) || bulkBusy} className="secondary-action min-h-[30px] px-2.5 py-1.5 text-[9px] disabled:opacity-40">{source.isActive ? 'Deactiveren' : 'Activeren'}</button>
                        ) : null}
                        {editable && canManage ? (
                          <>
                            <button type="button" onClick={() => editing ? setEditingId(null) : openEdit(source)} disabled={running || Boolean(busyId) || bulkBusy} className="secondary-action min-h-[30px] px-2.5 py-1.5 text-[9px] disabled:opacity-40">{editing ? 'Sluiten' : 'Bewerken'}</button>
                            <button type="button" onClick={() => { setEditingId(null); setDeletingId(confirming ? null : source.id); setNotice(null) }} disabled={running || Boolean(busyId) || bulkBusy} className="min-h-[30px] rounded-[8px] border border-[#f0c5cc] bg-white px-2.5 py-1.5 text-[9px] font-semibold text-[#a83f4b] disabled:opacity-40">Verwijderen</button>
                          </>
                        ) : null}
                      </div>
                      {notice?.id === source.id ? <p role={notice.error ? 'alert' : 'status'} className={`mt-2 text-right text-[9px] font-medium ${notice.error ? 'text-[#a83f4b]' : 'text-[#1f7548]'}`}>{notice.text}</p> : null}
                    </td>
                  </tr>

                  {editing ? (
                    <tr className="bg-[#f8fafc]">
                      <td colSpan={8} className="px-5 py-4">
                        <form onSubmit={(event) => {
                          event.preventDefault()
                          void patch(source, {
                            name: form.name,
                            countryCode: form.countryCode,
                            syncFrequencyHours: form.syncFrequencyHours,
                            ...(source.sourceType === 'URL' ? { url: form.url } : {}),
                          }, 'Feed opgeslagen.')
                        }} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_170px_2fr_auto] xl:items-end">
                          <label className="text-[10px] font-semibold text-[#536174]">Feednaam<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="toolbar-control mt-1.5 w-full" /></label>
                          <label className="text-[10px] font-semibold text-[#536174]">Land<select value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value })} className="toolbar-control mt-1.5 w-full">{markets.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                          <label className="text-[10px] font-semibold text-[#536174]">Synchronisatie<select value={form.syncFrequencyHours} onChange={(event) => setForm({ ...form, syncFrequencyHours: Number(event.target.value) })} className="toolbar-control mt-1.5 w-full"><option value={6}>Iedere 6 uur</option><option value={12}>Iedere 12 uur</option><option value={24}>Dagelijks</option><option value={48}>Iedere 2 dagen</option><option value={168}>Wekelijks</option><option value={8760}>Handmatig</option></select></label>
                          {source.sourceType === 'URL' ? <label className="text-[10px] font-semibold text-[#536174]">Feed URL<input required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className="toolbar-control mt-1.5 w-full" /></label> : <div />}
                          <button type="submit" disabled={busy || !form.name.trim() || (source.sourceType === 'URL' && !form.url.trim())} className="primary-action min-h-[38px] px-3 py-2 text-[10px] disabled:opacity-40">{busy ? 'Opslaan…' : 'Opslaan'}</button>
                        </form>
                      </td>
                    </tr>
                  ) : null}

                  {confirming ? (
                    <tr className="bg-[#fff7f8]">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[11px] font-semibold text-[#8b2f3d]">Feed {source.name} definitief verwijderen?</p>
                            <p className="mt-1 text-[10px] leading-5 text-[#884958]">De feed, mapping en synchronisatielogboeken worden verwijderd. Geïmporteerde producten blijven bewust behouden.</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void remove(source)} disabled={busy} className="ps-button-danger min-h-[34px] px-3 py-1.5 text-[10px] disabled:opacity-40">{busy ? 'Verwijderen…' : 'Ja, verwijderen'}</button>
                            <button type="button" onClick={() => setDeletingId(null)} className="secondary-action min-h-[34px] px-3 py-1.5 text-[10px]">Annuleren</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
            {visible.length === 0 ? <tr><td colSpan={8} className="px-6 py-12 text-center text-[11px] text-[#98a2b3]">Geen feeds gevonden voor deze selectie.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[#edf0f3] bg-[#fbfcfd] px-5 py-3 text-[10px] leading-5 text-[#7b8798]">
        Feed verwijderen verwijdert niet automatisch de producten. Dat voorkomt dat productdata per ongeluk verdwijnt wanneer alleen een koppeling wordt vervangen.
      </div>
    </section>
  )
}
