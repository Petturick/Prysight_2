'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Feed = { id: string; name: string; countryCode: string; isActive: boolean; sourceType: string;
  syncFrequencyHours: number; lastRunStatus: string; lastRunAt: string | null;
  lastItemCount: number; lastErrorCount: number; syncError: string | null }
type Competitor = { id: string; name: string; isActive: boolean; frequency: number; offerCount: number;
  lastCheckedAt: string | null }

const feedFrequencies = [
  [6, 'Iedere 6 uur'], [12, 'Iedere 12 uur'], [24, 'Dagelijks'],
  [48, 'Iedere 2 dagen'], [168, 'Wekelijks'], [8760, 'Uitsluitend handmatig'],
] as const
const priceFrequencies = [
  [6, 'Iedere 6 uur'], [12, 'Iedere 12 uur'], [24, 'Dagelijks'],
  [48, 'Iedere 2 dagen'], [168, 'Wekelijks'], [876000, 'Uitsluitend handmatig'],
] as const

function formattedDate(value: string | null) {
  return value ? new Date(value).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : 'Nog niet'
}

export function SynchronizationHub({ marketName, feeds: initialFeeds, competitors: initialCompetitors,
  canReadFeeds, canWriteFeeds, canReadPrices, canWritePrices, canEditCompetitors,
}: { marketName: string; feeds: Feed[]; competitors: Competitor[]; canReadFeeds: boolean; canWriteFeeds: boolean;
  canReadPrices: boolean; canWritePrices: boolean; canEditCompetitors: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<'feeds' | 'prices'>(canReadFeeds ? 'feeds' : 'prices')
  const [feeds, setFeeds] = useState(initialFeeds)
  const [competitors, setCompetitors] = useState(initialCompetitors)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const running = feeds.filter(feed => feed.lastRunStatus === 'RUNNING')
    if (!running.length) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const updates = await Promise.all(running.map(async feed => {
        try {
          const response = await fetch(`/api/feeds/${encodeURIComponent(feed.id)}`, { cache: 'no-store' })
          if (!response.ok) return null
          return await response.json() as Partial<Feed> & { id: string }
        } catch { return null }
      }))
      if (cancelled) return
      setFeeds(current => current.map(feed => {
        const update = updates.find(item => item?.id === feed.id)
        return update ? { ...feed, ...update } : feed
      }))
      if (updates.some(item => item && item.lastRunStatus && item.lastRunStatus !== 'RUNNING')) router.refresh()
    }, 4000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [feeds, router])

  async function request(url: string, method: 'POST' | 'PATCH', body?: object) {
    const response = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const value = await response.json() as Record<string, unknown>
    if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'De actie kon niet worden uitgevoerd.')
    return value
  }

  async function saveFeed(feed: Feed, frequency: number) {
    if (!canWriteFeeds || busy) return
    setBusy(feed.id); setNotice(null)
    try {
      const data = await request(`/api/feeds/${encodeURIComponent(feed.id)}`, 'PATCH', { syncFrequencyHours: frequency })
      setFeeds(current => current.map(item => item.id === feed.id ? { ...item, syncFrequencyHours: Number(data.syncFrequencyHours) } : item))
      setNotice({ ok: true, text: `Planning voor ${feed.name} opgeslagen.` })
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : 'Opslaan mislukt.' }) }
    finally { setBusy('') }
  }

  async function syncFeed(feed: Feed) {
    if (!canWriteFeeds || busy) return
    setBusy(feed.id); setNotice(null)
    try {
      await request(`/api/feeds/${encodeURIComponent(feed.id)}/sync`, 'POST')
      setFeeds(current => current.map(item => item.id === feed.id ? { ...item, lastRunStatus: 'RUNNING', syncError: null } : item))
      setNotice({ ok: true, text: `Synchronisatie van ${feed.name} is gestart. De status wordt automatisch bijgewerkt.` })
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : 'Synchronisatie mislukt.' }) }
    finally { setBusy('') }
  }

  async function saveCompetitor(competitor: Competitor, frequency: number) {
    if (!canEditCompetitors || busy) return
    setBusy(competitor.id); setNotice(null)
    try {
      const result = await request(`/api/synchronisatie/concurrenten/${encodeURIComponent(competitor.id)}`, 'PATCH', { frequency })
      setCompetitors(current => current.map(item => item.id === competitor.id ? { ...item, frequency: Number(result.frequency) } : item))
      setNotice({ ok: true, text: `Planning voor ${competitor.name} opgeslagen.` })
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : 'Opslaan mislukt.' }) }
    finally { setBusy('') }
  }

  async function syncPrices() {
    if (!canWritePrices || busy) return
    setBusy('prices'); setNotice(null)
    try {
      const result = await request('/api/synchronisatie/prijzen', 'POST')
      const count = Number(result.due ?? 0)
      setNotice({ ok: true, text: count
        ? `${result.successful} prijscontroles geslaagd, ${result.failed} mislukt. ${result.limitReached ? 'Maximaal 8 bronnen per opdracht, start opnieuw voor de volgende bronnen.' : ''}`
        : 'Geen gekoppelde concurrentiebronnen beschikbaar voor deze markt. Koppel eerst een product aan een concurrent.' })
      router.refresh()
    } catch (error) { setNotice({ ok: false, text: error instanceof Error ? error.message : 'Prijscontrole mislukt.' }) }
    finally { setBusy('') }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e9f2] bg-white px-4 py-3">
      <div className="inline-flex rounded-lg bg-[#f0f4fa] p-1" role="tablist" aria-label="Soort synchronisatie">
        {canReadFeeds ? <button role="tab" aria-selected={tab === 'feeds'} type="button"
          onClick={() => { setTab('feeds'); setNotice(null) }}
          className={`rounded-md px-4 py-2 text-[12px] font-semibold ${tab === 'feeds' ? 'bg-white text-[#265ccd] shadow-sm' : 'text-[#63758c]'}`}>
          Productgegevens
        </button> : null}
        {canReadPrices ? <button role="tab" aria-selected={tab === 'prices'} type="button"
          onClick={() => { setTab('prices'); setNotice(null) }}
          className={`rounded-md px-4 py-2 text-[12px] font-semibold ${tab === 'prices' ? 'bg-white text-[#265ccd] shadow-sm' : 'text-[#63758c]'}`}>
          Concurrentieprijzen
        </button> : null}
      </div>
      <span className="text-[12px] font-medium text-[#416b9d]">{marketName}</span>
    </div>
    {notice ? <p role={notice.ok ? 'status' : 'alert'} className={`rounded-lg px-4 py-3 text-[12px] ${notice.ok ? 'bg-[#eaf8f0] text-[#1f7548]' : 'bg-[#fff0f1] text-[#a83f4b]'}`}>{notice.text}</p> : null}
    {tab === 'feeds' && canReadFeeds ? <section className="ps-panel overflow-hidden" role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf3] px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#20344b]">Productgegevens</h2>
          <p className="mt-1 text-[12px] text-[#738298]">Kies per gekoppelde URL feed de planning of synchroniseer direct.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/feeds" className="secondary-action text-[12px]">Feed toevoegen</Link>
          <Link href="/instellingen/feedbeheer" className="secondary-action text-[12px]">Alle feedinstellingen</Link>
        </div>
      </div>
      <div className="divide-y divide-[#e7edf3]">
        {feeds.map(feed => <div key={feed.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-[190px] flex-1">
            <p className="text-[13px] font-semibold text-[#263b53]">{feed.name}</p>
            <p className="mt-1 text-[11px] text-[#738298]">{feed.countryCode} · {feed.sourceType === 'URL' ? 'URL feed' : feed.sourceType} · {feed.lastItemCount} regels</p>
          </div>
          <div className="min-w-[180px] text-[11px] text-[#63758c]">
            <p className="font-medium text-[#34495f]">{!feed.isActive ? 'Inactief' : feed.lastRunStatus === 'RUNNING' ? 'Bezig' : feed.lastRunStatus === 'FAILED' ? 'Controle nodig' : feed.lastRunStatus === 'COMPLETED' ? 'Gesynchroniseerd' : 'Nog niet gesynchroniseerd'}</p>
            <p>Laatste: {formattedDate(feed.lastRunAt)}</p>
            {feed.syncError ? <p className="mt-1 text-rose-700" role="alert">{feed.syncError}</p> : null}
          </div>
          <label className="min-w-[175px] text-[11px] font-medium text-[#53647b]">
            Synchronisatie
            <select aria-label={`Synchronisatiefrequentie voor ${feed.name}`} value={feed.syncFrequencyHours}
              onChange={event => void saveFeed(feed, Number(event.target.value))}
              disabled={!canWriteFeeds || feed.sourceType !== 'URL' || !feed.isActive || feed.lastRunStatus === 'RUNNING' || Boolean(busy)}
              className="toolbar-control mt-1 w-full">
              {feedFrequencies.map(([hours, label]) => <option value={hours} key={hours}>{label}</option>)}
            </select>
          </label>
          {feed.sourceType === 'URL' ? <button type="button" onClick={() => void syncFeed(feed)}
            disabled={!canWriteFeeds || !feed.isActive || feed.lastRunStatus === 'RUNNING' || Boolean(busy)}
            className="primary-action min-w-[125px] disabled:opacity-50">
            {busy === feed.id || feed.lastRunStatus === 'RUNNING' ? 'Bezig…' : 'Nu synchroniseren'}
          </button> : <Link href={feed.sourceType === 'SYNTRX' ? '/integraties' : '/feeds'} className="secondary-action">Via bron bijwerken</Link>}
        </div>)}
        {!feeds.length ? <p className="p-6 text-[12px] text-[#738298]">Geen productfeeds voor deze markt. <Link href="/feeds" className="text-[#2f6edb] underline">Voeg een feed toe</Link>.</p> : null}
      </div>
      <p className="border-t border-[#e7edf3] px-5 py-3 text-[11px] text-[#738298]">URL feeds worden volgens hun ingestelde frequentie opgehaald. Handmatige invoer en Syntrx synchroniseer je vanuit de bijbehorende bron.</p>
    </section> : null}
    {tab === 'prices' && canReadPrices ? <section className="ps-panel overflow-hidden" role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf3] px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#20344b]">Concurrentieprijzen</h2>
          <p className="mt-1 text-[12px] text-[#738298]">Controlefrequentie per concurrent, prijsmetingen binnen de gekozen markt.</p>
        </div>
        <button type="button" onClick={() => void syncPrices()} disabled={!canWritePrices || Boolean(busy)}
          className="primary-action disabled:opacity-50">{busy === 'prices' ? 'Controleren…' : 'Nu prijzen controleren'}</button>
      </div>
      <div className="divide-y divide-[#e7edf3]">
        {competitors.map(competitor => <div key={competitor.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-[190px] flex-1">
            <p className="text-[13px] font-semibold text-[#263b53]">{competitor.name}</p>
            <p className="mt-1 text-[11px] text-[#738298]">{competitor.offerCount} prijsbronnen · {competitor.isActive ? 'Actief' : 'Inactief'} · Laatst: {formattedDate(competitor.lastCheckedAt)}</p>
          </div>
          <label className="min-w-[185px] text-[11px] font-medium text-[#53647b]">
            Controlefrequentie
            <select aria-label={`Controlefrequentie voor ${competitor.name}`} value={competitor.frequency}
              onChange={event => void saveCompetitor(competitor, Number(event.target.value))}
              disabled={!canEditCompetitors || !competitor.isActive || Boolean(busy)} className="toolbar-control mt-1 w-full">
              {priceFrequencies.map(([hours, label]) => <option value={hours} key={hours}>{label}</option>)}
            </select>
          </label>
          <Link href={`/concurrenten/${competitor.id}`} className="secondary-action text-[12px]">Bekijken</Link>
        </div>)}
        {!competitors.length ? <p className="p-6 text-[12px] text-[#738298]">Nog geen concurrenten voor deze markt. <Link href="/concurrenten" className="text-[#2f6edb] underline">Concurrent toevoegen</Link>.</p> : null}
      </div>
      <p className="border-t border-[#e7edf3] px-5 py-3 text-[11px] text-[#738298]">Per handmatige opdracht worden maximaal 8 gekoppelde bronnen gecontroleerd. De bestaande automatische prijsmonitoring blijft per concurrent actief.</p>
    </section> : null}
  </div>
}
