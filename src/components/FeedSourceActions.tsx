'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FeedSourceActions({ id, isActive, canSync = true }: { id: string; isActive: boolean; canSync?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  const call = async (action: 'sync' | 'toggle' | 'delete') => {
    if (busy) return
    setBusy(action)
    try {
      const response = action === 'sync'
        ? await fetch(`/api/feeds/${id}/sync`, { method: 'POST' })
        : action === 'toggle'
          ? await fetch(`/api/feeds/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) })
          : await fetch(`/api/feeds/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Actie mislukt.' })) as { error?: string }
        throw new Error(result.error || 'Actie mislukt.')
      }
      router.refresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Actie mislukt.')
    } finally {
      setBusy(null)
    }
  }

  return <div className="flex flex-wrap gap-2">{canSync && <button type="button" onClick={() => void call('sync')} disabled={Boolean(busy)} className="rounded-lg border border-[#d7e4ff] bg-[var(--blue-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--blue)] disabled:opacity-50">{busy === 'sync' ? 'Synchroniseren…' : 'Nu synchroniseren'}</button>}<button type="button" onClick={() => void call('toggle')} disabled={Boolean(busy)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[#697386]">{isActive ? 'Pauzeren' : 'Activeren'}</button><button type="button" onClick={() => void call('delete')} disabled={Boolean(busy)} className="rounded-lg border border-[#ffd9de] px-2.5 py-1.5 text-[10px] font-medium text-[#b4233d]">Verwijderen</button></div>
}
