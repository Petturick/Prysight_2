'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const coreRoutes = ['/dashboard', '/producten', '/concurrenten', '/productmatches', '/waarschuwingen']
const secondaryRoutes = ['/prijsstrategie', '/rapportages', '/feeds', '/import', '/integraties', '/instellingen']

export function RoutePrefetcher() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    for (const route of coreRoutes) router.prefetch(route)

    const prefetchSecondary = () => {
      if (cancelled) return
      for (const route of secondaryRoutes) router.prefetch(route)
    }

    const win = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(prefetchSecondary, { timeout: 650 })
      return () => {
        cancelled = true
        win.cancelIdleCallback?.(id)
      }
    }

    const id = window.setTimeout(prefetchSecondary, 120)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [router])

  return null
}
