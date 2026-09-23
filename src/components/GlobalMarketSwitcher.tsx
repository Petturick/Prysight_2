'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Market = { id: string; code: string; name: string }
type MarketResponse = { selected: string; markets: Market[]; error?: string }

export function GlobalMarketSwitcher() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [selected, setSelected] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetch('/api/markten/context', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Markten konden niet worden opgehaald.')
        return response.json() as Promise<MarketResponse>
      })
      .then(result => {
        if (!cancelled) {
          setMarkets(result.markets)
          setSelected(result.selected)
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) { setError('Markten niet beschikbaar'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  async function changeMarket(code: string) {
    if (saving || code === selected) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/markten/context', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const result = await response.json() as { selected?: string; error?: string }
      if (!response.ok || result.selected !== code) throw new Error(result.error || 'Markt kon niet worden gewijzigd.')
      setSelected(code)
      const query = new URLSearchParams(searchParams.toString())
      query.delete('pagina')
      if (pathname === '/concurrenten') {
        if (code === 'ALL') query.delete('markt')
        else query.set('markt', code)
      } else {
        // Discard stale page-specific market filters when switching centrally.
        query.delete('markt')
      }
      if (pathname === '/producten') {
        const countryId = markets.find(market => market.code === code)?.id
        if (countryId) query.set('land', countryId)
        else query.delete('land')
        query.delete('concurrent')
      } else {
        query.delete('land')
      }
      router.push(`${pathname}${query.size ? `?${query.toString()}` : ''}`)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Markt kon niet worden gewijzigd.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="flex min-w-0 flex-col gap-0.5">
    <label htmlFor="prysight-global-market" className="text-[10px] font-semibold text-[#748296]">Actieve markt</label>
    <select id="prysight-global-market" aria-label="Actieve markt voor producten, concurrenten en synchronisatie"
      value={selected} onChange={event => void changeMarket(event.target.value)} disabled={saving || loading || Boolean(error && markets.length === 0)}
      className="toolbar-control h-9 min-w-[122px] max-w-[190px] text-[12px]">
      <option value="ALL">Alle markten</option>
      {markets.map(market => <option key={market.id} value={market.code}>{market.name}</option>)}
    </select>
    {error ? <span role="alert" className="max-w-[200px] text-[10px] text-rose-700">{error}</span> : null}
  </div>
}
