'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Quiet route feedback for a premium B2B workflow.
 * Fast interactions should feel instant, slower navigation gets a subtle progress rail.
 * No haptics or floating loading toast that competes with business content.
 */
export function InteractionFeedback() {
  const [visible, setVisible] = useState(false)
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clear = () => {
      if (delayRef.current) clearTimeout(delayRef.current)
      if (safetyRef.current) clearTimeout(safetyRef.current)
      delayRef.current = null
      safetyRef.current = null
      setVisible(false)
    }

    const start = () => {
      if (delayRef.current) clearTimeout(delayRef.current)
      if (safetyRef.current) clearTimeout(safetyRef.current)
      // Avoid visual noise for navigation that completes almost instantly.
      delayRef.current = setTimeout(() => setVisible(true), 180)
      safetyRef.current = setTimeout(clear, 12000)
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const link = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return
      start()
    }

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null
      if (form?.dataset.noGlobalLoading === 'true') return
      start()
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    window.addEventListener('pageshow', clear)
    window.addEventListener('popstate', clear)

    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
      window.removeEventListener('pageshow', clear)
      window.removeEventListener('popstate', clear)
      clear()
    }
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999]" role="status" aria-live="polite" aria-label="Pagina laden">
      <div className="h-[3px] w-full overflow-hidden bg-[#dbe7f8]/70">
        <div className="prysight-loading-bar h-full w-1/3 bg-[#4f86e8]" />
      </div>
    </div>
  )
}
