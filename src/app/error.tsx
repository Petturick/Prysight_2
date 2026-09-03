'use client'

import { useEffect } from 'react'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="mx-auto max-w-3xl rounded-[10px] border border-[#e2e7ee] bg-white p-6 shadow-[0_2px_9px_rgba(31,49,77,.045)]">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#fff0f0] text-[#ee6769]">!</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[#c64f52]">Onderdeel tijdelijk niet beschikbaar</p>
          <h1 className="mt-2 text-[24px] font-bold tracking-[-.025em] text-[#17233a]">De pagina kon de database niet bereiken</h1>
          <p className="mt-3 max-w-2xl text-[12px] leading-6 text-[#718096]">De navigatie blijft beschikbaar. Probeer de pagina opnieuw zodra de databaseverbinding is hersteld.</p>
          {error.digest && <p className="mt-3 text-[10px] text-[#8a97a9]">Foutcode {error.digest}</p>}
          <button onClick={reset} className="primary-action mt-5">Opnieuw proberen</button>
        </div>
      </div>
    </div>
  )
}
