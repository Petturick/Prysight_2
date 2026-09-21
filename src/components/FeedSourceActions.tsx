'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FeedSourceActions({ id, isActive, canSync = true }: { id: string; isActive: boolean; canSync?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const call = async (action: 'sync' | 'toggle' | 'delete') => {
    if (busy) return
    setBusy(action)
    setNotice(null)
    try {
      const response = action === 'sync'
        ? await fetch(`/api/feeds/${id}/sync`, { method: 'POST' })
        : action === 'toggle'
          ? await fetch(`/api/feeds/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) })
          : await fetch(`/api/feeds/${id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({})) as {
        error?: string
        rows?: number
        competitorDiscovery?: { attempted?: number; suggestions?: number; failed?: number; deferred?: number }
      }
      if (!response.ok) throw new Error(result.error || 'Actie mislukt.')

      if (action === 'sync') {
        const discovery = result.competitorDiscovery
        const parts = [
          `${result.rows ?? 0} productregels bijgewerkt`,
          discovery ? `${discovery.suggestions ?? 0} concurrentsuggesties gevonden` : null,
          discovery?.deferred ? `${discovery.deferred} producten worden via achtergrondcontrole verder onderzocht` : null,
        ].filter(Boolean)
        setNotice(parts.join(', ') + '.')
      }
      router.refresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Actie mislukt.')
    } finally {
      setBusy(null)
    }
  }

  return <div><div className="flex flex-wrap gap-2">{canSync && <button type="button" onClick={() => void call('sync')} disabled={Boolean(busy)} className="rounded-lg border border-[#d7e4ff] bg-[var(--blue-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--blue)] disabled:opacity-50">{busy === 'sync' ? 'Synchroniseren en concurrenten zoeken…' : 'Nu synchroniseren'}</button>}<button type="button" onClick={() => void call('toggle')} disabled={Boolean(busy)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[#697386]">{isActive ? 'Pauzeren' : 'Activeren'}</button><button type="button" onClick={() => void call('delete')} disabled={Boolean(busy)} className="rounded-lg border border-[#ffd9de] px-2.5 py-1.5 text-[10px] font-medium text-[#b4233d]">Verwijderen</button></div>{notice ? <p className="mt-2 max-w-[420px] text-[9px] font-medium leading-4 text-[#2a744f]">{notice}</p> : null}</div>
}
