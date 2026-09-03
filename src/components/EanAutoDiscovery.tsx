'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type DiscoveryResult = { found?: number; created?: number; provider?: string; country?: string; skipped?: boolean; reason?: string; error?: string }
type State = 'idle' | 'searching' | 'found' | 'empty' | 'error'

export function EanAutoDiscovery() {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')

  const productId = useMemo(() => {
    const match = pathname.match(/^\/producten\/([^/]+)$/)
    if (!match || match[1] === 'nieuw') return null
    return decodeURIComponent(match[1])
  }, [pathname])

  useEffect(() => {
    if (!productId) return
    const storageKey = `prysight:ean-discovery:${productId}`
    const lastRun = Number(window.localStorage.getItem(storageKey) ?? '0')
    const twelveHours = 12 * 60 * 60 * 1000
    if (lastRun && Date.now() - lastRun < twelveHours) return
    let cancelled = false
    window.localStorage.setItem(storageKey, String(Date.now()))
    queueMicrotask(() => {
      if (cancelled) return
      setState('searching')
      setMessage('AI zoekt automatisch concurrent URLs op basis van EAN…')
    })
    fetch(`/api/producten/${encodeURIComponent(productId)}/discover`, { method: 'POST' })
      .then(async (response) => {
        const data = await response.json() as DiscoveryResult
        if (!response.ok) throw new Error(data.error || 'EAN discovery mislukt')
        return data
      })
      .then((data) => {
        if (cancelled) return
        if (data.skipped) { setState('idle'); return }
        if ((data.created ?? 0) > 0) {
          setState('found')
          setMessage(`${data.created} nieuwe concurrent URL suggestie${data.created === 1 ? '' : 's'} gevonden via ${data.provider ?? 'web search'}.`)
          router.refresh()
          window.setTimeout(() => { if (!cancelled) setState('idle') }, 5500)
          return
        }
        setState('empty')
        setMessage(`EAN gecontroleerd${data.provider ? ` via ${data.provider}` : ''}, geen nieuwe betrouwbare URL suggesties.`)
        window.setTimeout(() => { if (!cancelled) setState('idle') }, 4200)
      })
      .catch((error) => {
        if (cancelled) return
        window.localStorage.removeItem(storageKey)
        setState('error')
        setMessage(error instanceof Error ? error.message : 'EAN discovery mislukt')
        window.setTimeout(() => { if (!cancelled) setState('idle') }, 5000)
      })
    return () => { cancelled = true }
  }, [productId, router])

  if (!productId || state === 'idle') return null

  const tone = state === 'found'
    ? 'border-[#cfeadf] bg-white text-[#21835d]'
    : state === 'error'
      ? 'border-[#f1cfd0] bg-white text-[#c64f52]'
      : state === 'empty'
        ? 'border-[#d6e5fb] bg-white text-[#3d73d4]'
        : 'border-[#d6e5fb] bg-white text-[#3d73d4]'

  return (
    <div className={`fixed bottom-5 right-5 z-[80] max-w-[390px] rounded-[10px] border px-4 py-3 shadow-[0_10px_28px_rgba(31,49,77,.12)] ${tone}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#edf4ff] text-[#3d73d4]">
          {state === 'searching' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <span className="text-[10px] font-bold">AI</span>}
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#718096]">EAN concurrent discovery</p>
          <p className="mt-1 text-[10px] font-medium leading-5 text-[#44546a]">{message}</p>
        </div>
      </div>
    </div>
  )
}
