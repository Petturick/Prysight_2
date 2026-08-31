'use client'

import { useEffect } from 'react'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-700">Onderdeel tijdelijk niet beschikbaar</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">De pagina kon de database niet bereiken</h1>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        De navigatie blijft beschikbaar. Probeer de pagina opnieuw zodra de databaseverbinding is hersteld.
      </p>
      {error.digest && <p className="mt-3 text-xs text-slate-500">Foutcode {error.digest}</p>}
      <button onClick={reset} className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white">
        Opnieuw proberen
      </button>
    </div>
  )
}
