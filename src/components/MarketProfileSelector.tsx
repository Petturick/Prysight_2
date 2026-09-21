'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function MarketProfileSelector({
  countries,
  value,
}: {
  countries: Array<{ id: string; name: string }>
  value: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function changeMarket(countryId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('land', countryId)
    for (const key of ['prijs', 'bron', 'controle', 'broncontrole', 'crawlstatus', 'suggesties', 'gevonden', 'algekoppeld', 'zoekbron', 'zoekmodus', 'reden', 'concurrent']) {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <label className="flex items-center gap-2 text-[10px] font-semibold text-[#617288]">
      Marktprofiel
      <select
        value={value}
        onChange={(event) => changeMarket(event.target.value)}
        className="toolbar-control min-w-[150px]"
      >
        {countries.map((country) => (
          <option key={country.id} value={country.id}>{country.name}</option>
        ))}
      </select>
    </label>
  )
}
