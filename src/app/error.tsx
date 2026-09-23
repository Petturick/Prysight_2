'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('PrySight page render failed', error)
  }, [error])

  return (
    <div role="alert" className="mx-auto max-w-3xl rounded-[12px] border border-[#e2e7ee] bg-white p-6 shadow-[0_2px_9px_rgba(31,49,77,.045)]">
      <div className="flex items-start gap-4">
        <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#fff3e5] text-[#986020]">!</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[#986020]">Pagina tijdelijk niet beschikbaar</p>
          <h1 className="mt-2 text-[22px] font-bold tracking-[-.025em] text-[#17233a]">Het laden is niet gelukt</h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#596a80]">
            Deze pagina kon niet worden geopend. Je kunt het veilig opnieuw proberen, daarbij worden geen gegevens gewijzigd.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={reset} className="primary-action">Opnieuw proberen</button>
            <Link href="/dashboard" className="secondary-action">Terug naar overzicht</Link>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-[#718096]">
            Blijft dit gebeuren? Meld het bij de beheerder{error.digest ? ` en geef foutcode ${error.digest} door` : ''}.
          </p>
        </div>
      </div>
    </div>
  )
}
