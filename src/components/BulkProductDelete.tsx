'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function BulkProductDelete({ productIds }: { productIds: string[] }) {
  const router = useRouter()
  const [allSelected, setAllSelected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!productIds.length) return null

  async function removeAllVisible() {
    if (!allSelected || busy) return
    if (!window.confirm(`Weet je zeker dat je alle ${productIds.length} geselecteerde producten wilt verwijderen?`)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/producten/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Bulkverwijdering is mislukt.')
      setAllSelected(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulkverwijdering is mislukt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#dfe5ed] bg-white px-4 py-3">
      <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-black text-[#34445b]">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => setAllSelected(event.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[var(--blue)]"
        />
        Alles selecteren op deze pagina, {productIds.length} producten
      </label>
      <div className="flex items-center gap-3">
        {error ? <span className="text-[10px] font-bold text-[#b4233d]">{error}</span> : null}
        <button
          type="button"
          disabled={!allSelected || busy}
          onClick={removeAllVisible}
          className="rounded-[8px] bg-[#b4233d] px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Verwijderen...' : 'Geselecteerde verwijderen'}
        </button>
      </div>
    </div>
  )
}
