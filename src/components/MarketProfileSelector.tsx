'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function MarketProfileSelector({
  countries,
  value,
  allowAll = false,
  compact = false,
  paramName = 'land',
}: {
  countries: Array<{ id: string; name: string }>
  value?: string | null
  allowAll?: boolean
  compact?: boolean
  paramName?: 'land' | 'markt'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function changeMarket(countryId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (countryId) params.set(paramName, countryId)
    else params.delete(paramName)
    params.delete('pagina')
    for (const key of ['prijs', 'bron', 'controle', 'broncontrole', 'crawlstatus', 'suggesties', 'gevonden', 'algekoppeld', 'zoekbron', 'zoekmodus', 'reden', 'concurrent']) {
      params.delete(key)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <label className={`flex items-center gap-2 text-[10px] font-semibold text-[#617288] ${compact ? '' : 'flex-wrap'}`}>
      <span className="whitespace-nowrap">Marktprofiel</span>
      <select
        value={value ?? ''}
        onChange={(event) => changeMarket(event.target.value)}
        className={`toolbar-control ${compact ? 'min-w-[145px]' : 'min-w-[160px]'}`}
      >
        {allowAll ? <option value="">Alle markten</option> : null}
        {countries.map((country) => (
          <option key={country.id} value={country.id}>{country.name}</option>
        ))}
      </select>
    </label>
  )
}
