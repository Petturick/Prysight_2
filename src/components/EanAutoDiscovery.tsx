'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type DiscoveryResult = {
  found?: number
  created?: number
  provider?: string
  country?: string
  skipped?: boolean
  reason?: string
  error?: string
}

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
        if (data.skipped) {
          setState('idle')
          return
        }
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
    ? 'border-[#0d7a49] bg-[#d9f0e4] text-[#075d38]'
    : state === 'error'
      ? 'border-[#b4233d] bg-[#f6d7dd] text-[#8e1d32]'
      : state === 'empty'
        ? 'border-[#2457d6] bg-[#dfe8ff] text-[#1b43a6]'
        : 'border-[#5b2be8] bg-[#e4dcff] text-[#4320b8]'

  return (
    <div className={`fixed bottom-5 right-5 z-[80] max-w-[390px] rounded-[14px] border-2 px-4 py-3 shadow-[0_18px_40px_rgba(20,31,55,.2)] ${tone}`}>
      <div className="flex items-center gap-3">
        {state === 'searching' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <span className="text-[15px] font-black">AI</span>}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.08em]">EAN concurrent discovery</p>
          <p className="mt-1 text-[11px] font-bold leading-5">{message}</p>
        </div>
      </div>
    </div>
  )
}
