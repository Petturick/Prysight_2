'use client'

import { useEffect, useMemo, useState } from 'react'
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
  ['GLOBAL', 'Algemeen of meerdere landen'],
  ['NL', 'Nederland'],
  ['BE', 'België'],
  ['DE', 'Duitsland'],
  ['FR', 'Frankrijk'],
  ['GB', 'Verenigd Koninkrijk'],
  ['PT', 'Portugal'],
  ['ES', 'Spanje'],
  ['DK', 'Denemarken'],
]

const labels: Record<string, string> = {
  COMPLETED: 'Gesynchroniseerd', FAILED: 'Controle nodig',
  RUNNING: 'Bezig', IDLE: 'Nog niet gesynchroniseerd',
}

function formatRun(value: string | null) {
  return value ? new Date(value).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nog niet'
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

export function FeedSourceManager({ initialSources, canManage }: { initialSources: ManageableFeed[]; canManage: boolean }) {
  const router = useRouter()
  const [sources, setSources] = useState(initialSources)
  const [filter, setFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState('')
  const [feedFilter, setFeedFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ id: string; error: boolean; text: string } | null>(null)
  const [form, setForm] = useState({ name: '', url: '', countryCode: 'GLOBAL', syncFrequencyHours: 24 })

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
        } catch { return null }
      }))
      if (cancelled) return
      setSources((current) => current.map((source) => {
        const update = updates.find((item) => item?.id === source.id)
        return update ? { ...source, ...update } : source
      }))
      if (updates.some((item) => item && item.lastRunStatus && item.lastRunStatus !== 'RUNNING')) router.refresh()
    }, 4000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [sources, router])

  const marketSources = useMemo(
    () => marketFilter ? sources.filter((source) => source.countryCode === marketFilter) : sources,
    [marketFilter, sources],
  )

  const selectableFeeds = useMemo(
    () => marketSources.slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'nl-NL')),
    [marketSources],
  )

  const effectiveFeedFilter = feedFilter && selectableFeeds.some((source) => source.id === feedFilter)
    ? feedFilter
    : ''

  const visible = useMemo(() => {
    const search = filter.toLocaleLowerCase('nl-NL').trim()
    return marketSources.filter((source) => {
      if (effectiveFeedFilter && source.id !== effectiveFeedFilter) return false
      if (!search) return true
      return [source.name, source.url, source.countryCode, source.sourceType]
        .some((value) => value?.toLocaleLowerCase('nl-NL').includes(search))
    })
  }, [effectiveFeedFilter, filter, marketSources])

  const marketCounts = useMemo(
    () => new Map(markets.map(([code]) => [
      code,
      sources.filter((source) => source.countryCode === code).length,
    ])),
    [sources],
  )

  function openEdit(source: ManageableFeed) {
    setDeletingId(null)
    setNotice(null)
    setEditingId(source.id)
    setForm({ name: source.name, url: source.url ?? '', countryCode: source.countryCode, syncFrequencyHours: source.syncFrequencyHours })
  }

  async function patch(source: ManageableFeed, payload: Record<string, unknown>, success: string) {
    setBusyId(source.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const updated = await readResult(response) as Partial<ManageableFeed>
      setSources((current) => current.map((item) => item.id === source.id ? { ...item, ...updated } : item))
      setEditingId(null)
      setNotice({ id: source.id, error: false, text: success })
      router.refresh()
    } catch (error) {
      setNotice({ id: source.id, error: true, text: error instanceof Error ? error.message : 'Wijziging mislukt.' })
    } finally { setBusyId(null) }
  }

  async function sync(source: ManageableFeed) {
    if (!canManage || busyId || source.lastRunStatus === 'RUNNING' || !source.isActive) return
    setBusyId(source.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}/sync`, {
        method: 'POST', credentials: 'same-origin',
      })
      await readResult(response)
      setSources((current) => current.map((item) => item.id === source.id ? { ...item, lastRunStatus: 'RUNNING', syncError: null } : item))
      setNotice({ id: source.id, error: false, text: 'Synchronisatie gestart. De status en laatste resultaten worden automatisch ververst.' })
      router.refresh()
    } catch (error) {
      setNotice({ id: source.id, error: true, text: error instanceof Error ? error.message : 'Synchronisatie kon niet worden gestart.' })
    } finally { setBusyId(null) }
  }

  async function remove(source: ManageableFeed) {
    if (!canManage || busyId || deletingId !== source.id) return
    setBusyId(source.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/feeds/${encodeURIComponent(source.id)}`, {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }),
      })
      await readResult(response)
      setSources((current) => current.filter((item) => item.id !== source.id))
      setDeletingId(null)
      setEditingId(null)
      setNotice({ id: '', error: false, text: `Bron ${source.name} is verwijderd. Bestaande producten blijven behouden.` })
      router.refresh()
    } catch (error) {
      setNotice({ id: source.id, error: true, text: error instanceof Error ? error.message : 'Bron verwijderen mislukt.' })
    } finally { setBusyId(null) }
  }

  return (
    <section id="bronbeheer" className="surface-card scroll-mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e9f1] px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#252a37]">Gekoppelde feedbronnen</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#697386]">Wijzig de bron, synchroniseer een URL feed direct of verwijder een ongebruikte bron. Geïmporteerde producten blijven bij het verwijderen behouden.</p>
        </div>
        <span className="rounded-full bg-[#f2f5fa] px-3 py-1.5 text-[10px] font-semibold text-[#526176]">{sources.length} bronnen</span>
      </div>

      <div className="border-b border-[#e4e9f1] bg-[#f8fafc] px-5 py-3.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <label className="min-w-[210px] text-[10px] font-semibold text-[#536174]">
            Land
            <select
              value={marketFilter}
              onChange={(event) => {
                setMarketFilter(event.target.value)
                setFeedFilter('')
              }}
              className="toolbar-control mt-1.5 w-full"
            >
              <option value="">Alle landen</option>
              {markets.map(([code, label]) => {
                const count = marketCounts.get(code) ?? 0
                return count > 0 ? <option key={code} value={code}>{label} ({count})</option> : null
              })}
            </select>
          </label>

          <label className="min-w-[260px] flex-1 text-[10px] font-semibold text-[#536174]">
            Feed
            <select
              value={effectiveFeedFilter}
              onChange={(event) => setFeedFilter(event.target.value)}
              className="toolbar-control mt-1.5 w-full"
            >
              <option value="">Alle feeds in deze selectie</option>
              {selectableFeeds.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} · {source.isActive ? 'actief' : 'gepauzeerd'}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[9px] border border-[#dfe6ee] bg-white px-3 py-2.5 text-[10px] leading-4 text-[#6b788b] lg:max-w-[300px]">
            Kies eerst het land en daarna de feed. Zo werk je per markt zonder dat alle bronnen tegelijk in beeld staan.
          </div>
        </div>
      </div>

      {sources.length > 4 ? <div className="border-b border-[#e4e9f1] px-5 py-3">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Zoek binnen de gekozen feedselectie" aria-label="Zoek feedbronnen" className="toolbar-control w-full max-w-lg" />
      </div> : null}

      {notice && !notice.id ? <p role="status" className="mx-5 mt-4 rounded-lg bg-[#e7f4ec] px-3 py-2 text-[11px] text-[#17603a]">{notice.text}</p> : null}

      <div className="divide-y divide-[#e7ecf3]">
        {visible.length === 0 ? <p className="px-5 py-8 text-center text-[11px] text-[#697386]">{sources.length ? 'Geen bronnen gevonden.' : 'Nog geen feedbronnen. Koppel hierboven je eerste URL feed.'}</p> : visible.map((source) => {
          const isEditable = source.sourceType === 'URL' || source.sourceType === 'FILE'
          const isRunning = source.lastRunStatus === 'RUNNING'
          const isBusy = busyId === source.id
          const editing = editingId === source.id
          const confirming = deletingId === source.id

          return <article key={source.id} className="px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[12px] font-semibold text-[#212d3e]">{source.name}</h3>
                  <span className="rounded-md bg-[#f0f3f8] px-2 py-0.5 text-[9px] font-semibold text-[#536174]">{source.sourceType}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${!source.isActive ? 'bg-[#edf0f5] text-[#677489]' : isRunning ? 'bg-[#edf3fb] text-[#345b9a]' : source.lastRunStatus === 'COMPLETED' ? 'bg-[#e7f4ec] text-[#17603a]' : source.lastRunStatus === 'FAILED' ? 'bg-[#fae8eb] text-[#8b2f3d]' : 'bg-[#fbf4df] text-[#77591b]'}`}>
                    {!source.isActive ? 'Gepauzeerd' : labels[source.lastRunStatus] ?? source.lastRunStatus}
                  </span>
                </div>
                {source.url ? <p title={source.url} className="mt-1 max-w-3xl break-all text-[10px] leading-5 text-[#6d7a8d]">{source.url}</p> : null}
                <p className="mt-1 text-[10px] text-[#7b8798]">
                  {source.countryCode} · {source.format ?? 'Formaat onbekend'} · {source.lastItemCount.toLocaleString('nl-NL')} regels · {source.lastErrorCount} fouten · laatste run {formatRun(source.lastRunAt)}
                </p>
                {source.syncError ? <p role="alert" className="mt-2 rounded-lg bg-[#fae8eb] px-3 py-2 text-[10px] leading-5 text-[#8b2f3d]">{source.syncError}</p> : null}
                {notice?.id === source.id ? <p role={notice.error ? 'alert' : 'status'} className={`mt-2 rounded-lg px-3 py-2 text-[10px] leading-5 ${notice.error ? 'bg-[#fae8eb] text-[#8b2f3d]' : 'bg-[#e7f4ec] text-[#17603a]'}`}>{notice.text}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {source.sourceType === 'URL' && canManage ? <button type="button" onClick={() => void sync(source)} disabled={!source.isActive || isRunning || Boolean(busyId)} className="primary-action min-h-0 px-3 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40">{isRunning ? 'Synchroniseren…' : isBusy ? 'Bezig…' : 'Nu synchroniseren'}</button> : null}
                {isEditable && canManage ? <>
                  <button type="button" onClick={() => { if (editing) setEditingId(null); else openEdit(source) }} disabled={isRunning || Boolean(busyId)} className="secondary-action min-h-0 px-3 py-2 text-[10px] disabled:opacity-40">{editing ? 'Sluiten' : 'Bewerken'}</button>
                  <button type="button" onClick={() => void patch(source, { isActive: !source.isActive }, source.isActive ? 'Bron gepauzeerd.' : 'Bron geactiveerd.')} disabled={isRunning || Boolean(busyId)} className="secondary-action min-h-0 px-3 py-2 text-[10px] disabled:opacity-40">{source.isActive ? 'Pauzeren' : 'Activeren'}</button>
                  <button type="button" onClick={() => { setEditingId(null); setDeletingId(confirming ? null : source.id); setNotice(null) }} disabled={isRunning || Boolean(busyId)} className="rounded-lg border border-[#f4c8d0] bg-white px-3 py-2 text-[10px] font-semibold text-[#a72740] hover:bg-[#fff2f4] disabled:opacity-40">Verwijderen</button>
                </> : <span className="text-[10px] text-[#8993a3]">{!canManage ? 'Alleen lezen' : 'Beheer via de integratie'}</span>}
              </div>
            </div>

            {editing ? <form className="mt-4 rounded-xl border border-[#e0e7f0] bg-[#f7f9fc] p-4" onSubmit={(event) => {
              event.preventDefault()
              void patch(source, {
                name: form.name, countryCode: form.countryCode, syncFrequencyHours: form.syncFrequencyHours,
                ...(source.sourceType === 'URL' ? { url: form.url } : {}),
              }, 'Brongegevens opgeslagen. Synchroniseer om een gewijzigde URL te verwerken.')
            }}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-[10px] font-semibold text-[#536174]">Bronnaam<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="toolbar-control mt-1.5 w-full" /></label>
                <label className="text-[10px] font-semibold text-[#536174]">Markt<select value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value })} className="toolbar-control mt-1.5 w-full">{markets.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                {source.sourceType === 'URL' ? <label className="text-[10px] font-semibold text-[#536174] md:col-span-2">Productfeed URL<input required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className="toolbar-control mt-1.5 w-full" /></label> : null}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-[#788597]">Een gewijzigde URL wordt pas verwerkt na het starten van een nieuwe synchronisatie. Geïmporteerde producten worden niet automatisch verwijderd.</p>
              <div className="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={isBusy || !form.name.trim() || (source.sourceType === 'URL' && !form.url.trim())} className="primary-action min-h-0 px-3 py-2 text-[10px] disabled:opacity-40">{isBusy ? 'Opslaan…' : 'Wijzigingen opslaan'}</button><button type="button" onClick={() => setEditingId(null)} className="secondary-action min-h-0 px-3 py-2 text-[10px]">Annuleren</button></div>
            </form> : null}

            {confirming ? <div className="mt-4 rounded-xl border border-[#f1bcc8] bg-[#fff5f6] p-4">
              <p className="text-[11px] font-semibold text-[#8b2f3d]">Feedbron {source.name} verwijderen?</p>
              <p className="mt-1 text-[10px] leading-5 text-[#884958]">De koppeling, bronregels, kolommapping en synchronisatielogboeken worden verwijderd. De reeds geïmporteerde producten en hun prijshistorie blijven bestaan. Dit kun je niet ongedaan maken.</p>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void remove(source)} disabled={isBusy} className="rounded-lg bg-[#b4233d] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">{isBusy ? 'Verwijderen…' : 'Ja, verwijder bron'}</button><button type="button" onClick={() => setDeletingId(null)} className="secondary-action min-h-0 px-3 py-2 text-[10px]">Annuleren</button></div>
            </div> : null}
          </article>
        })}
      </div>
    </section>
  )
}
