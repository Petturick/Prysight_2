'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const routes = [
  '/dashboard',
  '/producten',
  '/concurrenten',
  '/productmatches',
  '/waarschuwingen',
  '/prijsstrategie',
  '/rapportages',
  '/feeds',
  '/import',
  '/integraties',
  '/beheer',
]

export function RoutePrefetcher() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const prefetch = () => {
      if (cancelled) return
      for (const route of routes) router.prefetch(route)
    }

    const win = window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number; cancelIdleCallback?: (id: number) => void }
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(prefetch, { timeout: 1200 })
      return () => {
        cancelled = true
        win.cancelIdleCallback?.(id)
      }
    }

    const id = window.setTimeout(prefetch, 250)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [router])

  return null
}
