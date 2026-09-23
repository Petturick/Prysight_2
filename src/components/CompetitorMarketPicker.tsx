'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

type Market = { id: string; code: string; name: string }
export function CompetitorMarketPicker({ countries, selected }: { countries: Market[]; selected: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <label className="flex min-w-[190px] flex-col gap-1 text-[11px] font-semibold text-[#53647a]">
      Markt bekijken
      <select
        name="markt"
        aria-label="Selecteer markt voor concurrenten"
        className="toolbar-control w-full min-w-[190px]"
        value={selected}
        disabled={pending}
        onChange={(event) => {
          const code = event.target.value
          startTransition(() => router.push(code === 'alle' ? '/concurrenten' : `/concurrenten?markt=${encodeURIComponent(code)}`))
        }}
      >
        <option value="alle">Alle actieve markten</option>
        {countries.map((country) => <option key={country.id} value={country.code}>{country.name} ({country.code})</option>)}
      </select>
    </label>
  )
}
