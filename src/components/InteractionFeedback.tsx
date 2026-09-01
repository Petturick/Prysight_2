'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function InteractionFeedback() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [pathname])

  useEffect(() => {
    const startLoading = () => {
      setLoading(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setLoading(false), 12000)
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      const interactive = target?.closest('button, a[href], [role="button"]')
      if (!interactive) return
      if ('vibrate' in navigator) navigator.vibrate?.(8)
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const link = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return
      startLoading()
    }

    const onSubmit = () => startLoading()

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!loading) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999]" role="status" aria-live="polite" aria-label="Prysight is bezig">
      <div className="h-1 w-full overflow-hidden bg-blue-100/80">
        <div className="prysight-loading-bar h-full w-1/3 bg-[#2458ff]" />
      </div>
      <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#2458ff]/25 border-t-[#2458ff]" />
        Laden…
      </div>
    </div>
  )
}
